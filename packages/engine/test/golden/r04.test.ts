// ENGINE-SPEC D.4 tests T04-01…T04-13 (calendar year 2026).
import { describe, expect, it } from 'vitest';
import { analyze } from '../../src/analyze.ts';
import { resolveAssumptions } from '../../src/assumptions.ts';
import { brl } from '../../src/money.ts';
import { annualIr, monthlyIr } from '../../src/primitives/irpf.ts';
import { createCtx } from '../../src/projection.ts';
import { formatBrl } from '../../src/rules/common.ts';
import { optimizerR04, type R04Input } from '../../src/rules/r04.ts';
import { annualPf, deductibleHealth, fixedDeductions } from '../../src/scenario.ts';
import type { Cents, Rate } from '../../src/types.ts';
import { constant, heroFacts, syntheticFacts } from './fixtures/facts.ts';

const r04 = (rt: string, ded: string, o: Partial<R04Input> = {}) =>
  optimizerR04({
    year: 2026,
    rt: brl(rt),
    fullDeductions: brl(ded),
    pgblContributed: 0 as Cents,
    contributesToRgps: true,
    redemptionRate: '0.10' as Rate,
    ...o,
  });

describe('ENGINE-SPEC D.4 — R04', () => {
  it('T04-01: RT 48.000, no deductions → IR 0 → null', () => {
    expect(annualIr(2026, brl('48.000,00'), 0 as Cents, 0 as Cents, true).ir).toBe(0);
    expect(r04('48.000,00', '0,00')).toBeNull();
  });

  it('T04-02: RT 60.000,00, deductions 5.000 → simplified 0,00 (best); full 1.575,00 → null', () => {
    const ir = annualIr(2026, brl('60.000,00'), brl('5.000,00'), 0 as Cents, true);
    expect(ir.simplified.ir).toBe(0);
    expect(ir.full.ir).toBe(brl('1.575,00'));
    expect(r04('60.000,00', '5.000,00')).toBeNull();
  });

  it("T04-03: RT 60.000,01 → simplified 0,00; full 1.573,92 (the law's R$ 1,08 step) → null", () => {
    const ir = annualIr(2026, brl('60.000,01'), brl('5.000,00'), 0 as Cents, true);
    expect(ir.simplified.ir).toBe(0);
    expect(ir.full.ir).toBe(brl('1.573,92'));
    expect(r04('60.000,01', '5.000,00')).toBeNull();
  });

  it('T04-04: RT 88.200, deductions 20.000, RGPS → a* 10.584,00; real gain 1.852,20; cash 2.910,60', () => {
    const p = r04('88.200,00', '20.000,00');
    expect(p?.baseIr).toBe(brl('7.850,33'));
    expect(p?.baseModel).toBe('full');
    expect(p?.contribution).toBe(brl('10.584,00'));
    expect(p?.gain).toBe(brl('1.852,20'));
    expect(p?.cashBenefit).toBe(brl('2.910,60'));
    expect(annualIr(2026, brl('88.200,00'), brl('20.000,00'), 0 as Cents, true).simplified.ir).toBe(
      brl('8.499,33'),
    );
  });

  it('T04-05: RT 88.200,01 → no reduction: simplified 8.499,34, full 7.850,34 (base = full)', () => {
    const ir = annualIr(2026, brl('88.200,01'), brl('20.000,00'), 0 as Cents, true);
    expect(ir.simplified.ir).toBe(brl('8.499,34'));
    expect(ir.full.ir).toBe(brl('7.850,34'));
    expect(ir.model).toBe('full');
  });

  it('T04-06: research 02, RT 144.000, deductions 31.824,58 → full 19.943,58; PGBL 17.280 → gain 3.024,00', () => {
    const p = r04('144.000,00', '31.824,58');
    expect(p?.baseIr).toBe(brl('19.943,58'));
    expect(p?.contribution).toBe(brl('17.280,00'));
    expect(p?.cashBenefit).toBe(brl('4.752,00'));
    expect(p?.provision).toBe(brl('1.728,00'));
    expect(p?.gain).toBe(brl('3.024,00'));
    // Info outside the total: the full model saves 3.900,76 over the simplified one.
    const ir = annualIr(2026, brl('144.000,00'), brl('31.824,58'), 0 as Cents, true);
    expect(ir.simplified.ir - ir.full.ir).toBe(brl('3.900,76'));
  });

  it('T04-07: RT 75.000, INSS 8.250 → simplified 4.333,74; PGBL 9.000 loses 281,25 → not recommended', () => {
    const ir = annualIr(2026, brl('75.000,00'), brl('8.250,00'), 0 as Cents, true);
    expect(ir.ir).toBe(brl('4.333,74'));
    expect(ir.full.ir).toBe(brl('6.189,99'));
    expect(annualIr(2026, brl('75.000,00'), brl('8.250,00'), brl('9.000,00'), true).full.ir).toBe(
      brl('3.714,99'),
    );
    const p = r04('75.000,00', '8.250,00');
    expect(p?.contribution).toBe(0);
    expect(p?.gain).toBe(0);
  });

  it('T04-08: T04-06 with 17.280 already contributed → maxContribution 0, no PGBL finding', () => {
    const p = r04('144.000,00', '31.824,58', { pgblContributed: brl('17.280,00') });
    expect(p?.maxContribution).toBe(0);
    expect(p?.contribution).toBe(0);
  });

  it('T04-09: RT 144.000 from rent only, no RGPS contribution → PGBL not deductible', () => {
    const p = r04('144.000,00', '0,00', { contributesToRgps: false });
    expect(p?.maxContribution).toBe(0);
    expect(p?.contribution).toBe(0);
  });

  it('T04-10: 1 child, school 20.000 in the year → education deduction 3.561,50', () => {
    const f = syntheticFacts();
    f.pfDetails.value.educationExpenses = [{ person: 'child-1', amount: brl('20.000,00') }];
    expect(fixedDeductions(createCtx(f, resolveAssumptions(f)), 2026)).toBe(brl('3.561,50'));
  });

  it('T04-11: nutritionist (8650-0/02) 3.000 + health plan (6550-2/00) 6.000 → only the plan: 6.000,00', () => {
    const f = syntheticFacts();
    f.pfDetails.value.healthExpenses = [
      { amount: brl('3.000,00'), cnaeOrProfession: '8650-0/02', beneficiary: 'holder' },
      { amount: brl('6.000,00'), cnaeOrProfession: '6550-2/00', beneficiary: 'holder' },
      { amount: brl('1.000,00'), cnaeOrProfession: '6550-2/00', beneficiary: 'other' },
    ];
    expect(deductibleHealth(createCtx(f, resolveAssumptions(f)))).toBe(brl('6.000,00'));
  });

  it('T04-12: hero partner, RT 2026 = 11 × 1.621 + 2.260 = 20.091 → null', () => {
    const f = heroFacts();
    const ctx = createCtx(f, resolveAssumptions(f));
    const d = {
      proLabore: brl('2.260,00'),
      segregateExport: true,
      segregateMonofasico: false,
      pgblContribution: {},
    };
    const pf = annualPf(ctx, d, 2026);
    expect(pf.rt).toBe(brl('20.091,00'));
    expect(r04('20.091,00', '0,00')).toBeNull();
  });

  it('T04-13: pró-labore 6.000/month, INSS 660 → IRRF 380,02/month; adjustment 3.387,01; refund 1.173,23', () => {
    const monthly = monthlyIr(brl('6.000,00'), brl('660,00'), 0, '2026-05').ir;
    expect(monthly).toBe(brl('380,02'));
    const ir = annualIr(2026, brl('72.000,00'), brl('7.920,00'), 0 as Cents, true);
    expect(ir.simplified.ir).toBe(brl('3.387,01'));
    expect(ir.full.ir).toBe(brl('5.169,01'));
    expect(12 * monthly - ir.ir).toBe(brl('1.173,23'));
  });

  it('R04 in the chain (4th lever): the PGBL gain enters the total and INV-1 holds', () => {
    const f = syntheticFacts({
      domestic: constant(brl('50.000,00')),
      subjectToFatorR: false,
      otherTaxableIncome: constant(brl('10.000,00')),
      otherInss: constant(brl('988,09')),
    });
    const r = analyze(f);
    if (!r.ok) throw new Error(r.error.code);
    const finding = r.value.findings.find((x) => x.ruleId === 'R04');
    const ctx = createCtx(f, resolveAssumptions(f));
    const pf = annualPf(
      ctx,
      {
        proLabore: brl('1.621,00'),
        segregateExport: false,
        segregateMonofasico: false,
        pgblContribution: {},
      },
      2026,
    );
    const plan = r04('0,00', '0,00', { rt: pf.rt, fullDeductions: pf.fullDeductions });
    expect(plan?.gain).toBeGreaterThan(0);
    expect(finding?.marginalValue12m).toBe(plan?.gain);
    expect(finding?.deadline).toBe('2026-12-30');
    // C.1 item 4: the steady-state IR (2028) uses the 2026 table, flagged before the last step.
    const projected = finding?.trace.find((s) => s.id === 'R04.PROJECTED_PARAMETERS');
    expect(projected?.inputs['irpf.annual.table']?.value).toBe(
      '2027-12 a 2028-12: usado o de 2026',
    );
    expect(finding?.trace.at(-1)?.id).toBe('R04.MARGINAL_12M');
    expect(finding?.title).toContain(`Aporte R$`);
    expect(r.value.total.savings12m).toBe(finding?.marginalValue12m);
    expect(r.value.total.annualRegimeSavings).toBe(finding?.annualRegimeValue);
  });

  it('C.6/INV-2: R04 is thresholded on the steady-state gain only, not on the 12-month gain', () => {
    // Analysis on 15/12/2026: the horizon starts in 2027-01 and holds no IR of 2026, so the 2026 PGBL has no
    // 12-month effect, while the steady-state block repeats the yearly contribution (R04, D.4).
    const f = syntheticFacts({
      domestic: constant(brl('50.000,00')),
      subjectToFatorR: false,
      otherTaxableIncome: constant(brl('10.000,00')),
      otherInss: constant(brl('988,09')),
      analysisDate: '2026-12-15',
    });
    const r = analyze(f);
    if (!r.ok) throw new Error(r.error.code);
    const finding = r.value.findings.find((x) => x.ruleId === 'R04');
    expect(finding?.countsInTotal).toBe(true);
    expect(finding?.marginalValue12m).toBe(0);
    expect(finding?.annualRegimeValue).toBeGreaterThanOrEqual(100);
    expect(r.value.total.annualRegimeSavings).toBe(finding?.annualRegimeValue);
    expect(r.value.total.savings12m).toBe(0);
    // The title shows D.4 gain(a*), computed on the analysis year, not the chain's 12-month value.
    const ctx = createCtx(f, resolveAssumptions(f));
    const pf = annualPf(
      ctx,
      {
        proLabore: brl('1.621,00'),
        segregateExport: false,
        segregateMonofasico: false,
        pgblContribution: {},
      },
      2026,
    );
    const plan = r04('0,00', '0,00', { rt: pf.rt, fullDeductions: pf.fullDeductions });
    expect(plan?.gain).toBeGreaterThan(0);
    expect(finding?.title).toContain(`ganho real de R$ ${formatBrl(plan?.gain ?? 0)}`);
  });
});
