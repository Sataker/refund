// D50 (PLAN §18): with the full CNAE table, a commerce company gets the profile estimate in Anexo I (ENGINE-SPEC C.11,
// E.4). Synthetic cosmetics retailer (4772-5/00: LC 123, art. 18, § 4º, I; monofásico resale, E.5).
//
// Oracle by hand (2028 steady state, C.11.9: LC 214, Anexo XVIII = LC 123, Anexo I for 2027–2028, wording of LC 227;
// each tax rounded half-up separately, D12; every decimal place kept, PGDAS-D manual item 12). Not subject to the
// Fator R, so the payroll is 0 and R01 is absent (C.11.2); R06 has no default % (D.6), so the grid total is R05 alone.
//   DAS_I(30.000), RBT12 360.000, 2nd bracket, effective (360.000 × 7,3% − 5.940) / 360.000 = 5,65%:
//     IRPJ 93,23 + CSLL 59,33 + CBS 259,84 + IBS 2,88 + CPP 703,43 + ICMS 576,30 = 1.695,01
//   s = 0,5: domestic 15.000 (RBT12 180.000, 4%) = 600,00; export 15.000 (RBT12 180.000, 4%) without CBS, IBS and
//     ICMS = IRPJ 33,00 + CSLL 21,00 + CPP 249,00 = 303,00 → segregated 903,00 → R05 = 12 × 792,01 = 9.504,12 (minimum)
//   DAS_I(60.000), RBT12 720.000, 3rd bracket, effective (720.000 × 9,5% − 13.860) / 720.000 = 7,575%: 4.545,02
//   s = 0,75: domestic 15.000 = 600,00; export 45.000 (RBT12 540.000, 3rd bracket, effective 6,933…%): IRPJ 171,60 +
//     CSLL 109,20 + CPP 1.310,40 = 1.591,20 → segregated 2.191,20 → R05 = 12 × 2.353,82 = 28.245,84 (maximum)
//   Displayed: [r2(0,85 × 9.504,12) = 8.078,50; 28.245,84]; ratio 3,50 ≤ 10 (C.11.5, item 10).
import { describe, expect, it } from 'vitest';
import { brl } from '../../src/money.ts';
import { cnaeAnexoRow, cnaeInScope, estimateByProfile } from '../../src/profile.ts';
import type { ProfileAnswers, ProfileEstimate, PublicProfile } from '../../src/types.ts';

const COSMETICS: PublicProfile = {
  cnpj: 'RFCOSM01000136',
  primaryCnae: '4772-5/00',
  isActive: true,
  optedIntoSimples: true,
  optedIntoMei: false,
  size: 'ME',
  activityStartDate: '2019-03-01',
  uf: 'SP',
};

function estimate(answers: ProfileAnswers): ProfileEstimate {
  const r = estimateByProfile(COSMETICS, answers, { analysisDate: '2026-11-12' });
  if (!r.ok) throw new Error(r.error.code);
  return r.value;
}

describe('D50: profile estimate of a commerce company (4772-5/00, Anexo I)', () => {
  it('the row is verified Anexo I, no Fator R, monofásico resale, and in scope', () => {
    expect(cnaeAnexoRow('4772-5/00')).toMatchObject({
      baseAnexo: 'I',
      subjectToFatorR: false,
      resellsMonofasico: true,
      status: 'verified',
    });
    expect(cnaeInScope('4772-5/00')).toBe(true);
  });

  it('30–60 mil, half or more abroad → range [8.078,50; 28.245,84]; 9 scenarios; R05, R06, R02', () => {
    const e = estimate({
      monthlyRevenueBracket: 'from_30k_to_60k',
      hasEmployees: 'dont_know',
      receivesFromAbroad: 'half_or_more',
    });
    expect(e.type).toBe('range');
    if (e.type !== 'range') return;
    expect(e.total).toEqual([brl('8.078,50'), brl('28.245,84')]);
    expect(e.gridTotal).toEqual([brl('9.504,12'), brl('28.245,84')]);
    expect(e.scenarios.map((s) => [s.id, s.annualRegimeTotal])).toEqual([
      ['R3000000-S0.5-F0', brl('9.504,12')],
      ['R3000000-S0.75-F0', brl('9.786,36')],
      ['R3000000-S1-F0', brl('10.068,24')],
      ['R4500000-S0.5-F0', brl('16.716,36')],
      ['R4500000-S0.75-F0', brl('19.486,20')],
      ['R4500000-S1-F0', brl('18.345,60')],
      ['R6000000-S0.5-F0', brl('23.928,24')],
      ['R6000000-S0.75-F0', brl('28.245,84')],
      ['R6000000-S1-F0', brl('26.724,72')],
    ]);
    expect(e.scenarios.every((s) => s.byRule.R01 === 0)).toBe(true);
    expect(e.rules.map((r) => r.ruleId)).toEqual(['R05', 'R06', 'R02']);
    expect(e.rules.find((r) => r.ruleId === 'R06')?.range).toBeUndefined();
  });

  it('no clients abroad → NO_RULE_WITH_VALUE (no Fator R, R06 has no default %): no number is invented', () => {
    const e = estimate({
      monthlyRevenueBracket: 'from_30k_to_60k',
      hasEmployees: 'dont_know',
      receivesFromAbroad: 'no',
    });
    expect(e.type).toBe('no_range');
    if (e.type === 'no_range') expect(e.reason).toBe('NO_RULE_WITH_VALUE');
    expect(e.rules.map((r) => r.ruleId)).toEqual(['R06', 'R02']);
  });

  it('an ambiguous, an impeditive and an adjusted-anexo CNAE stay out of scope (CNAE_OUT_OF_SCOPE)', () => {
    const answers: ProfileAnswers = {
      monthlyRevenueBracket: 'from_30k_to_60k',
      hasEmployees: 'yes',
      receivesFromAbroad: 'half_or_more',
    };
    for (const primaryCnae of ['4635-4/02', '1220-4/01', '6110-8/01']) {
      const r = estimateByProfile({ ...COSMETICS, primaryCnae }, answers, {
        analysisDate: '2026-11-12',
      });
      expect(r.ok && r.value.type === 'no_range' && r.value.reason).toBe('CNAE_OUT_OF_SCOPE');
    }
  });

  // D52 (approved by Enzo 20/11 after a green audit): Anexo IV is in scope. Oracle by hand (2028 steady state, LC 214,
  // Anexo XXI = LC 123, Anexo IV for 2027–2028; per-tax half-up rounding, D12). No Fator R (§ 5º-C), so R05 alone:
  //   minimum R 30.000, s 0,5: unsegregated 30.000 at RBT12 360.000, 2nd bracket (360.000 × 9% − 8.100) / 360.000 =
  //     6,75% → IRPJ 400,95 + CSLL 307,80 + CBS 500,78 + IBS 5,47 + ISS 810,00 = 2.025,00; segregated: domestic 15.000
  //     (RBT12 180.000, 4,5%) = 126,90 + 102,60 + 143,51 + 1,62 + 300,38 = 675,01, export 15.000 keeps IRPJ 126,90 +
  //     CSLL 102,60 = 229,50 → 904,51; R05 = 12 × 1.120,49 = 13.445,88
  //   maximum R 60.000, s 1: RBT12 720.000, 3rd bracket (720.000 × 10,2% − 12.420) / 720.000 = 8,475% → 5.085,00 =
  //     IRPJ 1.057,68 + CSLL 772,92 + CBS 1.207,18 + IBS 13,22 + ISS 2.034,00; kept 1.830,60 → R05 = 12 × 3.254,40 =
  //     39.052,80
  //   Displayed: [r2(0,85 × 13.445,88) = 11.429,00; 39.052,80]; ratio 3,42 ≤ 10.
  it('an Anexo IV CNAE (4120-4/00) gets an estimate: [11.429,00; 39.052,80], R05 and R02', () => {
    const r = estimateByProfile(
      { ...COSMETICS, primaryCnae: '4120-4/00' },
      {
        monthlyRevenueBracket: 'from_30k_to_60k',
        hasEmployees: 'yes',
        receivesFromAbroad: 'half_or_more',
      },
      { analysisDate: '2026-11-12' },
    );
    if (!r.ok || r.value.type !== 'range') throw new Error('expected a range');
    expect(r.value.gridTotal).toEqual([brl('13.445,88'), brl('39.052,80')]);
    expect(r.value.total).toEqual([brl('11.429,00'), brl('39.052,80')]);
    expect(r.value.rules.map((x) => x.ruleId)).toEqual(['R05', 'R02']);
  });
});
