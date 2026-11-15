// TESTS §3.3 (lives here): the answer key's facts == the facts the pipeline derives, without LLM. TESTS §3.4:
// provenance points to existing transactions whose sum is the fact's value.
import type { Facts, Provenance, Series } from '@refund/engine';
import { describe, expect, it } from 'vitest';
import { accrualMonth, estimateGrossProLabore, regimeOf } from '../src/facts.ts';
import { answerKey, heroAnswered, idMap, persona, run, sumSeries } from './helpers.ts';

const key = answerKey();
const expected = key.expectedFacts;
const ids = idMap();

async function heroFacts(): Promise<{
  facts: Facts;
  events: Awaited<ReturnType<typeof heroAnswered>>['events'];
}> {
  const { result, events } = await heroAnswered();
  if (result.facts === null) throw new Error('no facts');
  return { facts: result.facts, events };
}

const sorted = (list: string[]) => [...list].sort();
const mapped = (sourceIds: string[] | undefined) =>
  sorted((sourceIds ?? []).map((s) => ids.get(s) ?? s));

describe('facts == answer key (ENGINE-SPEC F.2)', () => {
  it('company, details, revenue, payroll, partner, DAS and PF', async () => {
    const { facts } = await heroFacts();
    expect(facts.referenceMonth).toBe(expected.referenceMonth);
    expect(facts.analysisDate).toBe(expected.analysisDate);
    expect(facts.company.value).toMatchObject(expected.company);
    expect(facts.companyDetails.value).toEqual(expected.companyDetails);
    expect(facts.revenueByMarket.domestic.value).toEqual(expected.revenueByMarket.domestic);
    expect(facts.revenueByMarket.export.value).toEqual(expected.revenueByMarket.export);
    expect(facts.cltPayroll.grossPay.value).toEqual(expected.cltPayroll.grossPay);
    expect(facts.cltPayroll.fgtsPaid.value).toEqual(expected.cltPayroll.fgtsPaid);
    expect(facts.cltPayroll.cppOutsideDas.value).toEqual(expected.cltPayroll.cppOutsideDas);
    expect(facts.partner.worksInCompany.value).toBe(expected.partner.worksInCompany);
    expect(facts.partner.grossProLabore.value).toEqual(expected.partner.grossProLabore);
    expect(facts.partner.distributions.value).toEqual(expected.partner.distributions);
    expect(facts.dasPaid.value).toEqual(expected.dasPaid);
    expect(facts.qualifications.exportResultAbroad?.value).toBe(
      expected.qualifications.exportResultAbroad,
    );
    expect(facts.qualifications.contributesToRgps.value).toBe(
      expected.qualifications.contributesToRgps,
    );
    expect(facts.pfDetails.value).toEqual(expected.pfDetails);
  });

  it('pgdasSegregatesExport is left to the engine’s C.3.7 inference, which finds "no" in 12/12 PAs', async () => {
    const { result } = await heroAnswered();
    expect(result.facts?.qualifications.pgdasSegregatesExport).toBeUndefined();
    const r05 = result.engineResult?.findings.find((f) => f.ruleId === 'R05');
    // R05 is only eligible when segregation is not 'yes', and only 'confirmed' when the inference says 'no'.
    expect(r05?.confidence).toBe('confirmed');
    const inference = r05?.trace.filter((s) => s.id.startsWith('PGDAS.INFERENCE.')) ?? [];
    expect(inference).toHaveLength(expected.pgdasInference.matchedPas);
  });

  it('RBT12, FS12 and Fator R in facts_summary (F.3 step 0)', async () => {
    const { events } = await heroFacts();
    expect(events.find((e) => e.type === 'facts_summary')).toEqual({
      type: 'facts_summary',
      rbt12Cents: expected.rbt12,
      payroll12Cents: expected.fs12,
      fatorR: expected.fatorR,
      monthsWithData: 12,
    });
  });

  it('Σ 12 months (F.2 row Σ)', async () => {
    const { facts } = await heroFacts();
    const t = expected.totals12m;
    expect(sumSeries(facts.revenueByMarket.export.value)).toBe(t.exportRevenue);
    expect(sumSeries(facts.cltPayroll.grossPay.value)).toBe(t.grossCltPay);
    expect(sumSeries(facts.cltPayroll.fgtsPaid.value)).toBe(t.fgtsPaid);
    expect(sumSeries(facts.partner.grossProLabore.value)).toBe(t.grossProLabore);
    expect(facts.dasPaid.value.reduce((a, d) => a + d.amount, 0)).toBe(t.dasPaid);
    expect(facts.partner.distributions.value.reduce((a, d) => a + d.grossAmount, 0)).toBe(
      t.grossDistributions,
    );
    expect(facts.partner.distributions.value.reduce((a, d) => a + d.irrfWithheld, 0)).toBe(
      t.darf1841,
    );
    expect(facts.pfDetails.value.projectedAnnualTotalIncome).toBe(t.pfTotalIncome);
  });

  it('provenance matches the answer key', async () => {
    const { facts } = await heroFacts();
    const p = expected.provenance;
    const check = (actual: Provenance, path: string) => {
      const want = p[path];
      if (want === undefined) throw new Error(path);
      expect(actual.origin, path).toBe(want.origin);
      expect(sorted(actual.transactionIds ?? []), path).toEqual(mapped(want.transactionIds));
    };
    check(facts.partner.grossProLabore.provenance, 'partner.grossProLabore');
    check(facts.cltPayroll.grossPay.provenance, 'cltPayroll.grossPay');
    check(facts.qualifications.contributesToRgps.provenance, 'qualifications.contributesToRgps');
    const exportProvenance = facts.qualifications.exportResultAbroad?.provenance;
    if (exportProvenance === undefined) throw new Error('exportResultAbroad');
    check(exportProvenance, 'qualifications.exportResultAbroad');
    expect(facts.partner.worksInCompany.provenance.origin).toBe(
      p['partner.worksInCompany']?.origin,
    );
    // pfDetails is one Fact: its provenance covers the answer key's projectedAnnualTotalIncome sources.
    const pf = new Set(facts.pfDetails.provenance.transactionIds);
    for (const id of mapped(p['pfDetails.projectedAnnualTotalIncome']?.transactionIds))
      expect(pf.has(id)).toBe(true);
  });
});

describe('provenance closes (TESTS §3.4)', () => {
  it('every open_finance fact points to existing transactions whose sum is the fact', async () => {
    const { facts } = await heroFacts();
    const data = persona();
    const amount = new Map<string, number>();
    for (const item of data.items)
      for (const a of item.accounts)
        for (const t of a.transactions)
          amount.set(ids.get(t.sourceId) ?? '', Math.abs(t.amountCents));
    const sumIds = (prov: Provenance) => {
      for (const id of prov.transactionIds ?? []) expect(amount.has(id)).toBe(true);
      return (prov.transactionIds ?? []).reduce((a, id) => a + (amount.get(id) ?? 0), 0);
    };
    const series: [string, { value: Series; provenance: Provenance }][] = [
      ['monthlyRevenue', facts.monthlyRevenue],
      ['monthlyExportRevenue', facts.monthlyExportRevenue],
      ['revenueByMarket.export', facts.revenueByMarket.export],
      ['revenueByMarket.domestic', facts.revenueByMarket.domestic],
      ['cltPayroll.fgtsPaid', facts.cltPayroll.fgtsPaid],
      ['monthlyDistributions', facts.monthlyDistributions],
    ];
    for (const [name, f] of series) {
      expect(f.provenance.origin, name).toBe('open_finance');
      expect(sumIds(f.provenance), name).toBe(sumSeries(f.value));
    }
    expect(sumIds(facts.dasPaid.provenance)).toBe(
      facts.dasPaid.value.reduce((a, d) => a + d.amount, 0),
    );
    expect(sumIds(facts.partner.distributions.provenance)).toBe(
      facts.partner.distributions.value.reduce((a, d) => a + d.grossAmount, 0),
    );
  });

  it('the summary aggregates stay consistent with the [CONTRACT] fields (ARCHITECTURE §4.2)', async () => {
    const { facts } = await heroFacts();
    for (const m of Object.keys(facts.monthlyRevenue.value) as (keyof Series)[]) {
      expect(facts.monthlyRevenue.value[m]).toBe(
        (facts.revenueByMarket.domestic.value[m] ?? 0) +
          (facts.revenueByMarket.export.value[m] ?? 0),
      );
      expect(facts.monthlyExportRevenue.value[m]).toBe(facts.revenueByMarket.export.value[m]);
      expect(facts.monthlyPayroll.value[m]).toBe(
        (facts.cltPayroll.grossPay.value[m] ?? 0) + (facts.cltPayroll.fgtsPaid.value[m] ?? 0),
      );
      expect(facts.monthlyProLabore.value[m]).toBe(facts.partner.grossProLabore.value[m]);
      const dist = facts.partner.distributions.value.filter((d) => d.month === m);
      expect(facts.monthlyDistributions.value[m]).toBe(dist.reduce((a, d) => a + d.grossAmount, 0));
    }
    const pf = facts.pf.value;
    expect(pf.annualTaxableIncome).toBe(sumSeries(facts.pfDetails.value.monthlyTaxableIncome));
    expect(pf.annualInssWithheld).toBe(sumSeries(facts.pfDetails.value.officialPensionDeductions));
    expect(pf.medicalExpenses).toBe(
      facts.pfDetails.value.healthExpenses.reduce((a, h) => a + h.amount, 0),
    );
    expect(pf.pgblContributed).toBe(facts.pfDetails.value.pgblContributedThisYear);
  });
});

describe('without answers (first run)', () => {
  it('pró-labore and payroll become visible assumptions; no qualification is invented', async () => {
    const { result } = await run();
    const f = result.facts;
    if (f === null) throw new Error('no facts');
    expect(f.partner.grossProLabore.provenance).toMatchObject({ origin: 'default_assumption' });
    expect(f.partner.grossProLabore.value).toEqual(expected.partner.grossProLabore); // net ÷ 0,89 = 1.621,00
    expect(f.cltPayroll.grossPay.provenance.origin).toBe('default_assumption');
    expect(sumSeries(f.cltPayroll.grossPay.value)).toBeLessThan(expected.totals12m.grossCltPay);
    expect(f.qualifications.exportResultAbroad).toBeUndefined();
    expect(f.partner.worksInCompany).toMatchObject({
      value: false,
      provenance: { origin: 'default_assumption' },
    });
    expect(f.companyDetails.value.hasFullBookkeeping).toBe(false);
    expect(f.pfDetails.value.healthExpenses).toEqual([
      { amount: 780000, cnaeOrProfession: '6550-2/00', beneficiary: 'holder' },
    ]);
  });
});

describe('helpers', () => {
  it('E.2 gross estimate: net ÷ 0,89 when the IR is zero, else null', () => {
    expect(estimateGrossProLabore(144269, '2025-11')).toBe(162100);
    expect(estimateGrossProLabore(1_800_000, '2026-10')).toBeNull();
  });

  it('accrual month from "PA mm/yyyy", else the month before the payment', () => {
    expect(accrualMonth('PAGAMENTO DARF 1841 PA 07/2026', '2026-08')).toBe('2026-07');
    expect(accrualMonth('PAGAMENTO DAS', '2026-01')).toBe('2025-12');
  });

  it('regime from the public registry', () => {
    const base = persona().company;
    expect(regimeOf(base)).toBe('SIMPLES');
    expect(regimeOf({ ...base, mei: { optedIn: true, since: null, excludedAt: null } })).toBe(
      'MEI',
    );
    const out = { ...base, simples: { optedIn: false, since: null, excludedAt: null } };
    expect(regimeOf(out)).toBe('OTHER');
    expect(regimeOf({ ...out, taxRegimeHistory: [{ year: 2025, form: 'LUCRO PRESUMIDO' }] })).toBe(
      'PRESUMIDO',
    );
    expect(
      regimeOf({
        ...out,
        taxRegimeHistory: [
          { year: 2024, form: 'LUCRO PRESUMIDO' },
          { year: 2025, form: 'LUCRO REAL' },
        ],
      }),
    ).toBe('REAL');
  });
});
