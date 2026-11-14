// System tables (SCHEMA §2.9, §6 technical cleanup) and the deep-health probes (ARCHITECTURE §10.2).
import { and, isNotNull, lt, sql } from 'drizzle-orm';
import journal from '../../migrations/meta/_journal.json' with { type: 'json' };
import type { Db } from '../client.ts';
import { externalCache, systemEvents, systemHeartbeat, webhookEvents } from '../schema/index.ts';

/** Number of migrations bundled with this build (`_journal.json`), compared by the deep health. */
export const EXPECTED_MIGRATIONS: number = journal.entries.length;

export type HeartbeatOrigin = 'migration' | 'health' | 'cron' | 'gh-actions';

/** Normalizes `db.execute()` across drivers (postgres-js returns the rows, PGlite `{ rows }`). */
function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: unknown }).rows;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

/** Real write on every deep health / cron: keeps Supabase Free awake (ARCHITECTURE §10.4). */
export async function touchHeartbeat(db: Db, origin: HeartbeatOrigin): Promise<Date> {
  const [row] = await db
    .insert(systemHeartbeat)
    .values({ id: 1, origin })
    .onConflictDoUpdate({ target: systemHeartbeat.id, set: { seenAt: sql`now()`, origin } })
    .returning({ seenAt: systemHeartbeat.seenAt });
  if (!row) throw new Error('touchHeartbeat: no row returned');
  return row.seenAt;
}

/** Rows in `drizzle.__drizzle_migrations` (written by both migrators). */
export async function appliedMigrations(db: Db): Promise<number> {
  const result = await db.execute(
    sql`SELECT count(*)::int AS n FROM "drizzle"."__drizzle_migrations"`,
  );
  const [row] = rowsOf<{ n: number | string }>(result);
  return Number(row?.n ?? 0);
}

/** `pg_database_size` of the current database, in bytes (Supabase Free: 500 MB; SCHEMA §7). */
export async function databaseSizeBytes(db: Db): Promise<number> {
  const result = await db.execute(sql`SELECT pg_database_size(current_database())::bigint AS b`);
  const [row] = rowsOf<{ b: number | string }>(result);
  return Number(row?.b ?? 0);
}

export interface SystemEventInput {
  level: 'warn' | 'error';
  event: string;
  route?: string | null;
  requestId?: string | null;
  /** Already redacted by the logger. */
  context?: unknown;
}

export async function insertSystemEvent(db: Db, input: SystemEventInput): Promise<void> {
  await db.insert(systemEvents).values({
    level: input.level,
    event: input.event.slice(0, 60),
    route: input.route?.slice(0, 200) ?? null,
    requestId: input.requestId?.slice(0, 120) ?? null,
    context: input.context ?? null,
  });
}

export interface TechnicalCleanup {
  systemEvents: number;
  externalCache: number;
  webhookPayloads: number;
}

/**
 * Technical cleanup (SCHEMA §6): system_events > 14 days, external_cache expired > 7 days ago,
 * webhook payloads > 30 days (metadata stays). rate_limits has its own function.
 */
export async function cleanupTechnical(db: Db): Promise<TechnicalCleanup> {
  const events = await db
    .delete(systemEvents)
    .where(lt(systemEvents.createdAt, sql`now() - interval '14 days'`))
    .returning({ id: systemEvents.id });
  const cache = await db
    .delete(externalCache)
    .where(lt(externalCache.expiresAt, sql`now() - interval '7 days'`))
    .returning({ key: externalCache.key });
  const payloads = await db
    .update(webhookEvents)
    .set({ payload: null })
    .where(
      and(
        isNotNull(webhookEvents.payload),
        lt(webhookEvents.receivedAt, sql`now() - interval '30 days'`),
      ),
    )
    .returning({ id: webhookEvents.id });
  return {
    systemEvents: events.length,
    externalCache: cache.length,
    webhookPayloads: payloads.length,
  };
}
