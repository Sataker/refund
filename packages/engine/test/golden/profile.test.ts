// ENGINE-SPEC C.11.10 tests T11-01…T11-18 (values in R$ written as in the spec; compared in cents).
// Hero = the public CNPJ data of `dev-exportador` (fixtures/profile.ts, copied from the persona).
import { describe, expect, it } from 'vitest';
import { brl } from '../../src/money.ts';
import {
  type CNAE_ANEXO,
  CNAE_IN_SCOPE,
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

// C.11.9 blocks of the 30–60 grid (hero answers): every cell of the table, by scenario id and rule. Values as
// corrected on 15/11 (C.11.9 †): manual item 12 (every decimal place), D12 and the LC 214 annexes in the 2028 steady state.
// E.g. e = 55.260/540.000 at precision 34: 45.000 × e = 4.604,999…, and × the CSLL share rounds to 161,175 → 161,18.
const JUST = { 3000000: 677800, 4500000: 1097800, 6000000: 1517800 } as const;
const R01_LIM = { 3000000: '28.942,68', 4500000: '39.544,68', 6000000: '50.146,68' } as const;
const R05_III = {
  3000000: ['14.662,80', '14.931,96', '15.201,36'],
  4500000: ['23.752,20', '28.309,20', '27.132,72'],
  6000000: ['32.841,36', '40.632,60', '39.063,96'],
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
    expect(e.type === 'no_range' && e.gridTotal).toEqual([brl('2.651,28'), brl('44.144,04')]);
    expect(e.scenarios).toHaveLength(27);
    // Maximum (30.000; 1; just below) = 28.942,68 + 15.201,36.
    const max = e.scenarios.find((s) => s.id === 'R3000000-S1-F677800');
    expect(max?.byRule).toEqual({ R01: brl('28.942,68'), R05: brl('15.201,36') });
    // Minimum (15.000; 0,5; boundary): 12 × (900,00 − 679,06) in the 2028 tables (CBS 69,44 + IBS 0,77).
    const min = e.scenarios.find((s) => s.id === 'R1500000-S0.5-F257900');
    expect(min?.annualRegimeTotal).toBe(brl('2.651,28'));
    expect(ids(e.rules)).toEqual(['R01', 'R05', 'R02']);
    expect(e.rules.every((r) => r.range === undefined)).toBe(true);
  });

  it('T11-03: HERO from_30k_to_60k → [12.463,38; 90.779,28] ("de R$ 12 mil a R$ 91 mil")', () => {
    const e = estimate();
    expect(e.type).toBe('range');
    if (e.type !== 'range') return;
    expect(e.total).toEqual([1246338, 9077928]);
    expect(e.gridTotal).toEqual([brl('14.662,80'), brl('90.779,28')]);
    expect(e.label).toBe('estimativa por perfil');
    expect(e.unit).toBe('per_year_in_regime');
    expect(e.scenarios).toHaveLength(27);
    // Display "de R$ 12 mil a R$ 91 mil" (C.11.4: minimum down, maximum up, to the thousand).
    expect(rangeInThousands(e.total)).toEqual([12, 91]);
    expect(formatProfileRange(e.total)).toBe('de R$ 12 mil a R$ 91 mil');
    // Minimum (30.000; 0,5; boundary): R05_III only.
    const min = e.scenarios.find((s) => s.id === 'R3000000-S0.5-F677900');
    expect(min?.byRule).toEqual({ R01: 0, R05: brl('14.662,80') });
    // Maximum (60.000; 0,75; just below): R01lim 50.146,68 + R05_III 12 × (6.630,00 − 3.243,95) = 40.632,60.
    const max = e.scenarios.find((s) => s.id === 'R6000000-S0.75-F1517800');
    expect(max?.byRule).toEqual({ R01: brl('50.146,68'), R05: brl('40.632,60') });
    expect(max?.annualRegimeTotal).toBe(brl('90.779,28'));
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

  it('T11-03: C.11.9 blocks reproduced to the cent (54 cells)', () => {
    for (const c of BLOCK_CELLS) {
      expect(cellValue(c.id, c.rule), `${c.id} ${c.rule}`).toBe(brl(c.expected));
    }
    expect(BLOCK_CELLS).toHaveLength(54);
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
    // Maximum (300.000; 0,75; just below), DAS_III(300.000) = 52.530,01 in the 2028 tables (D12).
    const max = e.scenarios.find((s) => s.id === 'R30000000-S0.75-F8237800');
    expect(max?.byRule).toEqual({ R01: brl('131.578,68'), R05: brl('287.512,08') });
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

  it('T11-09: employees and abroad dont_know → 45 scenarios; gridTotal [0; 90.779,28]', () => {
    const e = estimate({ hasEmployees: 'dont_know', receivesFromAbroad: 'dont_know' });
    expectNoRange(e, 'MINIMUM_BELOW_FLOOR');
    expect(e.scenarios).toHaveLength(45);
    expect(e.type === 'no_range' && e.gridTotal).toEqual([0, brl('90.779,28')]);
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

  it('T11-15: 4635-4/02 (ambiguous, Res. CGSN 140, Anexo VII) → CNAE_OUT_OF_SCOPE (R02 listed)', () => {
    // D51 (Enzo, 20/11): dentistry (8630-5/04) became verified (LC 123, art. 18, § 5º-B, XX + § 5º-M, I), so the
    // "not calculated" example is an ambiguous row.
    const e = estimate({}, { primaryCnae: '4635-4/02' });
    expectNoRange(e, 'CNAE_OUT_OF_SCOPE');
    expect(ids(e.rules)).toEqual(['R02']);
    // D50 (Enzo, 20/11): 7020-4/00 became verified (LC 123 art. 18 § 5º-I, IX); the table now has every CNAE 2.3
    // subclass, so "absent" is a code that is not a subclass.
    expectNoRange(estimate({}, { primaryCnae: '0000-0/00' }), 'CNAE_OUT_OF_SCOPE');
  });

  // D51 (Enzo, 20/11): dentistry, LC 123, art. 18, § 5º-B, XX + § 5º-M, I (Res. CGSN 140, art. 25, § 1º, V, "n"):
  // Anexo III with a Fator R of 28% or more, V below. Answers: 15–30 mil, no employees, no clients abroad → f = 0 and
  // s = 0 (C.11.2), so only R01 can carry a value. By hand (C.11.9 conventions; 2028 steady state = LC 214 Anexos XX
  // (III) and XXII (V); each tax rounded half-up separately, D12; R01 at P* = 0,29 × R, D.1):
  //   R = 15.000, RBT12 180.000, 1st bracket:
  //     DAS_V = 15.000 × 15,5% → 581,25 + 348,75 + CBS 394,32 + IBS 4,42 + 670,76 + 325,50 = 2.325,00
  //     DAS_III = 15.000 × 6% → 36,00 + 31,50 + CBS 138,87 + IBS 1,53 + 390,60 + 301,50 = 900,00
  //     P* = 4.350,00; INSS 11% = 478,50 (at 1 SM: 178,31); annual RT 52.200 ≤ 60.000 → no IR
  //     R01 = 12 × (2.325,00 − 900,00) − 12 × (478,50 − 178,31) = 17.100,00 − 3.602,28 = 13.497,72 (maximum)
  //   R = 30.000, RBT12 360.000, 2nd bracket:
  //     DAS_V = 30.000 × (360.000 × 18% − 4.500) / 360.000 = 16,75% → 1.155,75 + 753,75 + 852,24 + 9,55 + 1.399,46
  //       + 854,25 = 5.025,00
  //     DAS_III = 30.000 × (360.000 × 11,2% − 9.360) / 360.000 = 8,6% → 103,20 + 90,30 + 436,28 + 4,90 + 1.119,72
  //       + 825,60 = 2.580,00
  //     P* = 8.700,00; INSS at the ceiling 932,31; annual IR on RT 104.400 = (104.400 − 17.640) × 27,5% − 10.904,66
  //       = 12.954,34
  //     R01 = 12 × 2.445,00 − 12 × 754,00 − 12.954,34 = 29.340,00 − 9.048,00 − 12.954,34 = 7.337,66 (minimum)
  //   Displayed: [r2(0,85 × 7.337,66) = 6.237,01; 13.497,72]; ratio 2,16 ≤ 10.
  it('D51: 8630-5/04 (dentistry, Anexo III with Fator R) is in scope: 15–30 mil, no employees, no abroad → range', () => {
    const e = estimate(
      { monthlyRevenueBracket: 'from_15k_to_30k', hasEmployees: 'no', receivesFromAbroad: 'no' },
      { primaryCnae: '8630-5/04' },
    );
    expectRange(e, '6.237,01', '13.497,72');
    if (e.type !== 'range') return;
    expect(e.gridTotal).toEqual([brl('7.337,66'), brl('13.497,72')]);
    expect(e.scenarios.map((s) => s.id)).toEqual([
      'R1500000-S0-F0',
      'R2250000-S0-F0',
      'R3000000-S0-F0',
    ]);
    expect(e.scenarios[0]?.byRule).toEqual({ R01: brl('13.497,72'), R05: 0 });
    expect(e.scenarios[2]?.byRule).toEqual({ R01: brl('7.337,66'), R05: 0 });
    expect(ids(e.rules)).toEqual(['R01', 'R02']);
    expect(rule(e, 'R01')?.range).toEqual([brl('6.237,01'), brl('13.497,72')]);
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

// ---------- T11-18: properties over every answer combination of the table's verified CNAEs ----------

describe('T11-18 — properties of every estimate (96 combinations × verified CNAEs)', () => {
  // D50 (Enzo, 20/11): the table has every CNAE 2.3 subclass, so one row per distinct estimate profile
  // (baseAnexo, subjectToFatorR, resellsMonofasico === true) among the rows the estimate computes (C.11.5 item 4); the
  // pre-D50 rows are the representatives where they exist (the hero's CNAE first). The estimate reads nothing else of
  // the row, which the dedup test below proves on two rows of the same profile.
  const profileKey = (r: (typeof CNAE_ANEXO)[number]) =>
    `${r.baseAnexo}|${r.subjectToFatorR}|${r.resellsMonofasico === true}`;
  const preferred = ['6201-5/01', '4771-7/01'];
  const ordered = [
    ...CNAE_IN_SCOPE.filter((r) => preferred.includes(r.cnae)),
    ...CNAE_IN_SCOPE.filter((r) => !preferred.includes(r.cnae)),
  ];
  const representatives = new Map<string, (typeof CNAE_ANEXO)[number]>();
  for (const r of ordered)
    if (!representatives.has(profileKey(r))) representatives.set(profileKey(r), r);
  const results: { answers: ProfileAnswers; e: ProfileEstimate }[] = [];
  for (const row of representatives.values()) {
    for (const answers of allAnswers()) {
      results.push({ answers, e: estimate(answers, { primaryCnae: row.cnae }) });
    }
  }

  // Same profile as the hero's row (Anexo III, Fator R): computed here, like `results`, outside the test timeout.
  const twin = [...allAnswers()].map((answers) => ({
    answers,
    web: estimate(answers, { primaryCnae: '6201-5/02' }),
  }));

  it('dedup: two rows with the same profile give identical cents (6201-5/01 and 6201-5/02)', () => {
    expect([...representatives.values()].map((r) => r.cnae)).toContain('6201-5/01');
    const cents = (e: ProfileEstimate) => ({
      type: e.type,
      total: e.type === 'range' ? e.total : null,
      gridTotal: 'gridTotal' in e ? e.gridTotal : null,
      scenarios: e.scenarios.map((s) => [s.id, s.annualRegimeTotal, s.byRule.R01, s.byRule.R05]),
      ranges: e.rules.map((r) => [r.ruleId, r.range ?? null]),
    });
    for (const { answers, web } of twin) {
      expect(cents(web)).toEqual(cents(estimate(answers, { primaryCnae: '6201-5/01' })));
    }
  });

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
