// `pnpm --filter @refund/db db:migrate` (SCHEMA §4.1): applies pending migrations through the DIRECT
// connection (:5432). Never runs in the Vercel build. Node 24 runs this file directly.
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const url = process.env.DATABASE_URL_DIRECT;
if (!url) {
  process.stderr.write('DATABASE_URL_DIRECT is not set: nothing to migrate.\n');
  process.exit(1);
}

const client = postgres(url, {
  max: 1,
  ssl: process.env.DB_SSL === 'disable' ? false : 'require',
  onnotice: () => {},
});
try {
  await migrate(drizzle({ client }), {
    migrationsFolder: fileURLToPath(new URL('./migrations', import.meta.url)),
  });
  process.stdout.write('Migrations applied.\n');
} finally {
  await client.end({ timeout: 5 });
}
