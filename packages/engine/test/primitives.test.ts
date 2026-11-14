// TESTS §2.1: primitives of ENGINE-SPEC C.3 beyond the official oracles (rounding points, boundaries, errors).
import { describe, expect, it } from 'vitest';
import { brl } from '../src/money.ts';
import { monthlyWithholding } from '../src/primitives/dividends.ts';
import { cppOutsideDas, inssEmployee, inssPartner } from '../src/primitives/inss.ts';
import { annualIr, annualTable, monthlyIr, reductionOf } from '../src/primitives/irpf.ts';
import {
  anexoForPa,
  dasByMarket,
  dasForPa,
  effectiveRate,
  fatorR,
  fs12,
  issThreshold,
  proportionalRbt12,
  rbt12,
  window,
} from '../src/primitives/simples.ts';
import type { Distribution, Series } from '../src/types.ts';

describe('monthlyIr (C.3.1)', () => {
  it('adds dependents to the legal deductions before comparing with the simplified discount', () => {
    // INSS 649,60 + 1 dependent 189,59 = 839,19 > 607,20.
    const r = monthlyIr(brl('6.000,00'), brl('649,60'), 1, '2026-01');
    expect(r.usedSimplifiedDiscount).toBe(false);
    expect(r.deduction).toBe(brl('839,19'));
    expect(r.base).toBe(brl('5.160,81'));
  });

  it('writes a trace of 4 steps, each pointing to its parameter when it uses one', () => {
    const r = monthlyIr(brl('6.000,00'), brl('649,60'), 0, '2026-03', { stepPrefix: 'R01' });
    expect(r.steps.map((s) => s.id)).toEqual([
      'R01.BASE.2026-03',
      'R01.TABLE_TAX.2026-03',
      'R01.REDUCTION.2026-03',
      'R01.IR.2026-03',
    ]);
    expect(r.steps.at(-1)?.result.value).toBe(r.ir);
    expect(r.steps[2]?.ref?.url).toContain('L15270');
    expect(r.steps[0]?.label).toBe('Base com deduções legais');
  });

  it('rejects an invalid number of dependents', () => {
    expect(() => monthlyIr(brl('1.000,00'), brl('0,00'), -1, '2026-01')).toThrow(RangeError);
  });

  it('caps the reduction at zero in the linear band', () => {
    const r = {
      fullUpTo: 500000,
      full: 31289,
      linearUpTo: 1000000,
      constant: 97862,
      coefficient: '0.2',
    };
    // 0,2 × 9.000,00 = 1.800,00 > 978,62 → 0, never negative.
    expect(reductionOf(brl('9.000,00'), r as Parameters<typeof reductionOf>[1])).toBe(0);
  });
});

describe('annualIr (C.3.2)', () => {
  it('T04-03 boundary: at RT 60.000,01 the 2nd-bracket formula gives 2.695,23 (text of the law, not "fixed")', () => {
    const r = annualIr(2026, brl('60.000,01'), brl('0,00'), brl('0,00'), true);
    // Full model, no deductions: base 60.000,01 → r2(16.500,00275) − 10.904,66 = 5.595,34; reduction 2.695,23.
    expect(r.full.tableTax).toBe(brl('5.595,34'));
    expect(r.full.reduction).toBe(brl('2.695,23'));
    expect(r.full.ir).toBe(brl('2.900,11'));
    // Simplified: discount 12.000,00 (20%) → base 48.000,01 → 2.694,15, fully reduced.
    expect(r.simplified.discount).toBe(brl('12.000,00'));
    expect(r.model).toBe('simplified');
    expect(r.ir).toBe(0);
  });

  it('applies the 17.640,00 cap on the simplified discount and picks the full model when it is cheaper', () => {
    const r = annualIr(2026, brl('200.000,00'), brl('60.000,00'), brl('0,00'), true);
    expect(r.simplified.discount).toBe(brl('17.640,00'));
    expect(r.simplified.reduction).toBe(0);
    expect(r.model).toBe('full');
    expect(r.ir).toBe(r.full.ir);
    expect(r.full.ir).toBe(annualTable(brl('140.000,00'), 2026));
  });

  it('PGBL deducts up to 12% of RT, only with RGPS/RPPS contribution', () => {
    const withRgps = annualIr(2026, brl('200.000,00'), brl('0,00'), brl('30.000,00'), true);
    expect(withRgps.full.pgblDeduction).toBe(brl('24.000,00'));
    const without = annualIr(2026, brl('200.000,00'), brl('0,00'), brl('30.000,00'), false);
    expect(without.full.pgblDeduction).toBe(0);
  });

  it('ties go to the simplified model and the zero bracket pays nothing', () => {
    const r = annualIr(2026, brl('20.000,00'), brl('0,00'), brl('0,00'), true);
    expect(r.model).toBe('simplified');
    expect(r.ir).toBe(0);
    expect(() => annualIr(26, brl('1,00'), brl('0,00'), brl('0,00'), true)).toThrow(RangeError);
  });
});

describe('INSS (C.3.3)', () => {
  it('partner: 11% capped at the ceiling → 932,31', () => {
    expect(inssPartner(brl('5.000,00'), '2026-01')).toBe(brl('550,00'));
    expect(inssPartner(brl('8.475,55'), '2026-01')).toBe(brl('932,31'));
    expect(inssPartner(brl('20.000,00'), '2026-01')).toBe(brl('932,31'));
  });

  it('employee: exact progressive sum, one rounding at the end → 988,09 at the ceiling', () => {
    expect(inssEmployee(brl('1.621,00'), '2026-01')).toBe(brl('121,58')); // 121,575
    expect(inssEmployee(brl('8.475,55'), '2026-01')).toBe(brl('988,09')); // 988,0914
    expect(inssEmployee(brl('15.000,00'), '2026-01')).toBe(brl('988,09'));
    expect(inssEmployee(brl('0,00'), '2026-01')).toBe(0);
  });

  it('CPP outside the DAS only in Anexo IV', () => {
    expect(cppOutsideDas(brl('5.000,00'), 'IV', '2026-01')).toBe(brl('1.000,00'));
    expect(cppOutsideDas(brl('5.000,00'), 'III', '2026-01')).toBe(0);
    expect(cppOutsideDas(brl('5.000,00'), 'V', '2026-01')).toBe(0);
  });
});

describe('DAS (C.3.4)', () => {
  it('applies the 5% ISS cap in the 5th bracket of Anexo III (federal taxes split e − 5%)', () => {
    // RBT12 3.600.000 → e = (756.000 − 125.640) / 3.600.000 = 17,51% > 14,92537%.
    expect(issThreshold('III', '2026-06')).toBe('0.1492537');
    const r = dasByMarket(brl('100.000,00'), brl('3.600.000,00'), 'III', 'domestic', '2026-06');
    expect(r.effectiveRate).toBe('0.1751');
    expect(r.byTax).toEqual({
      ISS: brl('5.000,00'),
      IRPJ: brl('753,10'), // 12.510 × 6,02%
      CSLL: brl('658,03'), // 12.510 × 5,26% = 658,026
      COFINS: brl('2.411,93'), // 12.510 × 19,28% = 2.411,928
      PIS: brl('522,92'), // 12.510 × 4,18% = 522,918
      CPP: brl('8.164,03'), // 12.510 × 65,26% = 8.164,026
    });
    expect(r.subtotal).toBe(brl('17.510,01'));
    expect(r.steps[1]?.formula).toContain('ISS = 5% da receita');
  });

  it('keeps the plain apportionment in the 5th bracket while e ≤ 14,92537% and has no cap in Anexos I and V', () => {
    const r = dasByMarket(brl('10.000,00'), brl('2.000.000,00'), 'III', 'domestic', '2026-06');
    // e = (420.000 − 125.640) / 2.000.000 = 14,718% ≤ 14,92537%.
    expect(r.byTax.ISS).toBe(brl('493,05')); // 10.000 × 14,718% × 33,50% = 493,053
    expect(issThreshold('V', '2026-06')).toBeNull();
    expect(issThreshold('I', '2026-06')).toBeNull();
  });

  it('monofásico: PIS and Cofins only on the non-monofásico part; requires the percentage (D.6)', () => {
    const full = dasByMarket(brl('100.000,00'), brl('300.000,00'), 'I', 'domestic', '2026-06');
    const mono = dasByMarket(brl('100.000,00'), brl('300.000,00'), 'I', 'domestic', '2026-06', {
      segregateMonofasico: true,
      monofasicoPct: '0.5' as never,
    });
    expect(mono.byTax.COFINS).toBe(brl('338,88')); // 677,768 / 2 = 338,884
    expect(mono.byTax.PIS).toBe(brl('73,42')); // 146,832 / 2 = 73,416
    expect(mono.byTax.IRPJ).toBe(full.byTax.IRPJ);
    expect(() =>
      dasByMarket(brl('1,00'), brl('1,00'), 'I', 'domestic', '2026-06', {
        segregateMonofasico: true,
      }),
    ).toThrow(RangeError);
  });

  it('not segregated: revenues merged into one domestic market with the TOTAL RBT12 (C.3.4 DECISION)', () => {
    const merged = dasForPa({
      pa: '2026-06',
      anexo: 'I',
      domestic: { revenue: brl('100.000,00'), rbt12: brl('2.000.000,00') },
      export: { revenue: brl('50.000,00'), rbt12: brl('1.000.000,00') },
    });
    expect(merged.byMarket).toHaveLength(1);
    expect(merged.byMarket[0]?.revenue).toBe(brl('150.000,00'));
    // RBT12 3.000.000 → e = (429.000 − 87.300) / 3.000.000 = 11,39%.
    expect(merged.byMarket[0]?.effectiveRate).toBe('0.1139');
    expect(merged.steps.map((s) => s.id)).toEqual([
      'DAS.DOMESTIC.EFFECTIVE_RATE.2026-06',
      'DAS.DOMESTIC.2026-06',
    ]);
  });

  it('2027: CBS/IBS replace PIS/Cofins and are disregarded on segregated exports', () => {
    const r = dasForPa({
      pa: '2027-03',
      anexo: 'III',
      domestic: { revenue: brl('10.000,00'), rbt12: brl('540.000,00') },
      export: { revenue: brl('40.000,00'), rbt12: brl('540.000,00') },
      segregateExport: true,
    });
    const [domestic, foreign] = r.byMarket;
    expect(Object.keys(domestic?.byTax ?? {}).sort()).toEqual([
      'CBS',
      'CPP',
      'CSLL',
      'IBS',
      'IRPJ',
      'ISS',
    ]);
    expect(foreign?.byTax.CBS).toBe(0);
    expect(foreign?.byTax.IBS).toBe(0);
    expect(foreign?.byTax.ISS).toBe(0);
    expect(foreign?.byTax.CPP).toBeGreaterThan(0);
  });

  it('rejects RBT12 above the last bracket, negative RBT12 and anexos without a table', () => {
    expect(() => effectiveRate(brl('4.800.000,01'), 'III', '2026-06')).toThrow(RangeError);
    expect(() => effectiveRate(-1 as never, 'III', '2026-06')).toThrow(RangeError);
    expect(() => effectiveRate(brl('1,00'), 'II', '2026-06')).toThrow(RangeError);
    expect(() => effectiveRate(brl('1,00'), 'IV', '2026-06')).toThrow(RangeError);
  });
});

describe('window, RBT12, FS12, Fator R and anexo (C.3.5)', () => {
  it('T01-08: PA 12/2026 and 01/2027 share the window dec/2025–nov/2026', () => {
    expect(window('2026-12')).toEqual(['2025-12', '2026-11']);
    expect(window('2027-01')).toEqual(['2025-12', '2026-11']);
    expect(window('2027-02')).toEqual(['2026-01', '2026-12']);
    expect(window('2027-01', 'simples.fatorR.window')).toEqual(['2025-12', '2026-11']);
  });

  const series = (from: number, to: number, amount: string): Series => {
    const out: Series = {};
    for (let m = from; m <= to; m++)
      out[`2026-${String(m).padStart(2, '0')}` as keyof Series] = brl(amount);
    return out;
  };

  it('sums RBT12 (accrual) and FS12 (cash) over the window; distributions never enter', () => {
    const revenue = { ...series(1, 12, '10.000,00'), '2025-12': brl('10.000,00') } as Series;
    expect(rbt12('2026-12', revenue)).toBe(brl('120.000,00')); // 2025-12 … 2026-11
    expect(rbt12('2027-01', revenue)).toBe(brl('120.000,00'));
    expect(rbt12('2027-02', revenue)).toBe(brl('120.000,00')); // 2026-01 … 2026-12
    const payroll = {
      cltGrossPay: series(1, 11, '2.000,00'),
      fgtsPaid: series(1, 11, '160,00'),
      cppOutsideDas: {},
      proLabore: series(6, 11, '1.000,00'),
    };
    expect(fs12('2026-12', payroll)).toBe(brl('29.760,00')); // 11 × 2.160 + 6 × 1.000
  });

  it('Fator R at 27,99% stays in Anexo V; 28,00% goes to Anexo III (REVISÃO M2)', () => {
    const company = { subjectToFatorR: true, baseAnexo: 'V' as const };
    expect(
      anexoForPa(fatorR(brl('27.990,00'), brl('100.000,00'), '2026-06').value, company, '2026-06'),
    ).toBe('V');
    expect(
      anexoForPa(fatorR(brl('28.000,00'), brl('100.000,00'), '2026-06').value, company, '2026-06'),
    ).toBe('III');
    // Full precision: 0,27999… is V even though it would display as 0,27.
    const almost = fatorR(brl('27.999,99'), brl('100.000,00'), '2026-06');
    expect(almost.display).toBe('0.27');
    expect(anexoForPa(almost.value, company, '2026-06')).toBe('V');
  });

  it('a CNAE not subject to the Fator R keeps its base anexo; a subject one needs the Fator R', () => {
    expect(anexoForPa(null, { subjectToFatorR: false, baseAnexo: 'I' }, '2026-06')).toBe('I');
    expect(() => anexoForPa(null, { subjectToFatorR: true, baseAnexo: 'V' }, '2026-06')).toThrow(
      RangeError,
    );
    expect(() => fatorR(-1 as never, brl('1,00'), '2026-06')).toThrow(RangeError);
  });

  it('writes the Fator R step truncated for display', () => {
    const r = fatorR(brl('27.740,00'), brl('100.000,00'), '2026-06', { stepPrefix: 'R01' });
    expect(r.steps[0]).toMatchObject({
      id: 'R01.FATOR_R.2026-06',
      rounding: 'TRUNC_2_DECIMALS_DISPLAY',
      result: { value: '0.27', unit: 'rate' },
    });
  });

  it('manual 8.3 example: opened in feb, 4th month (may) → average (10.000 + 0 + 590.000) / 3 × 12 = 2.400.000', () => {
    const revenue: Series = {
      '2026-02': brl('10.000,00'),
      '2026-03': brl('0,00'),
      '2026-04': brl('590.000,00'),
    };
    expect(proportionalRbt12('2026-05', '2026-02', revenue).toFixed()).toBe('2400000');
    expect(
      effectiveRate(proportionalRbt12('2026-05', '2026-02', revenue), 'III', '2026-05').bracket,
    ).toBe(5);
    expect(() => proportionalRbt12('2027-02', '2026-02', revenue)).toThrow(RangeError);
    expect(() => proportionalRbt12('2026-01', '2026-02', revenue)).toThrow(RangeError);
  });
});

describe('monthlyWithholding (C.3.6)', () => {
  const d = (amount: string, extra: Partial<Distribution> = {}): Distribution => ({
    month: '2026-03',
    payerCnpj: 'RFDEV001000100',
    grossAmount: brl(amount),
    irrfWithheld: brl('0,00'),
    profitThrough2025Approved: false,
    ...extra,
  });

  it('withholds 10% on the TOTAL of the month only above 50.000,00 (RFB Qs. 4 and 7)', () => {
    expect(monthlyWithholding('2026-03', 'RFDEV001000100', [d('50.000,00')]).withholding).toBe(0);
    const r = monthlyWithholding('2026-03', 'RFDEV001000100', [d('30.000,00'), d('30.000,00')]);
    expect(r.total).toBe(brl('60.000,00'));
    expect(r.withholding).toBe(brl('6.000,00'));
  });

  it('ignores other months, other payers and profits through 2025 approved by 31/12/2025', () => {
    const r = monthlyWithholding('2026-03', 'RFDEV001000100', [
      d('40.000,00'),
      d('40.000,00', { profitThrough2025Approved: true }),
      d('40.000,00', { payerCnpj: 'RFDEV002000100' }),
      d('40.000,00', { month: '2026-04' }),
    ]);
    expect(r).toEqual({ total: brl('40.000,00'), withholding: 0 });
  });
});
