import { describe, expect, it } from 'vitest';
import { ENGINE_STATS } from '../../apps/web/src/features/engine-page/stats.generated.ts';
import { ENGINE_VERSION, PARAMETERS_VERSION } from '../../packages/engine/src/index.ts';
import {
  goldenTestFiles,
  inputsHash,
  oracleSourceCounts,
  ruleSummary,
  suiteGroup,
  suitesFromReport,
  totalsOf,
} from '../generate-engine-page.ts';

// EXECUTION E20, task 4: the numbers on /motor must be the repository's. The test counts come from a real golden run
// (scripts/generate-engine-page.ts); here the inputs hash proves they were taken from the current golden files.

describe('/motor numbers match the repository', () => {
  it('the golden inputs did not change since the page was generated', () => {
    expect(
      ENGINE_STATS.inputsHash,
      'a golden file changed: run `node scripts/generate-engine-page.ts`',
    ).toBe(inputsHash());
  });

  it('every golden test file has its row, and no row is left over', () => {
    expect(ENGINE_STATS.suites.map((s) => s.file)).toEqual(goldenTestFiles());
    for (const s of ENGINE_STATS.suites) expect(s.group).toBe(suiteGroup(s.file));
  });

  it('rules, oracle sources and versions are the engine’s', () => {
    expect(ENGINE_STATS.rules).toEqual(ruleSummary());
    expect(ENGINE_STATS.oracleSources).toEqual(oracleSourceCounts());
    expect(ENGINE_STATS.engineVersion).toBe(ENGINE_VERSION);
    expect(ENGINE_STATS.parametersVersion).toBe(PARAMETERS_VERSION);
  });

  it('the totals add up', () => {
    expect(ENGINE_STATS.totals).toEqual(totalsOf(ENGINE_STATS.suites));
    expect(ENGINE_STATS.totals.passed).toBeGreaterThan(0);
  });
});

describe('suitesFromReport', () => {
  const file = (name: string, statuses: string[]) => ({
    name: `${process.cwd()}/${name}`,
    status: statuses.includes('failed') ? 'failed' : 'passed',
    assertionResults: statuses.map((status) => ({ status })),
  });

  it('counts passed and todo per file, grouped by directory', () => {
    const suites = suitesFromReport({
      numFailedTests: 0,
      testResults: [
        file('packages/engine/test/golden/r01.test.ts', ['passed', 'passed', 'todo']),
        file('packages/engine/test/golden/oracles/pgdas-d.test.ts', ['passed']),
      ],
    });
    expect(suites).toEqual([
      {
        file: 'packages/engine/test/golden/oracles/pgdas-d.test.ts',
        group: 'oracle',
        passed: 1,
        todo: 0,
      },
      { file: 'packages/engine/test/golden/r01.test.ts', group: 'golden', passed: 2, todo: 1 },
    ]);
  });

  it('refuses a red run', () => {
    expect(() =>
      suitesFromReport({
        numFailedTests: 1,
        testResults: [file('packages/engine/test/golden/r01.test.ts', ['passed', 'failed'])],
      }),
    ).toThrow(/red/);
  });
});
