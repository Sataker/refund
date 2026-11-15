// ENGINE-SPEC C.11.10 tests T11-01…T11-18 (values in R$ written as in the spec; compared in cents).
// Hero = the public CNPJ data of `dev-exportador` (fixtures/profile.ts, copied from the persona).
import { describe, expect, it } from 'vitest';
import { brl } from '../../src/money.ts';
import {
  CNAE_ANEXO,
  estimateByProfile,
  formatProfileRange,
  NO_RANGE_MESSAGES,
  rangeInThousands,
} from '../../src/profile.ts';
import type {
  ApplicableRule,
  Cents,
  ProfileAnswers,
  ProfileEstimate,
  PublicProfile,
} from '../../src/types.ts';
import { allAnswers, HERO_ANSWERS, HERO_PROFILE } from './fixtures/profile.ts';

const ANALYSIS = { analysisDate: '2026-11-12' as const };

const memo = new Map<string, ProfileEstimate>();
/** estimateByProfile is pure (INV-6), so the file memoizes it; T11-18 (a) checks the purity itself. */
function estimate(
  answers: Partial<ProfileAnswers> = {},
  profile: Partial<PublicProfile> = {},
): ProfileEstimate {
  const p = { ...HERO_PROFILE, ...profile };
  const a = { ...HERO_ANSWERS, ...answers };
  const key = JSON.stringify([p, a]);
  const hit = memo.get(key);
  if (hit !== undefined) return hit;
  const r = estimateByProfile(p, a, ANALYSIS);
  if (!r.ok) throw new Error(r.error.code);
  memo.set(key, r.value);
  return r.value;
}

const ids = (rules: ApplicableRule[]) => rules.map((r) => r.ruleId);
const rule = (e: ProfileEstimate, id: ApplicableRule['ruleId']) =>
  e.rules.find((r) => r.ruleId === id);

function expectRange(e: ProfileEstimate, min: string, max: string) {
  expect(e.type).toBe('range');
  if (e.type !== 'range') return;
  expect(e.total).toEqual([brl(min), brl(max)]);
}

function expectNoRange(e: ProfileEstimate, reason: string) {
  expect(e.type).toBe('no_range');
  if (e.type === 'no_range') expect(e.reason).toBe(reason);
}

// C.11.9 blocks of the 30–60 grid (hero answers): every cell of the table, by scenario id and rule.
const JUST = { 3000000: 677800, 4500000: 1097800, 6000000: 1517800 } as const;
const R01_LIM = { 3000000: '28.942,68', 4500000: '39.544,92', 6000000: '50.146,68' } as const;
const R05_III = {
  3000000: ['14.662,80', '14.932,08', '15.201,36'],
  4500000: ['23.751,96', '28.308,84', '27.132,60'],
  6000000: ['32.841,36', '40.632,72', '39.063,96'],
} as const;
const R05_V = {
  4500000: ['22.260,24', '31.061,40', '35.441,16'],
  6000000: ['30.492,48', '42.641,04', '48.480,72'],
} as const;
const BLOCK_CELLS: { id: string; rule: 'R01' | 'R05'; expected: string }[] = [];
for (const r of [3000000, 4500000, 6000000] as const) {
  ['0.5', '0.75', '1'].forEach((s, i) => {
    const iii = R05_III[r][i] as string;
    BLOCK_CELLS.push({ id: `R${r}-S${s}-F${JUST[r] + 100}`, rule: 'R01', expected: '0,00' });
    BLOCK_CELLS.push({ id: `R${r}-S${s}-F${JUST[r] + 100}`, rule: 'R05', expected: iii });
    BLOCK_CELLS.push({ id: `R${r}-S${s}-F${JUST[r]}`, rule: 'R01', expected: R01_LIM[r] });
    BLOCK_CELLS.push({ id: `R${r}-S${s}-F${JUST[r]}`, rule: 'R05', expected: iii });
    // f = 0: R01_0 passes the threshold only at 30.000 (7.337,66 ≥ 3.600); elsewhere R05 runs in Anexo V.
    const v = r === 3000000 ? null : (R05_V[r][i] as string);
    BLOCK_CELLS.push({
      id: `R${r}-S${s}-F0`,
      rule: 'R01',
      expected: v === null ? '7.337,66' : '0,00',
    });
    BLOCK_CELLS.push({ id: `R${r}-S${s}-F0`, rule: 'R05', expected: v ?? iii });
  });
}

/**
 * Cells the engine does not reproduce, with the engine's value (EXECUTION §9, E8 row of 15/11). A = repeating
 * effective rate at precision 34; B = 2027–2028 CBS/IBS split rounded per tax in the 2028 steady state.
 */
const DIVERGENT_CELLS: Record<string, { engine: string; cause: 'A' | 'B' }> = {
  'R3000000-S0.75-F677900|R05': { engine: '14.931,96', cause: 'B' },
  'R3000000-S0.75-F677800|R05': { engine: '14.931,96', cause: 'B' },
  'R3000000-S0.75-F0|R05': { engine: '14.931,96', cause: 'B' },
  'R4500000-S0.5-F1097900|R05': { engine: '23.752,20', cause: 'A' },
  'R4500000-S0.5-F1097800|R01': { engine: '39.544,68', cause: 'A' },
  'R4500000-S0.5-F1097800|R05': { engine: '23.752,20', cause: 'A' },
  'R4500000-S0.75-F1097900|R05': { engine: '28.309,20', cause: 'A' },
  'R4500000-S0.75-F1097800|R01': { engine: '39.544,68', cause: 'A' },
  'R4500000-S0.75-F1097800|R05': { engine: '28.309,20', cause: 'A' },
  'R4500000-S1-F1097900|R05': { engine: '27.132,72', cause: 'A' },
  'R4500000-S1-F1097800|R01': { engine: '39.544,68', cause: 'A' },
  'R4500000-S1-F1097800|R05': { engine: '27.132,72', cause: 'A' },
  'R6000000-S0.75-F1517900|R05': { engine: '40.632,60', cause: 'A' },
  'R6000000-S0.75-F1517800|R05': { engine: '40.632,60', cause: 'A' },
};

const cellValue = (id: string, r: 'R01' | 'R05') =>
  estimate().scenarios.find((s) => s.id === id)?.byRule[r];

describe('ENGINE-SPEC C.11.10 — profile-based estimate', () => {
  it('T11-01: hero up_to_15k → MINIMUM_BELOW_FLOOR; R01, R05, R02 without range; 0 scenarios', () => {
    const e = estimate({ monthlyRevenueBracket: 'up_to_15k' });
    expectNoRange(e, 'MINIMUM_BELOW_FLOOR');
    expect(ids(e.rules)).toEqual(['R01', 'R05', 'R02']);
    expect(e.rules.every((r) => r.range === undefined)).toBe(true);
    expect(e.scenarios).toHaveLength(0);
  });

  it('T11-02: hero from_15k_to_30k → MINIMUM_BELOW_FLOOR; grid maximum 44.144,04; 27 scenarios', () => {
    const e = estimate({ monthlyRevenueBracket: 'from_15k_to_30k' });
    expectNoRange(e, 'MINIMUM_BELOW_FLOOR');
    expect(e.type === 'no_range' && e.gridTotal && e.gridTotal[1]).toBe(brl('44.144,04'));
    expect(e.scenarios).toHaveLength(27);
    // Maximum (30.000; 1; just below) = 28.942,68 + 15.201,36.
    const max = e.scenarios.find((s) => s.id === 'R3000000-S1-F677800');
    expect(max?.byRule).toEqual({ R01: brl('28.942,68'), R05: brl('15.201,36') });
    // The minimum scenario is (15.000; 0,5; boundary); 0,85 × it < 3.000 either way (§9 divergence below).
    const min = e.scenarios.find((s) => s.id === 'R1500000-S0.5-F257900');
    expect(e.type === 'no_range' && e.gridTotal && e.gridTotal[0]).toBe(min?.annualRegimeTotal);
    expect(ids(e.rules)).toEqual(['R01', 'R05', 'R02']);
    expect(e.rules.every((r) => r.range === undefined)).toBe(true);
  });

  it('T11-03: HERO from_30k_to_60k → minimum 12.463,38 (0,85 × 14.662,80); 27 scenarios; per-rule ranges', () => {
    const e = estimate();
    expect(e.type).toBe('range');
    if (e.type !== 'range') return;
    expect(e.total[0]).toBe(1246338);
    expect(e.gridTotal[0]).toBe(brl('14.662,80'));
    expect(e.total[1]).toBe(e.gridTotal[1]);
    expect(e.label).toBe('estimativa por perfil');
    expect(e.unit).toBe('per_year_in_regime');
    expect(e.scenarios).toHaveLength(27);
    // Display "de R$ 12 mil a R$ 91 mil" (C.11.4: minimum down, maximum up, to the thousand).
    expect(rangeInThousands(e.total)).toEqual([12, 91]);
    expect(formatProfileRange(e.total)).toBe('de R$ 12 mil a R$ 91 mil');
    // Minimum (30.000; 0,5; boundary): R05_III only.
    const min = e.scenarios.find((s) => s.id === 'R3000000-S0.5-F677900');
    expect(min?.byRule).toEqual({ R01: 0, R05: brl('14.662,80') });
    // The maximum is the scenario (60.000; 0,75; just below), with R01lim = 50.146,68.
    const max = e.scenarios.find((s) => s.id === 'R6000000-S0.75-F1517800');
    expect(max?.annualRegimeTotal).toBe(e.gridTotal[1]);
    expect(max?.byRule.R01).toBe(brl('50.146,68'));
    expect(ids(e.rules)).toEqual(['R01', 'R05', 'R02']);
    expect(rule(e, 'R01')?.range).toEqual([0, brl('50.146,68')]);
    expect(rule(e, 'R05')?.range).toEqual([brl('12.463,38'), brl('48.480,72')]);
    expect(rule(e, 'R02')?.range).toBeUndefined();
    // R05's maximum at (60.000; 1; f = 0), in Anexo V: 12 × (10.875,00 − 6.834,94).
    expect(e.scenarios.find((s) => s.id === 'R6000000-S1-F0')?.byRule.R05).toBe(brl('48.480,72'));
    // The hero's real steady-state value (74.006,28, F.4) falls inside; ratio ≈ 7,28 ≤ 10.
    expect(e.total[0] <= brl('74.006,28') && brl('74.006,28') <= e.total[1]).toBe(true);
    expect(e.total[1] <= 10 * e.total[0]).toBe(true);
  });

  it('T11-03: C.11.9 blocks reproduced to the cent (every cell outside the §9 divergence list)', () => {
    let n = 0;
    for (const c of BLOCK_CELLS) {
      if (DIVERGENT_CELLS[`${c.id}|${c.rule}`] !== undefined) continue;
      expect(cellValue(c.id, c.rule), `${c.id} ${c.rule}`).toBe(brl(c.expected));
      n += 1;
    }
    expect(n).toBe(BLOCK_CELLS.length - Object.keys(DIVERGENT_CELLS).length);
  });

  it('T11-04: hero from_60k_to_150k → [25.918,61; 221.467,44]', () => {
    const e = estimate({ monthlyRevenueBracket: 'from_60k_to_150k' });
    expectRange(e, '25.918,61', '221.467,44');
    expect(e.type === 'range' && e.gridTotal).toEqual([brl('30.492,48'), brl('221.467,44')]);
    const max = e.scenarios.find((s) => s.id === 'R15000000-S1-F4037800');
    expect(max?.byRule).toEqual({ R01: brl('97.558,68'), R05: brl('123.908,76') });
  });

  it('T11-05: hero from_150k_to_300k → [71.664,28; 419.090,76]; R03 listed without value', () => {
    const e = estimate({ monthlyRevenueBracket: 'from_150k_to_300k' });
    expectRange(e, '71.664,28', '419.090,76');
    const max = e.scenarios.find((s) => s.id === 'R30000000-S0.75-F8237800');
    expect(max?.annualRegimeTotal).toBe(brl('419.090,76'));
    expect(e.scenarios.find((s) => s.id === 'R15000000-S0.5-F0')?.annualRegimeTotal).toBe(
      brl('84.310,92'),
    );
    expect(ids(e.rules)).toEqual(['R01', 'R05', 'R03', 'R02']);
    expect(rule(e, 'R03')?.range).toBeUndefined();
  });

  it('T11-06: from_300k_to_400k → ABOVE_SUBLIMIT; 0 scenarios; R03 listed', () => {
    const e = estimate({ monthlyRevenueBracket: 'from_300k_to_400k' });
    expectNoRange(e, 'ABOVE_SUBLIMIT');
    expect(e.scenarios).toHaveLength(0);
    expect(ids(e.rules)).toEqual(['R01', 'R05', 'R03', 'R02']);
  });

  it('T11-07: above_400k → ABOVE_CEILING; R03 listed', () => {
    const e = estimate({ monthlyRevenueBracket: 'above_400k' });
    expectNoRange(e, 'ABOVE_CEILING');
    expect(ids(e.rules)).toContain('R03');
    expect(e.scenarios).toHaveLength(0);
  });

  it('T11-08: revenue dont_know → REVENUE_NOT_PROVIDED; rules R01, R05, R02', () => {
    const e = estimate({ monthlyRevenueBracket: 'dont_know' });
    expectNoRange(e, 'REVENUE_NOT_PROVIDED');
    expect(ids(e.rules)).toEqual(['R01', 'R05', 'R02']);
    expect(e.scenarios).toHaveLength(0);
  });

  it('T11-09: employees and abroad dont_know → 45 scenarios; minimum 0 at (30.000; 0; boundary)', () => {
    const e = estimate({ hasEmployees: 'dont_know', receivesFromAbroad: 'dont_know' });
    expectNoRange(e, 'MINIMUM_BELOW_FLOOR');
    expect(e.scenarios).toHaveLength(45);
    expect(e.type === 'no_range' && e.gridTotal && e.gridTotal[0]).toBe(0);
    // Same maximum scenario as T11-03 (the grid holds 0,75 and "just below").
    const hero = estimate();
    expect(e.type === 'no_range' && e.gridTotal && e.gridTotal[1]).toBe(
      hero.type === 'range' ? hero.gridTotal[1] : -1,
    );
    expect(e.scenarios.find((s) => s.id === 'R3000000-S0-F677900')?.annualRegimeTotal).toBe(0);
  });

  it('T11-10: 6201-5/01, from_15k_to_30k, no employees, no abroad → [6.237,01; 13.497,72], only R01', () => {
    const e = estimate({
      monthlyRevenueBracket: 'from_15k_to_30k',
      hasEmployees: 'no',
      receivesFromAbroad: 'no',
    });
    expectRange(e, '6.237,01', '13.497,72');
    expect(e.scenarios.map((s) => [s.id, s.annualRegimeTotal])).toEqual([
      ['R1500000-S0-F0', brl('13.497,72')],
      ['R2250000-S0-F0', brl('11.371,59')],
      ['R3000000-S0-F0', brl('7.337,66')],
    ]);
    expect(ids(e.rules)).toEqual(['R01', 'R02']);
    expect(rule(e, 'R01')?.range).toEqual([brl('6.237,01'), brl('13.497,72')]);
  });

  it('T11-11: 6201-5/01, from_30k_to_60k, no employees, half_or_more → [18.700,39; 48.480,72]', () => {
    const e = estimate({ hasEmployees: 'no' });
    expectRange(e, '18.700,39', '48.480,72');
    expect(e.scenarios).toHaveLength(9);
    expect(e.scenarios.find((s) => s.id === 'R3000000-S0.5-F0')?.byRule).toEqual({
      R01: brl('7.337,66'),
      R05: brl('14.662,80'),
    });
  });

  it('T11-12: 6201-5/01, from_30k_to_60k, no employees, no abroad → MINIMUM_BELOW_FLOOR, [0; 7.337,66]', () => {
    const e = estimate({ hasEmployees: 'no', receivesFromAbroad: 'no' });
    expectNoRange(e, 'MINIMUM_BELOW_FLOOR');
    expect(e.type === 'no_range' && e.gridTotal).toEqual([0, brl('7.337,66')]);
    expect(e.scenarios.map((s) => s.annualRegimeTotal)).toEqual([brl('7.337,66'), 0, 0]);
  });

  it('T11-13: MEI → REGIME_MEI; rules = [R03]', () => {
    const e = estimate({}, { optedIntoMei: true, size: 'MEI' });
    expectNoRange(e, 'REGIME_MEI');
    expect(ids(e.rules)).toEqual(['R03']);
  });

  it('T11-14: Lucro Presumido → REGIME_OUT_OF_SCOPE; rules = []', () => {
    const e = estimate({}, { optedIntoSimples: false });
    expectNoRange(e, 'REGIME_OUT_OF_SCOPE');
    expect(e.rules).toEqual([]);
  });

  it('T11-15: 8630-5/04 (dentistry, to_confirm) → CNAE_OUT_OF_SCOPE (R02 listed)', () => {
    const e = estimate({}, { primaryCnae: '8630-5/04' });
    expectNoRange(e, 'CNAE_OUT_OF_SCOPE');
    expect(ids(e.rules)).toEqual(['R02']);
    // Absent from the table: the same reason.
    expectNoRange(estimate({}, { primaryCnae: '7020-4/00' }), 'CNAE_OUT_OF_SCOPE');
  });

  it('T11-16: 4771-7/01 (pharmacy, Anexo I), abroad no → NO_RULE_WITH_VALUE; R06 and R02 without range', () => {
    const e = estimate({ receivesFromAbroad: 'no' }, { primaryCnae: '4771-7/01' });
    expectNoRange(e, 'NO_RULE_WITH_VALUE');
    expect(ids(e.rules)).toEqual(['R06', 'R02']);
    expect(e.rules.every((r) => r.range === undefined)).toBe(true);
  });

  it('T11-17: hero with status BAIXADA → COMPANY_NOT_ACTIVE; rules = []', () => {
    const e = estimate({}, { isActive: false });
    expectNoRange(e, 'COMPANY_NOT_ACTIVE');
    expect(e.rules).toEqual([]);
  });
});

// ---------- Divergences from the C.11.10 expected values (EXECUTION §9, E8 row of 15/11) ----------
// The spec values stay as written (CLAUDE.md rule 11). Each `it.fails` passes only while the engine still differs from
// the spec, so the day the spec owner settles the triage (or the engine changes) it turns red and must be revisited.
// Cause A: a repeating effective rate (e.g. 55.260/540.000): decimal.js at precision 34 (C.1) rounds `45.000 × e` to
//          4.605,000…, so CSLL = 161,18 (the exact-fraction value of manual item 12), not the spec's 161,17.
// Cause B: the steady-state block is 2028; the 2027–2028 tables split PIS + Cofins into CBS + IBS, each rounded
//          per tax (D12), which moves the domestic DAS by R$ 0,01 against the 2026 split used in C.11.9.
describe('C.11.10 values the engine does not reproduce (§9 triage pending; spec values unchanged)', () => {
  it.fails('T11-02: gridTotal [2.651,40; 44.144,04] (cause B; engine minimum 2.651,28)', () => {
    const e = estimate({ monthlyRevenueBracket: 'from_15k_to_30k' });
    expect(e.type === 'no_range' && e.gridTotal).toEqual([brl('2.651,40'), brl('44.144,04')]);
  });

  it.fails('T11-03: total [1246338; 9077940] cents (cause A; engine maximum 9077928)', () => {
    const e = estimate();
    expect(e.type === 'range' && e.total).toEqual([1246338, 9077940]);
  });

  it.fails('T11-03: maximum scenario R05_III(60.000; 0,75) = 40.632,72 (cause A; engine 40.632,60)', () => {
    const max = estimate().scenarios.find((s) => s.id === 'R6000000-S0.75-F1517800');
    expect(max?.byRule).toEqual({ R01: brl('50.146,68'), R05: brl('40.632,72') });
  });

  for (const c of BLOCK_CELLS) {
    const key = `${c.id}|${c.rule}`;
    const d = DIVERGENT_CELLS[key];
    if (d === undefined) continue;
    it.fails(`T11-03 C.11.9 block ${key} = ${c.expected} (cause ${d.cause}; engine ${d.engine})`, () => {
      expect(cellValue(c.id, c.rule)).toBe(brl(c.expected));
    });
  }

  it.fails('T11-05: maximum split R01 131.578,80 / R05 287.511,96 (cause B; the total 419.090,76 matches)', () => {
    const e = estimate({ monthlyRevenueBracket: 'from_150k_to_300k' });
    const max = e.scenarios.find((s) => s.id === 'R30000000-S0.75-F8237800');
    expect(max?.byRule).toEqual({ R01: brl('131.578,80'), R05: brl('287.511,96') });
  });

  it.fails('T11-09: gridTotal [0; 90.779,40] (cause A; engine maximum 90.779,28)', () => {
    const e = estimate({ hasEmployees: 'dont_know', receivesFromAbroad: 'dont_know' });
    expect(e.type === 'no_range' && e.gridTotal).toEqual([0, brl('90.779,40')]);
  });
});

// ---------- T11-18: properties over every answer combination of the table's verified CNAEs ----------

describe('T11-18 — properties of every estimate (96 combinations × verified CNAEs)', () => {
  // 6201-5/02 has the same row as 6201-5/01 (Anexo III, Fator R): checked once, through the hero's CNAE.
  const verified = CNAE_ANEXO.filter((r) => r.status === 'verified' && r.cnae !== '6201-5/02');
  const results: { answers: ProfileAnswers; e: ProfileEstimate }[] = [];
  for (const row of verified) {
    for (const answers of allAnswers()) {
      results.push({ answers, e: estimate(answers, { primaryCnae: row.cnae }) });
    }
  }

  it('(a) same input → identical output (INV-6)', () => {
    const again = estimate();
    expect(JSON.stringify(again)).toBe(JSON.stringify(estimate()));
    const ids1 = estimate({ hasEmployees: 'dont_know', receivesFromAbroad: 'dont_know' }).scenarios;
    expect(ids1.map((s) => s.id)).toEqual(
      estimate({ hasEmployees: 'dont_know', receivesFromAbroad: 'dont_know' }).scenarios.map(
        (s) => s.id,
      ),
    );
  });

  it('(b) every scenario: Σ byRule == annualRegimeTotal (INV-1)', () => {
    let n = 0;
    for (const { e } of results) {
      for (const s of e.scenarios) {
        expect(s.byRule.R01 + s.byRule.R05).toBe(s.annualRegimeTotal);
        n += 1;
      }
    }
    expect(n).toBeGreaterThan(100);
  });

  it('(c) total[0] ≤ total[1] and total[1] == gridTotal[1]; (d) no range below the floor or wider than 10×', () => {
    let ranges = 0;
    for (const { e } of results) {
      if (e.type !== 'range') continue;
      ranges += 1;
      expect(e.total[0]).toBeLessThanOrEqual(e.total[1]);
      expect(e.total[1]).toBe(e.gridTotal[1]);
      expect(e.total[0]).toBeGreaterThanOrEqual(300000);
      expect(e.total[1]).toBeLessThanOrEqual(10 * e.total[0]);
    }
    expect(ranges).toBeGreaterThan(5);
  });

  it('every output carries the label, the versions and only R01/R05 per-rule ranges; money is integer cents', () => {
    for (const { e } of results) {
      expect(e.label).toBe('estimativa por perfil');
      expect(e.engineVersion).toMatch(/\d/);
      expect(e.parametersVersion).toMatch(/\d/);
      for (const r of e.rules) {
        if (r.range !== undefined) {
          expect(['R01', 'R05']).toContain(r.ruleId);
          expect(
            e.type === 'range' || (e.type === 'no_range' && e.reason === 'RANGE_TOO_WIDE'),
          ).toBe(true);
          for (const v of r.range) expect(Number.isSafeInteger(v)).toBe(true);
        }
      }
      for (const s of e.scenarios)
        expect(Number.isSafeInteger(s.annualRegimeTotal as Cents)).toBe(true);
    }
  });

  it('assumptions P1–P8 only where they apply; none without a grid', () => {
    const hero = estimate();
    expect(hero.assumptions.map((a) => a.id)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7']);
    expect(hero.assumptions.find((a) => a.id === 'P2')?.text).toBe(
      'Pró-labore de 1 salário mínimo (R$ 1.621,00)',
    );
    const recent = estimate({}, { activityStartDate: '2026-02-01' });
    expect(recent.assumptions.map((a) => a.id)).toContain('P8');
    expect(
      estimate({
        receivesFromAbroad: 'no',
        hasEmployees: 'no',
        monthlyRevenueBracket: 'from_15k_to_30k',
      }).assumptions.map((a) => a.id),
    ).toEqual(['P1', 'P2', 'P3', 'P5', 'P6', 'P7']);
    expect(estimate({ monthlyRevenueBracket: 'dont_know' }).assumptions).toEqual([]);
  });

  it('a company opened less than 13 months ago gets the after-the-1st-year range (P8), not an error', () => {
    const recent = estimate({}, { activityStartDate: '2026-02-01' });
    expect(recent.type).toBe('range');
    expect(recent.type === 'range' && recent.total).toEqual(
      (estimate() as { total: [Cents, Cents] }).total,
    );
  });

  it('an unknown parameter set returns the engine error, not an exception', () => {
    const r = estimateByProfile(HERO_PROFILE, HERO_ANSWERS, { ...ANALYSIS, parameters: 'nope' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('UNKNOWN_PARAMETER_SET');
  });

  it('C.11.7 messages exist for every reason, in Portuguese', () => {
    expect(Object.keys(NO_RANGE_MESSAGES)).toHaveLength(10);
    expect(NO_RANGE_MESSAGES.CNAE_OUT_OF_SCOPE).toContain('{cnae}');
    expect(formatProfileRange([brl('71.664,28'), brl('1.419.090,76')])).toBe(
      'de R$ 71 mil a R$ 1.420 mil',
    );
  });
});
