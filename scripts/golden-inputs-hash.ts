// Golden inputs hash (freeze item 13; scripts/generate-engine-page.ts). Node built-ins only, on purpose: the PII guard
// CI job runs scripts/test/freeze-check.test.ts without `pnpm install`, so nothing here may reach the engine or a
// third-party package.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const ROOT = join(import.meta.dirname, '..');
export const STATS_FILE = 'apps/web/src/features/engine-page/stats.generated.ts';

/** The directories the `golden` Vitest project reads (vitest.config.ts). */
export const GOLDEN_DIRS = [
  'packages/engine/test/golden',
  'packages/engine/test/properties',
  'packages/pipeline/test/invariants',
] as const;

/** Every tracked file under GOLDEN_DIRS (tests, fixtures, oracle captures), sorted. Git, not a disk walk: no .DS_Store. */
export function goldenInputFiles(): string[] {
  return execFileSync('git', ['ls-files', '-z', '--', ...GOLDEN_DIRS], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean)
    .sort();
}

export function goldenTestFiles(): string[] {
  return goldenInputFiles().filter((f) => f.endsWith('.test.ts'));
}

/** sha256 over path + content of every tracked golden input: any edit makes the committed numbers stale. */
export function inputsHash(files: readonly string[] = goldenInputFiles()): string {
  const h = createHash('sha256');
  for (const f of files) {
    h.update(f);
    h.update('\0');
    h.update(readFileSync(join(ROOT, f)));
    h.update('\0');
  }
  return h.digest('hex');
}

/** Freeze item 13: the hash pinned in the generated file must equal the current golden inputs. */
export function inputsHashProblems(statsSource: string, actual: string = inputsHash()): string[] {
  const pinned = /inputsHash:\s*'([0-9a-f]{64})'/.exec(statsSource)?.[1];
  if (pinned === undefined) return [`${STATS_FILE}: inputsHash not found`];
  if (pinned !== actual)
    return [
      `${STATS_FILE}: golden inputs changed since generation; run \`node scripts/generate-engine-page.ts\``,
    ];
  return [];
}
