// Facts builders for the engine golden tests. The hero's values are COPIED from the answer key
// packages/personas/data/dev-exportador.answer-key.json#expectedFacts (ENGINE-SPEC F.2): @refund/personas depends on
// @refund/engine, so engine tests cannot import it (no cycles, ARCHITECTURE §3.3, rules 7–8).
import { brl } from '../../../src/money.ts';
import { inssPartner } from '../../../src/primitives/inss.ts';
import { addMonths, monthRange } from '../../../src/time.ts';
import type {
  Cents,
  CivilDate,
  DasPayment,
  Distribution,
  Fact,
  Facts,
  Provenance,
  Series,
  YearMonth,
} from '../../../src/types.ts';

const user: Provenance = { origin: 'user', source: 'question' };
const of: Provenance = { origin: 'open_finance' };
const derived: Provenance = { origin: 'derived' };
export const fact = <T>(value: T, provenance: Provenance = of): Fact<T> => ({ value, provenance });

export const OBSERVED: YearMonth[] = monthRange('2025-11', '2026-10');

export const constant = (amount: Cents, months: YearMonth[] = OBSERVED): Series =>
  Object.fromEntries(months.map((m) => [m, amount])) as Series;

const sum = (s: Series) => Object.values(s).reduce((a, b) => a + b, 0) as Cents;

export interface SyntheticOptions {
  domestic?: Series;
  export?: Series;
  cltGross?: Series;
  fgts?: Series;
  proLabore?: Series;
  distributions?: Distribution[];
  dasPaid?: DasPayment[];
  subjectToFatorR?: boolean;
  baseAnexo?: 'I' | 'III' | 'V';
  worksInCompany?: boolean;
  exportResultAbroad?: boolean;
  pgdasSegregatesExport?: 'yes' | 'no' | 'unknown';
  otherTaxableIncome?: Series;
  otherInss?: Series;
  dependents?: number;
  pgblContributedThisYear?: Cents;
  projectedAnnualTotalIncome?: Cents;
  assumptions?: Facts['assumptions'];
  regime?: Facts['company']['value']['regime'];
  analysisDate?: CivilDate;
  referenceMonth?: YearMonth;
  openedOn?: CivilDate;
}

/** Synthetic company with 12 observed months (nov/2025–oct/2026), analysed on 12/11/2026 (start 2026-12). */
export function syntheticFacts(o: SyntheticOptions = {}): Facts {
  const domestic = o.domestic ?? {};
  const exp = o.export ?? {};
  const cltGross = o.cltGross ?? {};
  const fgts = o.fgts ?? {};
  const proLabore = o.proLabore ?? constant(brl('1.621,00'));
  const months = OBSERVED;
  const rt: Series = {};
  const inss: Series = {};
  for (const m of months) {
    const p = proLabore[m] ?? 0;
    rt[m] = ((o.otherTaxableIncome?.[m] ?? 0) + p) as Cents;
    // Partner INSS on the pró-labore (C.3.3), plus the other INSS given.
    const partner = inssPartner(p as Cents, m < '2026-01' ? '2026-01' : m);
    inss[m] = ((o.otherInss?.[m] ?? 0) + partner) as Cents;
  }
  const revenueTotal: Series = {};
  for (const m of months) revenueTotal[m] = ((domestic[m] ?? 0) + (exp[m] ?? 0)) as Cents;
  const payroll: Series = {};
  for (const m of months) payroll[m] = ((cltGross[m] ?? 0) + (fgts[m] ?? 0)) as Cents;
  const qualifications: Facts['qualifications'] = {
    contributesToRgps: fact(true, derived),
  };
  if (o.exportResultAbroad !== undefined)
    qualifications.exportResultAbroad = fact(o.exportResultAbroad, user);
  if (o.pgdasSegregatesExport !== undefined)
    qualifications.pgdasSegregatesExport = fact(o.pgdasSegregatesExport, derived);
  const distributions = o.distributions ?? [];
  const distSeries: Series = {};
  for (const d of distributions)
    distSeries[d.month] = ((distSeries[d.month] ?? 0) + d.grossAmount) as Cents;

  return {
    referenceMonth: o.referenceMonth ?? '2026-10',
    analysisDate: o.analysisDate ?? '2026-11-12',
    company: fact(
      {
        cnpj: 'RFTEST00000100',
        primaryCnae: '6201-5/01',
        secondaryCnaes: [],
        regime: o.regime ?? 'SIMPLES',
        openedOn: o.openedOn ?? '2019-03-11',
        uf: 'SP',
      },
      { origin: 'cnpj' },
    ),
    monthlyRevenue: fact(revenueTotal),
    monthlyExportRevenue: fact(exp),
    monthlyPayroll: fact(payroll, user),
    monthlyProLabore: fact(proLabore, user),
    monthlyDistributions: fact(distSeries),
    pf: fact({
      annualTaxableIncome: sum(rt),
      annualInssWithheld: sum(inss),
      annualIrrfWithheld: 0 as Cents,
      medicalExpenses: 0 as Cents,
      educationExpenses: [],
      dependents: o.dependents ?? 0,
      pgblContributed: o.pgblContributedThisYear ?? (0 as Cents),
    }),
    assumptions: o.assumptions ?? {},
    companyDetails: fact(
      {
        subjectToFatorR: o.subjectToFatorR ?? true,
        baseAnexo: o.baseAnexo ?? 'III',
        resellsMonofasico: false,
        hasFullBookkeeping: true,
      },
      { origin: 'cnpj' },
    ),
    revenueByMarket: { domestic: fact(domestic), export: fact(exp) },
    cltPayroll: {
      grossPay: fact(cltGross, user),
      fgtsPaid: fact(fgts),
      cppOutsideDas: fact({}),
    },
    partner: {
      worksInCompany: fact(o.worksInCompany ?? true, user),
      grossProLabore: fact(proLabore, user),
      distributions: fact(distributions),
    },
    dasPaid: fact(o.dasPaid ?? []),
    qualifications,
    pfDetails: fact({
      monthlyTaxableIncome: rt,
      officialPensionDeductions: inss,
      dependents: o.dependents ?? 0,
      healthExpenses: [],
      educationExpenses: [],
      pgblContributedThisYear: o.pgblContributedThisYear ?? (0 as Cents),
      projectedAnnualTotalIncome: o.projectedAnnualTotalIncome ?? (30000000 as Cents),
    }),
  };
}

// ---------- Hero (ENGINE-SPEC F.2; answer key expectedFacts) ----------

const HERO_CNPJ = 'RFDEV001000158';
const series = (values: number[]): Series =>
  Object.fromEntries(OBSERVED.map((m, i) => [m, values[i] as Cents])) as Series;

export const HERO_DAS_PAID: DasPayment[] = [
  ['2025-10', '2025-11-19'],
  ['2025-11', '2025-12-19'],
  ['2025-12', '2026-01-20'],
  ['2026-01', '2026-02-20'],
  ['2026-02', '2026-03-20'],
  ['2026-03', '2026-04-20'],
  ['2026-04', '2026-05-20'],
  ['2026-05', '2026-06-19'],
  ['2026-06', '2026-07-20'],
  ['2026-07', '2026-08-20'],
  ['2026-08', '2026-09-18'],
  ['2026-09', '2026-10-20'],
].map(([pa, paymentDate]) => ({
  pa: pa as YearMonth,
  amount: 892500 as Cents,
  paymentDate: paymentDate as CivilDate,
}));

export function heroFacts(assumptions: Facts['assumptions'] = HERO_ASSUMPTIONS): Facts {
  const distributions: Distribution[] = OBSERVED.map((month) => ({
    month,
    payerCnpj: HERO_CNPJ,
    grossAmount: (month === '2026-07' ? 9000000 : 1800000) as Cents,
    irrfWithheld: (month === '2026-07' ? 900000 : 0) as Cents,
    profitThrough2025Approved: false,
  }));
  const f = syntheticFacts({
    export: constant(5000000 as Cents),
    domestic: constant(0 as Cents),
    cltGross: series([
      1020000, 2210000, 1020000, 1020000, 1020000, 1020000, 1020000, 1190000, 1020000, 1020000,
      1020000, 1020000,
    ]),
    fgts: series([
      81600, 122400, 136000, 81600, 81600, 81600, 81600, 81600, 95200, 81600, 81600, 81600,
    ]),
    proLabore: constant(162100 as Cents),
    distributions,
    dasPaid: HERO_DAS_PAID,
    exportResultAbroad: true,
    projectedAnnualTotalIncome: 30745200 as Cents,
    assumptions,
  });
  f.company.value.cnpj = HERO_CNPJ;
  // dev-exportador.json#company.ibgeMunicipality: São Paulo/SP (the SAV steps of the action plan, E8b).
  f.company.value.ibgeMunicipality = '3550308';
  f.pfDetails.value.healthExpenses = [
    { amount: 780000 as Cents, cnaeOrProfession: '6550-2/00', beneficiary: 'holder' },
    { amount: 960000 as Cents, cnaeOrProfession: 'psychologist', beneficiary: 'holder' },
  ];
  // F.2 "Personal PJ card": Netflix 55,90 every month and a supermarket 812,40 in mar/2026 (answer key: 13
  // `personal_in_pj` transactions, personalOnPjCard 1.483,20). Ids are fixture ids, not pipeline ids.
  f.personalExpensesInPj = fact([
    ...OBSERVED.map((month) => ({
      transactionId: `fixture-netflix-${month}`,
      month,
      amount: 5590 as Cents,
      merchant: 'NETFLIX',
    })),
    {
      transactionId: 'fixture-supermarket-2026-03',
      month: '2026-03' as YearMonth,
      amount: 81240 as Cents,
      merchant: 'SUPERMERCADO',
    },
  ]);
  return f;
}

/** F.2 default assumptions: Selic fixture 15,00% (SGS 432 in /live), refund 2027-06; the rest are the defaults. */
export const HERO_ASSUMPTIONS: Facts['assumptions'] = {
  selicAnnual: { value: '0.15', origin: 'default', editable: true, source: 'sgs:432 (fixture)' },
};

export const withMonths = (from: YearMonth, n: number, amount: Cents): Series =>
  constant(amount, monthRange(from, addMonths(from, n - 1)));
