import { defineConfig } from 'drizzle-kit';

// SCHEMA §4.1. `generate` needs no database; only `migrate`/`check` against a real one use the URL.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  schemaFilter: ['refund'],
  dbCredentials: { url: process.env.DATABASE_URL_DIRECT ?? 'postgres://localhost/refund' },
  strict: true,
  verbose: true,
});
