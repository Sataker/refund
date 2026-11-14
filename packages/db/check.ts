// `pnpm --filter @refund/db db:check` (TESTS §4): the committed migrations match the schema, i.e.
// `drizzle-kit generate` would produce nothing. Runs generate against a temporary copy, so the
// real migrations folder is never touched.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const migrations = join(here, 'migrations');
const copy = mkdtempSync(join(tmpdir(), 'refund-db-check-'));
cpSync(migrations, copy, { recursive: true });

// drizzle-kit does not export its bin; it sits next to the main entry.
const bin = join(dirname(createRequire(import.meta.url).resolve('drizzle-kit')), 'bin.cjs');
const run = spawnSync(
  process.execPath,
  [bin, 'generate', '--dialect=postgresql', '--schema=./src/schema/index.ts', `--out=${copy}`],
  { cwd: here, encoding: 'utf8' },
);

const before = new Set(readdirSync(migrations));
const extra = readdirSync(copy).filter((f) => !before.has(f));
rmSync(copy, { recursive: true, force: true });

if (run.status !== 0) {
  process.stderr.write(run.stdout + run.stderr);
  process.exit(run.status ?? 1);
}
if (extra.length > 0) {
  process.stderr.write(
    `Schema and migrations diverge: generate would create ${extra.join(', ')}.\n` +
      'Run `pnpm --filter @refund/db db:generate --name <description>` and commit the SQL.\n',
  );
  process.exit(1);
}
process.stdout.write('Schema and migrations match.\n');
