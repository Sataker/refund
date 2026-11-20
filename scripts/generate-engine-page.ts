// Numbers of the /motor page (EXECUTION E20, task 4; IDENTITY-AND-UI §5.14): rules, oracle sources and the golden
// project's tests, read from the repository and written to a committed data file the page renders. The test counts
// come from a real run of `vitest --project golden` (data-driven suites register tests at run time, so a static scan
// would miscount). The file pins a hash of the tracked files under GOLDEN_DIRS only (tests, fixtures, oracle captures;
// not the engine source the data-driven suites read): `pnpm freeze:check` item 13 fails when it differs, and
// scripts/test/engine-page.unit.test.ts keeps the cheap structural checks (file list, rules, sources, versions).
// Usage: node scripts/generate-engine-page.ts   (≈ 1 min: it runs the golden project)
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { ENGINE_VERSION, PARAMETERS_VERSION, RULE_REFS } from '../packages/engine/src/index.ts';
import { SOURCES } from '../packages/engine/test/golden/oracles/sources.ts';
import { biomeFormat } from './generate-fixtures-index.ts';

export const ROOT = join(import.meta.dirname, '..');
export const STATS_FILE = 'apps/web/src/features/engine-page/stats.generated.ts';

/** The directories the `golden` Vitest project reads (vitest.config.ts). */
export const GOLDEN_DIRS = [
  'packages/engine/test/golden',
  'packages/engine/test/properties',
  'packages/pipeline/test/invariants',
] as const;

export type SuiteGroup = 'oracle' | 'golden' | 'property' | 'invariant';

export interface SuiteStats {
  file: string;
  group: SuiteGroup;
  passed: number;
  todo: number;
}

export interface EngineStats {
  engineVersion: string;
  parametersVersion: string;
  rules: { id: string; refs: number }[];
  oracleSources: { primary: number; secondary: number };
  suites: SuiteStats[];
  totals: Record<SuiteGroup, number> & { passed: number; todo: number };
  inputsHash: string;
}

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

export function suiteGroup(file: string): SuiteGroup {
  if (file.includes('/golden/oracles/')) return 'oracle';
  if (file.includes('/properties/')) return 'property';
  if (file.includes('/invariants/')) return 'invariant';
  return 'golden';
}

/** Rule ids of the engine with the number of legal references each one cites (ENGINE-SPEC D; ref-index.ts). */
export function ruleSummary(): EngineStats['rules'] {
  return Object.entries(RULE_REFS).map(([id, refs]) => ({ id, refs: refs.length }));
}

export function oracleSourceCounts(): EngineStats['oracleSources'] {
  const all = Object.values(SOURCES);
  return {
    primary: all.filter((s) => s.kind === 'primary').length,
    secondary: all.filter((s) => s.kind === 'secondary').length,
  };
}

interface VitestJson {
  numFailedTests: number;
  testResults: { name: string; status: string; assertionResults: { status: string }[] }[];
}

/** Turns Vitest's JSON report into per-file counts. Any failure aborts: the page only shows a green suite. */
export function suitesFromReport(report: VitestJson): SuiteStats[] {
  const failedFiles = report.testResults.filter((r) => r.status === 'failed');
  if (report.numFailedTests > 0 || failedFiles.length > 0) {
    throw new Error(
      `golden project is red (${report.numFailedTests} failed test(s)); fix it before generating /motor`,
    );
  }
  return report.testResults
    .map((r) => {
      const file = relative(ROOT, r.name).split(sep).join('/');
      return {
        file,
        group: suiteGroup(file),
        passed: r.assertionResults.filter((a) => a.status === 'passed').length,
        todo: r.assertionResults.filter((a) => a.status === 'todo').length,
      };
    })
    .sort((a, b) => (a.file < b.file ? -1 : 1));
}

export function totalsOf(suites: readonly SuiteStats[]): EngineStats['totals'] {
  const totals = { oracle: 0, golden: 0, property: 0, invariant: 0, passed: 0, todo: 0 };
  for (const s of suites) {
    totals[s.group] += s.passed;
    totals.passed += s.passed;
    totals.todo += s.todo;
  }
  return totals;
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

export function renderStats(stats: EngineStats): string {
  return [
    '// Generated by scripts/generate-engine-page.ts. Do not edit: run `node scripts/generate-engine-page.ts`.',
    '// scripts/test/engine-page.unit.test.ts and `pnpm freeze:check` (item 13) check them against the repository.',
    `export const ENGINE_STATS = ${JSON.stringify(stats, null, 2)} as const;`,
    '',
  ].join('\n');
}

function runGolden(): VitestJson {
  const dir = mkdtempSync(join(tmpdir(), 'engine-page-'));
  const out = join(dir, 'golden.json');
  try {
    try {
      execFileSync(
        'pnpm',
        ['exec', 'vitest', 'run', '--project', 'golden', '--reporter=json', `--outputFile=${out}`],
        { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] },
      );
    } catch {
      // A red suite exits non-zero; the report still says why (suitesFromReport throws on it).
    }
    return JSON.parse(readFileSync(out, 'utf8')) as VitestJson;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function generate(): EngineStats {
  const hash = inputsHash();
  const suites = suitesFromReport(runGolden());
  const missing = goldenTestFiles().filter((f) => !suites.some((s) => s.file === f));
  if (missing.length > 0) throw new Error(`golden files without results: ${missing.join(', ')}`);
  return {
    engineVersion: ENGINE_VERSION,
    parametersVersion: PARAMETERS_VERSION,
    rules: ruleSummary(),
    oracleSources: oracleSourceCounts(),
    suites,
    totals: totalsOf(suites),
    inputsHash: hash,
  };
}

if (import.meta.main) {
  const stats = generate();
  writeFileSync(join(ROOT, STATS_FILE), renderStats(stats));
  biomeFormat([STATS_FILE]);
  console.log(
    `engine page: ${stats.rules.length} rules, ${stats.totals.passed} golden-project tests passing ` +
      `(${stats.totals.oracle} oracle), ${STATS_FILE}`,
  );
}
