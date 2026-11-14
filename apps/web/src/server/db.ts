import 'server-only';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createDb, createMemoryDb, type DbHandle, seedReference } from '@refund/db';
import { regulations } from '@refund/law';
import { capabilitiesFrom } from './capabilities.ts';
import { readEnv } from './env.ts';

// SCHEMA §3: ONE instance per process (globalThis survives dev HMR), created on demand.
// DATABASE_URL (+ secrets) → postgres-js; otherwise, outside production → PGlite; otherwise none.

type GlobalWithDb = typeof globalThis & { __refundDb?: Promise<DbHandle | null> | undefined };
const g = globalThis as GlobalWithDb;

/** `next dev` runs with cwd = apps/web; Vitest with cwd = the repo root. */
export function migrationsFolder(cwd: string = process.cwd()): string | null {
  for (const dir of [
    join(cwd, 'packages/db/migrations'),
    join(cwd, '../../packages/db/migrations'),
  ]) {
    if (existsSync(join(dir, 'meta/_journal.json'))) return dir;
  }
  return null;
}

async function open(): Promise<DbHandle | null> {
  const env = readEnv();
  const caps = capabilitiesFrom(env);
  if (caps.database && env.values.DATABASE_URL) {
    return createDb({ url: env.values.DATABASE_URL, ssl: env.values.DB_SSL !== 'disable' });
  }
  if (caps.memoryDatabase) {
    const folder = migrationsFolder();
    if (!folder) return null;
    const handle = await createMemoryDb({ migrationsFolder: folder });
    await seedReference(
      handle.db,
      regulations.map((r) => ({ id: r.id, url: r.url })),
    );
    return handle;
  }
  return null;
}

/** The process database, or null when this deployment has none (backup, zero env in production). */
export function getDb(): Promise<DbHandle | null> {
  if (!g.__refundDb) {
    g.__refundDb = open().catch((err: unknown) => {
      g.__refundDb = undefined; // next call retries (e.g. Supabase waking up)
      throw err;
    });
  }
  return g.__refundDb;
}

/** The instance only if something already opened it (the logger must never open the database). */
export function peekDb(): Promise<DbHandle | null> | undefined {
  return g.__refundDb;
}

/** Tests only: closes and forgets the process instance. */
export async function resetDb(): Promise<void> {
  const current = g.__refundDb;
  g.__refundDb = undefined;
  const handle = await current?.catch(() => null);
  await handle?.close();
}
