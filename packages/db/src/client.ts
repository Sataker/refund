// SCHEMA §3. Both drivers are imported dynamically: production never loads the PGlite WASM, and the
// zero-env build never opens a socket.
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema/index.ts';

export type Schema = typeof schema;
/** Common base of the postgres-js and PGlite databases; repositories only use this surface. */
export type Db = PgDatabase<PgQueryResultHKT, Schema>;

export interface DbHandle {
  db: Db;
  driver: 'postgres' | 'pglite';
  close(): Promise<void>;
}

export interface CreateDbOptions {
  url: string;
  /** false only on the CI's local Postgres (DB_SSL=disable); Supabase always with TLS. */
  ssl?: boolean;
  /** Pool size per process (serverless: small). */
  max?: number;
}

/** Production: Supabase pooler in transaction mode (port 6543), hence `prepare: false`. */
export async function createDb(options: CreateDbOptions): Promise<DbHandle> {
  const { default: postgres } = await import('postgres');
  const { drizzle } = await import('drizzle-orm/postgres-js');
  const client = postgres(options.url, {
    prepare: false,
    max: options.max ?? 5,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: options.ssl === false ? false : 'require',
    onnotice: () => {},
  });
  const db = drizzle({ client, schema });
  return { db: db as unknown as Db, driver: 'postgres', close: () => client.end({ timeout: 5 }) };
}

export interface CreateMemoryDbOptions {
  /**
   * Comes from outside: inside the Next bundle `import.meta.url` does not point to the package.
   * Web (cwd = apps/web): path.join(process.cwd(), '../../packages/db/migrations').
   * Package tests: MIGRATIONS_FOLDER from `@refund/db/test` helpers.
   */
  migrationsFolder: string;
}

/** Dev without .env, tests and CI: Postgres in WASM, in memory, migrations applied on creation. */
export async function createMemoryDb(options: CreateMemoryDbOptions): Promise<DbHandle> {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  const client = new PGlite();
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: options.migrationsFolder });
  return { db: db as unknown as Db, driver: 'pglite', close: () => client.close() };
}
