// Alternative parameter sets (ARCHITECTURE §2.6, §3.1 `parameters/scenarios/`; ADR-013). The plumbing only: the
// scenario below is a TEST DOUBLE, not a tax value. The product's registry is empty until the /demo scenario is
// decided (EXECUTION §9, E16).
import { describe, expect, it, vi } from 'vitest';
import { analyze } from '../src/analyze.ts';
import { heroFacts } from './golden/fixtures/facts.ts';

vi.mock('../src/parameters/scenarios/index.ts', async () => {
  const { ALL_PARAMETERS_FOR_TEST } = await import('./support/official-entries.ts');
  const wage = ALL_PARAMETERS_FOR_TEST.filter((e) => e.key === 'minimumWage');
  return {
    PARAMETER_SCENARIOS: [
      {
        id: 'test-double',
        label: 'Teste',
        simulation: true,
        // Every minimum-wage record doubled: it moves R01's floor and A02, enough to prove the set is read.
        replaces: wage.map((e) => ({ ...e, value: ((e.value as number) * 2) as typeof e.value })),
      },
    ],
  };
});

const { param, parameterSets, withParameterSet, OFFICIAL_SET_ID } = await import(
  '../src/parameters/index.ts'
);

describe('parameter scenarios', () => {
  it('lists the scenario as a simulation set next to the official one', () => {
    expect(parameterSets).toEqual([
      { id: OFFICIAL_SET_ID, label: expect.any(String), simulation: false },
      { id: 'test-double', label: 'Teste', simulation: true },
    ]);
  });

  it('param() reads the scenario only inside withParameterSet, then the official set again', () => {
    const official = param('minimumWage', '2026-06').value;
    const inside = withParameterSet('test-double', () => param('minimumWage', '2026-06').value);
    expect(inside).toBe(official * 2);
    expect(param('minimumWage', '2026-06').value).toBe(official);
  });

  it('restores the official set even when the calculation throws', () => {
    expect(() =>
      withParameterSet('test-double', () => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(withParameterSet(OFFICIAL_SET_ID, () => param('minimumWage', '2026-06').value)).toBe(
      param('minimumWage', '2026-06').value,
    );
  });

  it('analyze() with the scenario recalculates for real and leaves the official result untouched', () => {
    const before = analyze(heroFacts());
    const simulated = analyze(heroFacts(), { parameters: 'test-double' });
    const after = analyze(heroFacts());
    if (!before.ok || !simulated.ok || !after.ok) throw new Error('analyze failed');
    expect(after.value).toEqual(before.value);
    expect(simulated.value.parametersHash).not.toBe(before.value.parametersHash);
    expect(simulated.value.inputsHash).not.toBe(before.value.inputsHash);
    expect(simulated.value.total.savings12m).not.toBe(before.value.total.savings12m);
    // INV-1 holds under the scenario too: Σ marginals (countsInTotal) == total.
    const sum = simulated.value.findings
      .filter((f) => f.countsInTotal)
      .reduce((n, f) => n + f.marginalValue12m, 0);
    expect(sum).toBe(simulated.value.total.savings12m);
  });

  it('refuses an async calculation (the engine must stay synchronous; code review E16, M1)', () => {
    expect(() => withParameterSet('test-double', () => Promise.resolve(1))).toThrow('synchronous');
    expect(param('minimumWage', '2026-06').value).toBe(
      withParameterSet(OFFICIAL_SET_ID, () => param('minimumWage', '2026-06').value),
    );
  });

  it('an unknown set id is UNKNOWN_PARAMETER_SET', () => {
    const r = analyze(heroFacts(), { parameters: 'nope' });
    expect(r.ok ? 'OK' : r.error.code).toBe('UNKNOWN_PARAMETER_SET');
  });
});
