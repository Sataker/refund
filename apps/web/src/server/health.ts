import 'server-only';
import {
  appliedMigrations,
  type DbHandle,
  databaseSizeBytes,
  EXPECTED_MIGRATIONS,
  touchHeartbeat,
} from '@refund/db';
import type { ProviderHealth } from '@refund/sources';
import { type DemoHealth, demoHealth } from '@/demo/health.ts';
import { type BasicHealth, basicHealth, type HealthStatus } from '@/lib/health.ts';
import { type Capabilities, capabilitiesFrom } from './capabilities.ts';
import { cnpjSourcesHealth } from './company/providers.ts';
import { getDb } from './db.ts';
import { readEnv } from './env.ts';
import { logger } from './log.ts';

// ARCHITECTURE §10.2 (ADR-011). failed (503): deep and the configured database is unreachable or has
// FEWER migrations than the bundled journal (the build expects a column that is not there).
// degraded (200): a malformed variable, a database configured without its secrets, the database
// AHEAD of the build (the normal window of SCHEMA §4.1: migrate before the merge, additive only),
// or the database above 400 MB (SCHEMA §7). The demo (§7.4, §10.2): it does not assemble or a screen moved a video
// number → failed; a missing AI recording → degraded (the demo still explains, with the template).

export const DB_SIZE_ALERT_BYTES = 400 * 1024 * 1024;

export interface DatabaseCheck {
  ok: boolean;
  ms: number;
  driver?: DbHandle['driver'];
  migrations?: { applied: number; expected: number };
  heartbeat?: string;
  reason?:
    | 'not_configured'
    | 'missing_secrets'
    | 'unreachable'
    | 'migrations_behind'
    | 'migrations_ahead';
}

export interface HealthReport extends BasicHealth {
  capabilities: Capabilities;
  demo: DemoHealth | { personas: 0; recordingsComplete: false; videoNumbers: 'unavailable' };
  /** Malformed variables: names and reasons only. */
  problems?: { name: string; reason: string }[];
  /**
   * `cnpjSources` (E21): what this server instance has seen of each public CNPJ source (state and
   * error code only). Informational: a source down never changes the status, the chain has five more.
   */
  checks?: { database: DatabaseCheck; cnpjSources: ProviderHealth[] };
}

const RANK: Record<HealthStatus, number> = { ok: 0, degraded: 1, failed: 2 };
const worst = (a: HealthStatus, b: HealthStatus): HealthStatus => (RANK[b] > RANK[a] ? b : a);

export async function checkDatabase(
  open: () => Promise<DbHandle | null> = getDb,
): Promise<{ check: DatabaseCheck; status: HealthStatus }> {
  const env = readEnv();
  const started = performance.now();
  const ms = () => Math.round(performance.now() - started);
  let handle: DbHandle | null;
  try {
    handle = await open();
  } catch (err) {
    logger.error('health.database', { reason: 'unreachable', error: err });
    return { check: { ok: false, ms: ms(), reason: 'unreachable' }, status: 'failed' };
  }
  if (!handle) {
    // The backup deployment has no database on purpose; a URL without its secrets is a mistake.
    const misconfigured = env.present.has('DATABASE_URL');
    return {
      check: { ok: false, ms: ms(), reason: misconfigured ? 'missing_secrets' : 'not_configured' },
      status: misconfigured ? 'degraded' : 'ok',
    };
  }
  try {
    const seen = await touchHeartbeat(handle.db, 'health');
    const applied = await appliedMigrations(handle.db);
    const size = await databaseSizeBytes(handle.db);
    const migrations = { applied, expected: EXPECTED_MIGRATIONS };
    const behind = applied < EXPECTED_MIGRATIONS;
    const ahead = applied > EXPECTED_MIGRATIONS;
    const check: DatabaseCheck = {
      ok: !behind,
      ms: ms(),
      driver: handle.driver,
      migrations,
      heartbeat: seen.toISOString(),
      ...(behind ? { reason: 'migrations_behind' as const } : {}),
      ...(ahead ? { reason: 'migrations_ahead' as const } : {}),
    };
    const status: HealthStatus = behind
      ? 'failed'
      : ahead || size > DB_SIZE_ALERT_BYTES
        ? 'degraded'
        : 'ok';
    return { check, status };
  } catch (err) {
    logger.error('health.database', { reason: 'unreachable', error: err });
    return { check: { ok: false, ms: ms(), reason: 'unreachable' }, status: 'failed' };
  }
}

export async function checkDemo(
  read: () => Promise<DemoHealth> = demoHealth,
): Promise<{ demo: HealthReport['demo']; status: HealthStatus }> {
  try {
    const demo = await read();
    const status: HealthStatus =
      demo.personas === 0 || demo.videoNumbers !== 'ok'
        ? 'failed'
        : demo.recordingsComplete
          ? 'ok'
          : 'degraded';
    return { demo, status };
  } catch (err) {
    logger.error('health.demo', { reason: 'unavailable', error: err });
    return {
      demo: { personas: 0, recordingsComplete: false, videoNumbers: 'unavailable' },
      status: 'failed',
    };
  }
}

export async function healthReport(options: {
  deep: boolean;
}): Promise<{ httpStatus: number; body: HealthReport }> {
  const env = readEnv();
  const base = basicHealth({
    VERCEL_GIT_COMMIT_SHA: env.values.VERCEL_GIT_COMMIT_SHA,
    VERCEL_ENV: env.values.VERCEL_ENV,
    REFUND_BUILT_AT: process.env.REFUND_BUILT_AT,
  });
  let status: HealthStatus = base.status;
  const demo = await checkDemo();
  status = worst(status, demo.status);
  const body: HealthReport = { ...base, capabilities: capabilitiesFrom(env), demo: demo.demo };
  if (env.problems.length > 0) {
    status = worst(status, 'degraded');
    body.problems = env.problems.map((p) => ({ name: p.name, reason: p.reason }));
  }
  if (options.deep) {
    const db = await checkDatabase();
    status = worst(status, db.status);
    body.checks = { database: db.check, cnpjSources: cnpjSourcesHealth() };
  }
  body.status = status;
  return { httpStatus: status === 'failed' ? 503 : 200, body };
}
