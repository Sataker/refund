// `pnpm --filter @refund/db db:seed --profile=reference|dev` (SCHEMA §5). Idempotent.
// Production never receives `dev`: refused under VERCEL_ENV=production or a production database ref.
import { regulations } from '@refund/law';
import { generate, PERSONA_IDS } from '@refund/personas';
import { createDb } from './src/client.ts';
import { seedDev, seedReference } from './src/seed.ts';

/**
 * Supabase project refs of production (the ref is the `<ref>` in `db.<ref>.supabase.co` or the
 * `postgres.<ref>` pooler user; it is not a secret). Filled in when `refund-prod` exists (N3).
 */
const PRODUCTION_DB_REFS: readonly string[] = [];

const arg = process.argv.find((a) => a.startsWith('--profile='));
const profile = arg?.slice('--profile='.length) ?? 'reference';
if (profile !== 'reference' && profile !== 'dev') {
  process.stderr.write(`Unknown profile "${profile}" (use reference or dev).\n`);
  process.exit(1);
}

const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!url) {
  process.stderr.write('DATABASE_URL_DIRECT is not set (PGlite seeds itself in dev).\n');
  process.exit(1);
}

const looksLikeProduction =
  process.env.VERCEL_ENV === 'production' || PRODUCTION_DB_REFS.some((ref) => url.includes(ref));
if (profile === 'dev' && looksLikeProduction) {
  process.stderr.write('Refusing the dev profile against production.\n');
  process.exit(1);
}

const refs = regulations.map((r) => ({ id: r.id, url: r.url }));
const handle = await createDb({ url, ssl: process.env.DB_SSL !== 'disable', max: 1 });
try {
  if (profile === 'dev') {
    await seedDev(handle.db, {
      regulations: refs,
      companies: PERSONA_IDS.map((id) => generate(id).data.company),
    });
  } else {
    await seedReference(handle.db, refs);
  }
  process.stdout.write(`Seed "${profile}" applied (${refs.length} regulations).\n`);
} finally {
  await handle.close();
}
