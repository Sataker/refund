// Facts with provenance (ARCHITECTURE §4.2 [CONTRACT] fields; ENGINE-SPEC C.2, E.2, F.2). Every fact derived from
// the statement lists the NormalizedTransaction ids whose sum it is (TESTS §3.4, provenance).
import {
  addMonths,
  type Cents,
  type CivilDate,
  compareYearMonth,
  type DasPayment,
  type Distribution,
  type Facts,
  inssPartner,
  monthlyIr,
  monthRange,
  type Provenance,
  type Result,
  type Series,
  type YearMonth,
} from '@refund/engine';
import type { PublicCompany } from '@refund/sources';
import { cnaeTaxProfile, resellsMonofasico } from './classify/cnae.ts';
import { type AnswerValue, type Classified, feedsFacts, isNo, isYes } from './classify/index.ts';
import { accrualMonth } from './classify/regex.ts';
import { CARD } from './classify/rules.ts';
import type { Category } from './types.ts';

/** The engine's parameters start in 2026-01 (ENGINE-SPEC A); earlier months use them, as the engine fixtures do. */
const FIRST_PARAMETER_MONTH: YearMonth = '2026-01';
export const parameterMonth = (m: YearMonth): YearMonth =>
  compareYearMonth(m, FIRST_PARAMETER_MONTH) < 0 ? FIRST_PARAMETER_MONTH : m;

/**
 * E.2: estimated gross pró-labore = net ÷ 0,89 when the estimated IR is zero (11% INSS is the only withholding);
 * otherwise null and the card asks for the gross. Integer half-up: round(net × 100 / 89).
 */
export function estimateGrossProLabore(net: number, month: YearMonth): Cents | null {
  const gross = Math.floor((200 * net + 89) / 178) as Cents;
  const m = parameterMonth(month);
  const ir = monthlyIr(gross, inssPartner(gross, m), 0, m).ir;
  return ir === 0 ? gross : null;
}

export const regimeOf = (company: PublicCompany): Facts['company']['value']['regime'] => {
  if (company.mei.optedIn) return 'MEI';
  if (company.simples.optedIn) return 'SIMPLES';
  const latest =
    [...company.taxRegimeHistory].sort((a, b) => b.year - a.year)[0]?.form.toUpperCase() ?? '';
  if (latest.includes('PRESUMIDO')) return 'PRESUMIDO';
  if (latest.includes('REAL')) return 'REAL';
  return 'OTHER';
};

/**
 * The gross payroll card takes the gross paid in each month (cash basis, 13º and vacation included; E9 review H2).
 * A single number is not an answer: it cannot carry the 13º and the vacation.
 */
export function payrollSeriesAnswer(value: AnswerValue | undefined): Record<string, number> | null {
  if (typeof value !== 'object' || value === null) return null;
  const out: Record<string, number> = {};
  for (const [m, v] of Object.entries(value)) {
    if (
      /^\d{4}-(0[1-9]|1[0-2])$/.test(m) &&
      typeof v === 'number' &&
      Number.isSafeInteger(v) &&
      v >= 0
    )
      out[m] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** FGTS ÷ 0,08 = FGTS × 12,5, in integer cents rounded half-up (no float). */
export const fgtsToGross = (fgts: number): number => Math.floor((fgts * 25 + 1) / 2);

export interface FactsInput {
  classified: readonly Classified[];
  answers: ReadonlyMap<string, AnswerValue>;
  company: PublicCompany;
  referenceMonth: YearMonth;
  analysisDate: CivilDate;
  userAssumptions: Facts['assumptions'];
}

export interface FactsError {
  code: 'CNAE_OUT_OF_SCOPE';
  message: string;
  recoverable: false;
}

const series = (months: readonly YearMonth[]): Series =>
  Object.fromEntries(months.map((m) => [m, 0 as Cents])) as Series;

const add = (s: Series, m: YearMonth, amount: number): void => {
  if (m in s) s[m] = ((s[m] ?? 0) + amount) as Cents;
};

const total = (s: Series): number => Object.values(s).reduce((a, b) => a + b, 0);

export { accrualMonth };

const of = (ids: string[], source?: string): Provenance => ({
  origin: 'open_finance',
  transactionIds: ids,
  ...(source === undefined ? {} : { source }),
});

const uniq = (ids: string[]): string[] => [...new Set(ids)];

export function buildFacts(input: FactsInput): Result<Facts, FactsError> {
  const { company, answers, referenceMonth } = input;
  const profile = cnaeTaxProfile(company.primaryCnae.code);
  if (profile === undefined) {
    return {
      ok: false,
      error: {
        code: 'CNAE_OUT_OF_SCOPE',
        message: `Ainda não calculamos para a atividade ${company.primaryCnae.code}.`,
        recoverable: false,
      },
    };
  }
  const observed = monthRange(addMonths(referenceMonth, -11), referenceMonth);
  const window = new Set<string>(observed);
  const used = input.classified.filter((c) => feedsFacts(c));
  const inWindow = used.filter((c) => window.has(c.tx.month));
  const byCategory = (category: Category) =>
    inWindow.filter((c) => c.classification.category === category);
  const ids = (list: readonly Classified[]) => list.map((c) => c.tx.id);
  const byLabel = (label: string) => inWindow.filter((c) => c.label === label);

  // ---------- Revenue (accrual = month of the credit) ----------
  const exportCredits = byCategory('export_revenue');
  const domesticCredits = [...byCategory('service_revenue'), ...byCategory('sales_revenue')];
  const exportSeries = series(observed);
  const domesticSeries = series(observed);
  for (const c of exportCredits) add(exportSeries, c.tx.month, c.tx.amountCents);
  for (const c of domesticCredits) add(domesticSeries, c.tx.month, c.tx.amountCents);
  const revenueSeries = series(observed);
  for (const m of observed)
    revenueSeries[m] = ((exportSeries[m] ?? 0) + (domesticSeries[m] ?? 0)) as Cents;

  // ---------- CLT payroll (cash): gross from the card (E.2), FGTS from the statement ----------
  const salaries = byCategory('salary');
  const payrollAnswer = payrollSeriesAnswer(answers.get(CARD.payrollGross));
  const grossPay = series(observed);
  let grossPayProvenance: Provenance = { origin: 'default_assumption' };
  if (payrollAnswer !== null) {
    for (const m of observed) {
      const v = payrollAnswer[m];
      if (v !== undefined) grossPay[m] = v as Cents;
    }
    grossPayProvenance = {
      origin: 'user',
      source: `question:${CARD.payrollGross}`,
      transactionIds: ids(salaries),
    };
  }
  const fgtsPayments = byCategory('fgts_charge');
  const fgts = series(observed);
  for (const c of fgtsPayments) add(fgts, c.tx.month, c.tx.amountCents);
  if (payrollAnswer === null) {
    // D22 (PLAN §18, 15/11): until the per-month card is answered, gross pay = FGTS paid ÷ 0,08 in each month (FGTS is
    // 8% of the remuneration, Lei 8.036/1990, art. 15; not in @refund/law yet, so a documented assumption). Same cash
    // month as the FGTS payment; the 12-month sum is exact (hero: 10.880,00 ÷ 0,08 = 136.000,00), the month of the 13º
    // follows the FGTS column of F.2 (EXECUTION §9, 14/11 13º-timing row).
    for (const m of observed) grossPay[m] = fgtsToGross(fgts[m] ?? 0) as Cents;
    grossPayProvenance = {
      origin: 'default_assumption',
      source: 'D22: FGTS paid ÷ 0,08 (Lei 8.036/1990, art. 15); gross payroll card pending',
      transactionIds: uniq([...ids(fgtsPayments), ...ids(salaries)]),
    };
  }

  // ---------- Pró-labore (cash): gross from the card, else the E.2 estimate ----------
  const proLaborePayments = byCategory('pro_labore');
  const proLaboreAnswer = answers.get(CARD.proLaboreGross);
  const answeredGross =
    typeof proLaboreAnswer === 'number' &&
    Number.isSafeInteger(proLaboreAnswer) &&
    proLaboreAnswer > 0
      ? proLaboreAnswer
      : null;
  const confirmed = answeredGross !== null || isYes(proLaboreAnswer);
  const grossProLabore = series(observed);
  for (const c of proLaborePayments) {
    const gross =
      answeredGross ?? estimateGrossProLabore(c.tx.amountCents, c.tx.month) ?? c.tx.amountCents;
    add(grossProLabore, c.tx.month, gross);
  }
  const proLaboreProvenance: Provenance = confirmed
    ? {
        origin: 'user',
        source: `question:${CARD.proLaboreGross}`,
        transactionIds: ids(proLaborePayments),
      }
    : {
        origin: 'default_assumption',
        source: 'E.2 estimate: net ÷ 0,89',
        transactionIds: ids(proLaborePayments),
      };

  // ---------- Distributions: gross = net + DARF 1841 of the same accrual month (T02-13) ----------
  const distributionPayments = byCategory('profit_distribution');
  const darf1841 = used.filter((c) => c.label === 'darf_irrf_dividends');
  const irrfByMonth = new Map<string, { amount: number; ids: string[] }>();
  for (const c of darf1841) {
    const pa = accrualMonth(c.tx.description, c.tx.month);
    const prev = irrfByMonth.get(pa) ?? { amount: 0, ids: [] };
    irrfByMonth.set(pa, { amount: prev.amount + c.tx.amountCents, ids: [...prev.ids, c.tx.id] });
  }
  const distributions: Distribution[] = [];
  const distributionIds: string[] = [];
  for (const m of observed) {
    const net = distributionPayments.filter((c) => c.tx.month === m);
    if (net.length === 0) continue;
    const irrf = irrfByMonth.get(m);
    distributionIds.push(...ids(net), ...(irrf?.ids ?? []));
    const netTotal = net.reduce((a, c) => a + c.tx.amountCents, 0);
    distributions.push({
      month: m,
      payerCnpj: company.cnpj,
      grossAmount: (netTotal + (irrf?.amount ?? 0)) as Cents,
      irrfWithheld: (irrf?.amount ?? 0) as Cents,
      // T02-07: profits through 2025 approved by 31/12/2025 need the accountant; no card in P0.
      profitThrough2025Approved: false,
    });
  }
  const distributionSeries = series(observed);
  for (const d of distributions) add(distributionSeries, d.month, d.grossAmount);

  // ---------- DAS paid (C.3.7 inference reads it) ----------
  // One entry per PA. Two payments reach here only when the user said both are DAS (DAS + complementary DAS,
  // E9 review H3): they add up; while the "das:<pa>" card is open, neither feeds the facts.
  const dasPayments = inWindow.filter(
    (c) => c.label === 'das_simples' && c.classification.category === 'das_tax',
  );
  const byPa = new Map<YearMonth, DasPayment>();
  for (const c of dasPayments) {
    const pa = accrualMonth(c.tx.description, c.tx.month);
    const prev = byPa.get(pa);
    byPa.set(pa, {
      pa,
      amount: ((prev?.amount ?? 0) + c.tx.amountCents) as Cents,
      paymentDate:
        prev !== undefined && prev.paymentDate > c.tx.date ? prev.paymentDate : c.tx.date,
    });
  }
  const dasPaid: DasPayment[] = [...byPa.values()].sort((a, b) => compareYearMonth(a.pa, b.pa));

  // ---------- Qualifications ----------
  const qualifications: Facts['qualifications'] = {
    // C.2 "there is INSS on the pró-labore/salary" (EXECUTION §9, E3/E9): the confirmed pró-labore carries the
    // partner's 11% INSS, remitted in the DCTFWeb/GPS; an `inss_charge` category is not the test.
    contributesToRgps: {
      value: total(grossProLabore) > 0 || byLabel('gps_inss').some((c) => c.tx.holder === 'PF'),
      provenance: {
        origin: 'derived',
        source: 'C.2: INSS on the pró-labore (DCTFWeb/GPS paid)',
        transactionIds: uniq([
          ...ids(proLaborePayments),
          ...ids(byLabel('dctfweb')),
          ...ids(byLabel('gps_inss')),
        ]),
      },
    },
  };
  const exportAnswer = answers.get(CARD.export);
  const fxCredits = input.classified.filter((c) => c.cardId === CARD.export);
  if (isYes(exportAnswer) || isNo(exportAnswer)) {
    qualifications.exportResultAbroad = {
      value: isYes(exportAnswer),
      provenance: {
        origin: 'user',
        source: `question:${CARD.export}`,
        transactionIds: ids(fxCredits),
      },
    };
  }

  // ---------- Partner's PF ----------
  const health = new Map<
    string,
    { amount: number; cnaeOrProfession: string; beneficiary: 'holder' | 'dependent' | 'other' }
  >();
  const healthPayments = used.filter(
    (c) =>
      c.classification.category === 'deductible_health' &&
      c.classification.status !== 'pending_confirmation',
  );
  const analysisYear = input.analysisDate.slice(0, 4);
  const pfWindow = healthPayments.filter((c) => window.has(c.tx.month));
  for (const c of pfWindow) {
    const what = c.detail.profession ?? c.tx.counterparty?.cnae ?? 'unknown';
    const beneficiary = c.detail.beneficiary ?? 'holder';
    const key = `${what}|${beneficiary}`;
    const prev = health.get(key) ?? { amount: 0, cnaeOrProfession: what, beneficiary };
    health.set(key, { ...prev, amount: prev.amount + c.tx.amountCents });
  }
  const education = new Map<string, number>();
  const educationPayments = byCategory('deductible_education');
  for (const c of educationPayments) {
    const person = c.detail.person ?? 'holder';
    education.set(person, (education.get(person) ?? 0) + c.tx.amountCents);
  }
  const pgbl = used.filter(
    (c) =>
      c.classification.category === 'pgbl_pension' &&
      c.classification.status === 'confirmed' &&
      c.tx.date.startsWith(analysisYear),
  );
  const pgblTotal = pgbl.reduce((a, c) => a + c.tx.amountCents, 0) as Cents;

  const monthlyTaxableIncome = series(observed);
  const officialPensionDeductions = series(observed);
  for (const m of observed) {
    const p = grossProLabore[m] ?? 0;
    monthlyTaxableIncome[m] = p as Cents;
    officialPensionDeductions[m] =
      p > 0 ? inssPartner(p as Cents, parameterMonth(m)) : (0 as Cents);
  }
  const annualIrrf = observed.reduce((acc, m) => {
    const p = grossProLabore[m] ?? 0;
    if (p === 0) return acc;
    const pm = parameterMonth(m);
    return acc + monthlyIr(p as Cents, officialPensionDeductions[m] ?? (0 as Cents), 0, pm).ir;
  }, 0);
  // EXECUTION §9 (E3/E9): no formula in the spec; the 12 observed months of taxable income plus the gross
  // distributions (exempt), as the answer key derives it.
  const projectedAnnualTotalIncome = (total(monthlyTaxableIncome) +
    total(distributionSeries)) as Cents;
  const healthExpenses = [...health.values()]
    .map((h) => ({
      amount: h.amount as Cents,
      cnaeOrProfession: h.cnaeOrProfession,
      beneficiary: h.beneficiary,
    }))
    .sort((a, b) =>
      a.cnaeOrProfession < b.cnaeOrProfession
        ? -1
        : a.cnaeOrProfession > b.cnaeOrProfession
          ? 1
          : 0,
    );
  const educationExpenses = [...education.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([person, amount]) => ({ person, amount: amount as Cents }));
  const pfProvenance: Provenance = {
    origin: 'derived',
    source: 'pró-labore and distributions (PJ legs, DARF 1841) + PF health, education and PGBL',
    transactionIds: uniq([
      ...ids(proLaborePayments),
      ...distributionIds,
      ...ids(pfWindow),
      ...ids(educationPayments),
      ...ids(pgbl),
    ]),
  };

  // ---------- Questions answered about the company and the partner ----------
  const works = answers.get(CARD.worksInCompany);
  const bookkeeping = answers.get(CARD.bookkeeping);
  const userOr = <T>(
    answer: AnswerValue | undefined,
    id: string,
    fallback: T,
    toValue: (v: AnswerValue) => T,
  ) =>
    isYes(answer) || isNo(answer)
      ? {
          value: toValue(answer as AnswerValue),
          provenance: { origin: 'user', source: `question:${id}` } as Provenance,
        }
      : {
          value: fallback,
          provenance: {
            origin: 'default_assumption',
            source: `question:${id} (pending)`,
          } as Provenance,
        };
  const worksInCompany = userOr(works, CARD.worksInCompany, false, isYes);
  const hasFullBookkeeping = isYes(bookkeeping) || isNo(bookkeeping) ? isYes(bookkeeping) : false;

  const payroll = series(observed);
  for (const m of observed) payroll[m] = ((grossPay[m] ?? 0) + (fgts[m] ?? 0)) as Cents;
  const cpp = series(observed); // only Anexo IV / outside Simples; 0 in III and V (C.3.5)

  const facts: Facts = {
    referenceMonth,
    analysisDate: input.analysisDate,
    company: {
      value: {
        cnpj: company.cnpj,
        primaryCnae: company.primaryCnae.code,
        secondaryCnaes: company.secondaryCnaes.map((c) => c.code),
        regime: regimeOf(company),
        openedOn: company.activityStartDate,
        uf: company.uf,
      },
      provenance: { origin: 'cnpj', source: company.source },
    },
    monthlyRevenue: {
      value: revenueSeries,
      provenance: of(ids([...exportCredits, ...domesticCredits])),
    },
    monthlyExportRevenue: { value: exportSeries, provenance: of(ids(exportCredits)) },
    monthlyPayroll: {
      value: payroll,
      provenance: {
        ...grossPayProvenance,
        transactionIds: uniq([...ids(salaries), ...ids(fgtsPayments)]),
      },
    },
    monthlyProLabore: { value: grossProLabore, provenance: proLaboreProvenance },
    monthlyDistributions: { value: distributionSeries, provenance: of(distributionIds) },
    pf: {
      value: {
        annualTaxableIncome: total(monthlyTaxableIncome) as Cents,
        annualInssWithheld: total(officialPensionDeductions) as Cents,
        annualIrrfWithheld: annualIrrf as Cents,
        medicalExpenses: healthExpenses
          .filter((h) => h.beneficiary !== 'other')
          .reduce((a, h) => a + h.amount, 0) as Cents,
        educationExpenses: educationExpenses.map((e) => e.amount),
        dependents: 0,
        pgblContributed: pgblTotal,
      },
      provenance: pfProvenance,
    },
    assumptions: input.userAssumptions,
    companyDetails: {
      value: {
        subjectToFatorR: profile.subjectToFatorR,
        baseAnexo: profile.baseAnexo,
        resellsMonofasico: resellsMonofasico(company.primaryCnae.code),
        hasFullBookkeeping,
      },
      provenance: { origin: 'cnpj', source: profile.source },
    },
    revenueByMarket: {
      domestic: { value: domesticSeries, provenance: of(ids(domesticCredits)) },
      export: { value: exportSeries, provenance: of(ids(exportCredits)) },
    },
    cltPayroll: {
      grossPay: { value: grossPay, provenance: grossPayProvenance },
      fgtsPaid: { value: fgts, provenance: of(ids(fgtsPayments)) },
      cppOutsideDas: {
        value: cpp,
        provenance: { origin: 'derived', source: 'C.2: CPP inside the DAS outside Anexo IV' },
      },
    },
    partner: {
      worksInCompany,
      grossProLabore: { value: grossProLabore, provenance: proLaboreProvenance },
      distributions: { value: distributions, provenance: of(distributionIds) },
    },
    dasPaid: { value: dasPaid, provenance: of(ids(dasPayments)) },
    qualifications,
    pfDetails: {
      value: {
        monthlyTaxableIncome,
        officialPensionDeductions,
        // No dependents card in P0 (F.2: none).
        dependents: 0,
        healthExpenses,
        educationExpenses,
        pgblContributedThisYear: pgblTotal,
        projectedAnnualTotalIncome,
      },
      provenance: pfProvenance,
    },
  };
  return { ok: true, value: facts };
}
