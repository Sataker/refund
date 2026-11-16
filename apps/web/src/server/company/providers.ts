import 'server-only';
import { type Db, schema } from '@refund/db';
import {
  BrasilApiCnpj,
  ChainedCnpj,
  type CnpjProvider,
  CnpjWsCnpj,
  type DataMode,
  type ExternalCachePort,
  ReplayCnpj,
} from '@refund/sources';
import { and, eq } from 'drizzle-orm';
import { REPLAY_COMPANIES } from './replay-companies.ts';

// ARCHITECTURE §4.3 chain: BrasilAPI → CNPJ.ws → expired `external_cache` → replay (persona CNPJ).
// In `replay` mode (CI, local, backup) only the replay provider answers: no network at all.

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

export function cnpjProvider(db: Db, mode: DataMode): CnpjProvider {
  const replay = replayCnpj();
  if (mode === 'replay') return replay;
  return new ChainedCnpj({
    live: [new BrasilApiCnpj(), new CnpjWsCnpj()],
    cache: externalCachePort(db),
    replay,
  });
}
