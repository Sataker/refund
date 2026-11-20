import 'server-only';
import { type Db, schema } from '@refund/db';
import {
  ChainedCnpj,
  CNPJ_SOURCES,
  type CnpjProvider,
  CnpjProviderGuard,
  type DataMode,
  type ExternalCachePort,
  LiveCnpj,
  type ProviderHealth,
  ReplayCnpj,
} from '@refund/sources';
import { and, eq } from 'drizzle-orm';
import { REPLAY_COMPANIES } from './replay-companies.ts';

// ARCHITECTURE §4.3 chain (six public sources since E21, 20/11/2026): fresh `external_cache` → BrasilAPI
// → OpenCNPJ → CNPJá → minhareceita → CNPJ.ws → ReceitaWS → expired `external_cache` → replay (persona
// CNPJ). In `replay` mode (CI, local, backup, /demo) only the replay provider answers: no network at all.

/**
 * 7 days fresh; the daily cleanup deletes an entry 7 days after it expires (SCHEMA §6), so a copy lives
 * at most 14 days: the "até 14 dias" promised on /privacidade.
 */
const CNPJ_CACHE_TTL_MS = 7 * 24 * 60 * 60_000;

/** `external_cache` as the sources' cache port. The payload is already the whitelisted company. */
export function externalCachePort(db: Db): ExternalCachePort {
  const t = schema.externalCache;
  return {
    async get(source, key) {
      const [row] = await db
        .select()
        .from(t)
        .where(and(eq(t.source, source), eq(t.key, key)))
        .limit(1);
      return row
        ? {
            payload: row.payload,
            fetchedAt: row.fetchedAt.toISOString(),
            expiresAt: row.expiresAt.toISOString(),
          }
        : null;
    },
    async set(source, key, payload, fetchedAt) {
      const at = new Date(fetchedAt);
      const values = {
        source,
        key,
        payload,
        fetchedAt: at,
        expiresAt: new Date(at.getTime() + CNPJ_CACHE_TTL_MS),
      };
      await db
        .insert(t)
        .values(values)
        .onConflictDoUpdate({
          target: [t.source, t.key],
          set: { payload, fetchedAt: values.fetchedAt, expiresAt: values.expiresAt },
        });
    },
  };
}

export function replayCnpj(): CnpjProvider {
  return new ReplayCnpj({ companies: REPLAY_COMPANIES });
}

/**
 * One breaker and pacing state per server process, shared by every lookup and read by the health. Kept
 * on `globalThis`: Next bundles each route on its own, so a plain module constant would give the health
 * route a different (always empty) instance than the server action that runs the lookups.
 */
const GUARD_KEY = Symbol.for('refund.cnpjProviderGuard');
const holder = globalThis as typeof globalThis & { [GUARD_KEY]?: CnpjProviderGuard };
holder[GUARD_KEY] ??= new CnpjProviderGuard();
const guard: CnpjProviderGuard = holder[GUARD_KEY];

/**
 * The six live sources. BrasilAPI's own retry is off here: the next source is a better retry than the
 * same one 4 s later, and the whole walk must fit a live demo.
 */
const LIVE = CNPJ_SOURCES.map((spec) =>
  spec.source === 'brasilapi' ? new LiveCnpj(spec, { retries: 0 }) : new LiveCnpj(spec),
);

/**
 * Dev-only switch to rehearse an outage (`CNPJ_SKIP_PROVIDERS=brasilapi,opencnpj`). Same guard as
 * LOCAL_DEV_PLAN: ignored unless NODE_ENV is 'development' and the code is not on Vercel, so it can never
 * silence a source on a deploy.
 */
export function skippedSources(env: NodeJS.ProcessEnv = process.env): string[] {
  if (env.NODE_ENV !== 'development' || env.VERCEL === '1') return [];
  return (env.CNPJ_SKIP_PROVIDERS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => CNPJ_SOURCES.some((spec) => spec.source === s));
}

export function cnpjProvider(db: Db, mode: DataMode): CnpjProvider {
  const replay = replayCnpj();
  if (mode === 'replay') return replay;
  return new ChainedCnpj({
    live: LIVE,
    cache: externalCachePort(db),
    replay,
    guard,
    skip: skippedSources(),
  });
}

/** Deep health: what this process has seen of each source (state and error code only). */
export function cnpjSourcesHealth(): ProviderHealth[] {
  const skipped = new Set(skippedSources());
  return guard
    .snapshot(CNPJ_SOURCES)
    .map((h) => (skipped.has(h.source) ? { ...h, state: 'down' as const } : h));
}
