// ENGINE-SPEC D.2 tests T02-01…T02-13 and the RFB Q&A behaviour oracles (B.4).
// T02-11 (a "JCP" credit is not a dividend) and T02-13 (gross = net credit + DARF 1841) are classification and
// fact-building (ENGINE-SPEC E.2/E.3): they belong to @refund/pipeline (E9). The engine receives gross amounts.
import { describe, expect, it } from 'vitest';
import { analyze } from '../../src/analyze.ts';
import { brl } from '../../src/money.ts';
import { r02Events, r02Finding } from '../../src/rules/r02.ts';
import type { Cents, Distribution, Rate, YearMonth } from '../../src/types.ts';
import { syntheticFacts } from './fixtures/facts.ts';

const A = 'RFTESTA0000100';
const B = 'RFTESTB0000100';
const d = (
  month: YearMonth,
  amount: string,
  payerCnpj = A,
  profitThrough2025Approved = false,
): Distribution => ({
  month,
  payerCnpj,
  grossAmount: brl(amount),
  irrfWithheld: 0 as Cents,
  profitThrough2025Approved,
});
const input = (distributions: Distribution[], income = brl('300.000,00')) => ({
  distributions,
  projectedAnnualTotalIncome: income,
  selicAnnual: '0.15' as Rate,
  dividendRefundMonth: '2027-06' as YearMonth,
});

describe('ENGINE-SPEC D.2 — R02', () => {
  it('T02-01: 50.000,00 from one PJ in a month is not "superior a" 50.000 → no finding', () => {
    expect(r02Finding(input([d('2026-03', '50.000,00')]))).toBeNull();
  });

  it('T02-02: 50.000,01 → withholding 5.000,00 (on the total), finding', () => {
    const [e] = r02Events(input([d('2026-03', '50.000,01')]));
    expect(e?.withheld).toBe(brl('5.000,00'));
    expect(r02Finding(input([d('2026-03', '50.000,01')]))?.countsInTotal).toBe(false);
  });

  it('T02-03: 30.000 + 30.000 from the same PJ in the same month → recomputed on the total: 6.000,00', () => {
    const [e] = r02Events(input([d('2026-03', '30.000,00'), d('2026-03', '30.000,00')]));
    expect(e?.withheld).toBe(brl('6.000,00'));
  });

  it('T02-04: 40.000 from PJ A + 40.000 from PJ B → limit per source: 0', () => {
    expect(r02Events(input([d('2026-03', '40.000,00', A), d('2026-03', '40.000,00', B)]))).toEqual(
      [],
    );
  });

  it('T02-05 (REVISÃO C2): 60.000/month in 2026, income < 600 mil, Selic 15% → savings 0, cost 9.431,79', () => {
    const months = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`);
    const f = r02Finding(input(months.map((m) => d(m as YearMonth, '60.000,00'))));
    expect(f?.marginalValue12m).toBe(brl('9.431,79'));
    expect(f?.countsInTotal).toBe(false);
    expect(f?.type).toBe('alert');
    const events = r02Events(input(months.map((m) => d(m as YearMonth, '60.000,00'))));
    expect(events.map((e) => e.months)).toEqual([16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5]);
    expect(events.reduce((a, e) => a + e.withheld, 0)).toBe(brl('72.000,00'));
  });

  it('T02-06: hero, 90.000 in jul/2026, DARF in aug → withheld 9.000,00; cost 1.111,70; 2 × 45.000', () => {
    const [e] = r02Events(input([d('2026-07', '90.000,00')]));
    expect(e).toMatchObject({
      withheld: brl('9.000,00'),
      darfMonth: '2026-08',
      months: 10,
      financialCost: brl('1.111,70'),
      suggestedMonths: 2,
    });
  });

  it('T02-07: 2024 profit approved on 15/12/2025 (§ 3º transition) → 0, no finding', () => {
    expect(r02Finding(input([d('2026-03', '80.000,00', A, true)]))).toBeNull();
  });

  it('T02-08: projected income 700.000 → IRPFM text, financial cost null, depends_on_regulation', () => {
    const f = r02Finding(input([d('2026-03', '80.000,00')], brl('700.000,00')));
    expect(
      r02Events(input([d('2026-03', '80.000,00')], brl('700.000,00')))[0]?.financialCost,
    ).toBeNull();
    expect(f?.confidence).toBe('depends_on_regulation');
    expect(f?.marginalValue12m).toBe(0);
    expect(f?.title).toContain('IRPFM');
  });

  it('T02-09: 12 × 50.000,00 → no month above, no finding', () => {
    const months = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`);
    expect(r02Finding(input(months.map((m) => d(m as YearMonth, '50.000,00'))))).toBeNull();
  });

  it('T02-10: 50.000,00 + 0,01 in two payments in the same month → 5.000,00', () => {
    const [e] = r02Events(input([d('2026-03', '50.000,00'), d('2026-03', '0,01')]));
    expect(e?.withheld).toBe(brl('5.000,00'));
  });

  it('T02-12: 120.000 in one month → withheld 12.000,00; suggestion ceil(120.000/50.000) = 3', () => {
    const [e] = r02Events(input([d('2026-03', '120.000,00')]));
    expect(e?.withheld).toBe(brl('12.000,00'));
    expect(e?.suggestedMonths).toBe(3);
    expect(r02Finding(input([d('2026-03', '120.000,00')]))?.title).toContain('3 × R$ 40.000,00');
  });

  it('distributions before Lei 15.270 (2025) have no withholding', () => {
    expect(r02Events(input([d('2025-11', '90.000,00')]))).toEqual([]);
  });

  it('without the Selic assumption the cost is not computed (and said so)', () => {
    const f = r02Finding({ ...input([d('2026-07', '90.000,00')]), selicAnnual: undefined });
    expect(f?.marginalValue12m).toBe(0);
    expect(f?.assumptionsUsed).toContain('Selic não informada: custo financeiro não calculado.');
  });

  it('R02 also runs outside the Simples, through analyze()', () => {
    const r = analyze(
      syntheticFacts({
        regime: 'PRESUMIDO',
        distributions: [d('2026-07', '90.000,00')],
        assumptions: {
          selicAnnual: { value: '0.15', origin: 'default', editable: true, source: 'x' },
        },
      }),
    );
    expect(r.ok && r.value.findings.map((f) => f.ruleId)).toEqual(['R02']);
    expect(r.ok && r.value.findings[0]?.marginalValue12m).toBe(brl('1.111,70'));
  });
});
