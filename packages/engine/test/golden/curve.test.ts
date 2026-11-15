// ENGINE-SPEC D.1 (curve) and EXECUTION E8 task 3: `EngineResult.optimizerCurve` holds every candidate of the
// optimizer — the R$ 50 grid from the minimum wage up to 1,2 × max(P0, P_target), the analytical 28% point (P_28), the
// target with the margin (P_target), 5.000, 7.350 and the INSS ceiling — with the real step at 28% (no smoothing).
import { describe, expect, it } from 'vitest';
import { analyze } from '../../src/analyze.ts';
import { brl } from '../../src/money.ts';
import type { EngineResult } from '../../src/types.ts';
import { constant, heroFacts, syntheticFacts } from './fixtures/facts.ts';

function run(f: Parameters<typeof analyze>[0]): EngineResult {
  const r = analyze(f);
  if (!r.ok) throw new Error(r.error.code);
  return r.value;
}

describe('optimizer curve (D.1)', () => {
  const r = run(heroFacts());
  const curve = r.optimizerCurve ?? [];
  const cost = (p: number) => curve.find((c) => c.monthlyProLabore === p)?.annualTotalCost;

  it('starts at the minimum wage, is sorted and has no repeated P', () => {
    expect(curve[0]?.monthlyProLabore).toBe(brl('1.621,00'));
    const ps = curve.map((c) => c.monthlyProLabore);
    expect(ps).toEqual([...ps].sort((a, b) => a - b));
    expect(new Set(ps).size).toBe(ps.length);
  });

  it('contains P_28 (1.760,00), P_target (2.260,00), the R$ 50 grid up to 1,2 × P_target, 5.000, 7.350 and the ceiling', () => {
    expect(cost(brl('1.760,00'))).toBe(brl('34.573,44'));
    expect(cost(brl('2.260,00'))).toBe(brl('35.233,44'));
    for (let p: number = brl('1.621,00'); p <= Math.floor(brl('2.260,00') * 1.2); p += 5000) {
      expect(cost(p), String(p)).toBeDefined();
    }
    expect(cost(brl('5.000,00'))).toBeDefined();
    expect(cost(brl('7.350,00'))).toBeDefined();
    expect(curve.at(-1)?.monthlyProLabore).toBe(brl('8.475,55'));
  });

  it('shows the real step at 28%: the grid point below P_28 (1.721,00) is still Anexo V at steady state', () => {
    const below = cost(brl('1.721,00')) ?? 0;
    const at = cost(brl('1.760,00')) ?? 0;
    // Steady-state DAS in V (segregated) minus III (segregated): 12 × (5.609,36 − 2.687,52) = 35.062,08, less the
    // extra partner INSS of P_28: 12 × (193,60 − 189,31) = 51,48 (IR is zero on both).
    expect(below - at).toBe(brl('35.062,08') - brl('51,48'));
  });

  it('T01-15: no curve when R01 does not run (CNAE outside the Fator R, P0 = minimum wage)', () => {
    const f = syntheticFacts({
      domestic: constant(brl('50.000,00')),
      subjectToFatorR: false,
      baseAnexo: 'III',
    });
    expect(run(f).optimizerCurve).toBeUndefined();
  });
});
