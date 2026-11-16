// ENGINE-SPEC D.3 tests T03-01…T03-14 (values in R$ written as in the spec; compared in cents). Services MEI = Anexo III,
// 1st bracket 6%; commerce = Anexo I, 4%; services DAS-MEI 86,05 (D.3 tests header).
import { describe, expect, it } from 'vitest';
import { analyze } from '../../src/analyze.ts';
import { brl } from '../../src/money.ts';
import { type AnnualRevenue, meiLimit, simplesLimit } from '../../src/rules/r03.ts';
import { addMonths, monthRange } from '../../src/time.ts';
import type { Cents, EngineResult, Facts, Finding, YearMonth } from '../../src/types.ts';
import { constant, syntheticFacts } from './fixtures/facts.ts';

const mei = (rba: string, o: Partial<Parameters<typeof meiLimit>[0]> = {}) =>
  meiLimit({
    year: 2026,
    rbaProj: brl(rba),
    openedIn: '2019-03',
    anexo: 'III',
    dasMeiPaid: 0 as Cents,
    ...o,
  });

/** An annual projection with the RBA spread evenly over the 12 months (the remainder in December). */
function rev(domestic: string, exportRba = '0,00', year = 2026): AnnualRevenue {
  const d = brl(domestic);
  const x = brl(exportRba);
  const months = monthRange(`${year}-01` as YearMonth, `${year}-12` as YearMonth);
  const per = (t: number) => Math.floor(t / 12);
  const cumulative = months.map((month, i) => ({
    month,
    domestic: (i === 11 ? d : per(d) * (i + 1)) as Cents,
    export: (i === 11 ? x : per(x) * (i + 1)) as Cents,
  }));
  return {
    year,
    closed: { domestic: 0 as Cents, export: 0 as Cents },
    average3: { domestic: 0 as Cents, export: 0 as Cents },
    remainingMonths: 0,
    byMarket: { domestic: d, export: x },
    total: (d + x) as Cents,
    cumulative,
  };
}

function run(f: Facts): EngineResult {
  const r = analyze(f);
  if (!r.ok) throw new Error(r.error.code);
  return r.value;
}
const r03 = (r: EngineResult) => r.findings.find((f) => f.ruleId === 'R03') as Finding | undefined;

describe('ENGINE-SPEC D.3 — R03, MEI', () => {
  it('T03-01: 64.799,99 < 0,8 × 81.000 = 64.800 → no alert', () => {
    expect(mei('64.799,99').band).toBeNull();
  });

  it('T03-02: 64.800,00 = 80% → warning', () => {
    expect(mei('64.800,00').band).toBe('warning');
  });

  it('T03-03: 81.000,00 ≤ limit → warning (not exceeded)', () => {
    const r = mei('81.000,00');
    expect(r.band).toBe('warning');
    expect(r.cost).toBe(0);
  });

  it('T03-04: 81.000,01 → overrun_up_to_20; DAS on the excess 0,00; removed from MEI on 01/01/2027', () => {
    const r = mei('81.000,01');
    expect(r.band).toBe('overrun_up_to_20');
    expect(r.cost).toBe(0);
    expect(r.effectiveFrom).toBe('2027-01-01');
  });

  it('T03-05: 97.200,00 → overrun_up_to_20; 972,00 (service) / 648,00 (commerce)', () => {
    expect(mei('97.200,00').band).toBe('overrun_up_to_20');
    expect(mei('97.200,00').cost).toBe(brl('972,00'));
    expect(mei('97.200,00', { anexo: 'I' }).cost).toBe(brl('648,00'));
  });

  it('T03-06: 97.200,01 → overrun_above_20; retroactive to 01/01/2026; 5.832,00 − 12 × 86,05 = 4.799,40', () => {
    const r = mei('97.200,01', { dasMeiPaid: (12 * brl('86,05')) as Cents });
    expect(r.band).toBe('overrun_above_20');
    expect(r.effectiveFrom).toBe('2026-01-01');
    expect(r.cost).toBe(brl('4.799,40'));
  });

  it('T03-07: opened in apr/2026 → limits 60.750,00 / 72.900,00', () => {
    const r = mei('50.000,00', { openedIn: '2026-04' });
    expect(r.limit).toBe(brl('60.750,00'));
    expect(r.toleranceLimit).toBe(brl('72.900,00'));
  });

  it('T03-08: 2027, projection 95.000 → warning within the LC 238 limit, depends on the LOA', () => {
    const r = mei('95.000,00', { year: 2027 });
    expect(r.band).toBe('warning');
    expect(r.limit).toBe(brl('110.000,00'));
    expect(r.dependsOnRegulation).toBe(true);
    // The 2026 limit stays the alert floor: 0,8 × 81.000.
    expect(r.alertFloor).toBe(brl('64.800,00'));
    expect(mei('70.000,00', { year: 2027 }).band).toBe('warning');
  });

  it('an anexo without a table (II/IV) keeps the alert and leaves the cost out', () => {
    const r = mei('97.200,00', { anexo: 'IV' });
    expect(r.band).toBe('overrun_up_to_20');
    expect(r.cost).toBeNull();
  });

  it('analyze() of an MEI: RBA_proj = Σ jan..oct + average(aug–oct) × 2 → 97.200 → overrun_up_to_20', () => {
    const months = monthRange('2025-11', '2026-10');
    const f = syntheticFacts({ regime: 'MEI', domestic: constant(brl('8.100,00'), months) });
    const finding = r03(run(f));
    expect(finding?.type).toBe('alert');
    expect(finding?.countsInTotal).toBe(false);
    expect(finding?.trace.find((s) => s.id === 'R03.RBA_PROJ')?.result.value).toBe(
      brl('97.200,00'),
    );
    expect(finding?.marginalValue12m).toBe(brl('972,00'));
    expect(finding?.deadline).toBe('2027-01-01');
    expect(finding?.title).toBe(
      'O faturamento projetado passa o limite do MEI em até 20%: a partir de 01/01/2027 você vira ME, e paga R$ 972,00 sobre o excesso junto com o DAS de janeiro.',
    );
  });

  it('D26: the 3-month average counts only the months since the opening (MEI opened 1 or 2 months before the reference month)', () => {
    const months = monthRange('2025-11', '2026-10');
    const rba = (openedOn: `${number}-${string}-${string}`) => {
      const f = syntheticFacts({
        regime: 'MEI',
        domestic: constant(brl('6.000,00'), months),
        openedOn,
      });
      return r03(run(f))?.trace.find((s) => s.id === 'R03.RBA_PROJ');
    };
    // Opened 2026-09: 2 months (6.000 + 6.000) / 2 = 6.000; RBA = 12.000 + 2 × 6.000 = 24.000; limit 6.750 × 4.
    const one = rba('2026-09-15');
    expect(one?.inputs.average3?.value).toBe(brl('6.000,00'));
    expect(one?.result.value).toBe(brl('24.000,00'));
    // Opened 2026-08: 3 months; RBA = 18.000 + 2 × 6.000 = 30.000 (limit 6.750 × 5 = 33.750 → warning).
    const two = rba('2026-08-03');
    expect(two?.inputs.average3?.value).toBe(brl('6.000,00'));
    expect(two?.result.value).toBe(brl('30.000,00'));
  });

  it('analyze() of an MEI analysed in 2027 cites the LC 238 limit and depends on the regulation', () => {
    const months = monthRange('2026-01', '2026-12');
    const f = syntheticFacts({
      regime: 'MEI',
      domestic: constant(brl('7.900,00'), months),
      analysisDate: '2027-01-15',
      referenceMonth: '2026-12',
    });
    const finding = r03(run(f));
    expect(finding?.confidence).toBe('depends_on_regulation');
    expect(finding?.title).toContain(
      'dentro do limite da LC 238 (R$ 110 mil) se a LOA 2027 prever a renúncia',
    );
  });
});

describe('ENGINE-SPEC D.3 — R03, Simples (limits per market)', () => {
  it('T03-09: RBA 3.600.000,00 (domestic) = sublimit → warning, no effect', () => {
    expect(simplesLimit(rev('3.600.000,00'))).toMatchObject({
      effect: 'warning',
      effectiveFrom: null,
    });
  });

  it('T03-10: 3.600.000,01 → excess ≤ 20%: ICMS/ISS outside the DAS in the following year', () => {
    expect(simplesLimit(rev('3.600.000,01'))).toMatchObject({
      effect: 'icms_iss_next_year',
      effectiveFrom: '2027-01-01',
    });
  });

  it('T03-11: 4.320.000,01 → > 20% of the sublimit: ICMS/ISS outside the DAS from the following month', () => {
    const r = simplesLimit(rev('4.320.000,01'));
    expect(r?.effect).toBe('icms_iss_next_month');
    // The projection crosses 4.320.000 only in December: from January.
    expect(r?.effectiveFrom).toBe('2027-01-01');
  });

  it('T03-12: 4.800.000,01 → excess ≤ 20%: exclusion from Simples on 1º/01 of the following year', () => {
    expect(simplesLimit(rev('4.800.000,01'))).toMatchObject({
      effect: 'exclusion_next_year',
      effectiveFrom: '2027-01-01',
    });
  });

  it('T03-13: 5.760.000,01 → > 20%: exclusion from the following month', () => {
    const r = simplesLimit(rev('5.760.000,01'));
    expect(r?.effect).toBe('exclusion_next_month');
    const fast = simplesLimit(rev('7.200.000,00'));
    // 600.000/month: cumulative 6.000.000 > 5.760.000 in October → excluded from November.
    expect(fast?.effectiveFrom).toBe('2026-11-01');
  });

  it('T03-14: domestic 4.000.000 + export 1.000.000 → no exclusion; domestic sublimit exceeded ≤ 20%', () => {
    expect(simplesLimit(rev('4.000.000,00', '1.000.000,00'))).toMatchObject({
      market: 'domestic',
      effect: 'icms_iss_next_year',
    });
  });

  it('below 80% of the sublimit (2.880.000) → no alert', () => {
    expect(simplesLimit(rev('2.879.999,99'))).toBeNull();
    expect(simplesLimit(rev('2.880.000,00'))?.effect).toBe('warning');
  });

  it('analyze() of a Simples company with 250.000/month: RBA 3.000.000 → warning; the hero does not fire', () => {
    const f = syntheticFacts({ domestic: constant(brl('250.000,00')), subjectToFatorR: false });
    const finding = r03(run(f));
    expect(finding?.title).toBe(
      'Faltam R$ 600.000,00 para o sublimite de R$ 3,6 milhões (mercado interno). Se a venda puder acontecer em janeiro, ela conta para o ano que vem.',
    );
    expect(finding?.marginalValue12m).toBe(0);
    expect(finding?.refs[0]?.id).toBe('lc123-2006/art3/caput');
  });

  it('a projection with the remaining months after a closed December uses the next year', () => {
    const months = monthRange(addMonths('2026-12', -11), '2026-12');
    const f = syntheticFacts({
      domestic: constant(brl('250.000,00'), months),
      subjectToFatorR: false,
      analysisDate: '2027-01-10',
      referenceMonth: '2026-12',
    });
    const s = r03(run(f))?.trace.find((x) => x.id === 'R03.RBA_PROJ');
    expect(s?.inputs.remainingMonths?.value).toBe(12);
    expect(s?.result.value).toBe(brl('3.000.000,00'));
  });
});
