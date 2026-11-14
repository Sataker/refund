import type {
  CivilDate,
  PublicCompany,
  SourceAccount,
  SourceIdentity,
  SourceItem,
  SourceTransaction,
} from '@refund/sources';

// TODO(E1-merge): import type { Cents, YearMonth, Series } from '@refund/engine' (ARCHITECTURE §4.1–4.2).
// Local copies with the same shape, because the engine types land in parallel (E1).
export type Cents = number & { readonly __brand: 'Cents' };
export type YearMonth =
  `${number}-${'01' | '02' | '03' | '04' | '05' | '06' | '07' | '08' | '09' | '10' | '11' | '12'}`;
export interface Series {
  [m: YearMonth]: Cents;
}

export const cents = (n: number): Cents => {
  if (!Number.isSafeInteger(n)) throw new RangeError(`invalid cents: ${n}`);
  return n as Cents;
};

export type PersonaId = 'dev-exportador';

// TODO(E9): import type { Category } from '@refund/pipeline' is not allowed (personas cannot import
// the pipeline, TESTS §1); keep this union equal to ARCHITECTURE §4.4 `Category`.
export type Category =
  | 'service_revenue'
  | 'sales_revenue'
  | 'export_revenue'
  | 'financial_income'
  | 'pro_labore'
  | 'profit_distribution'
  | 'salary'
  | 'inss_charge'
  | 'fgts_charge'
  | 'das_tax'
  | 'darf_tax'
  | 'other_taxes'
  | 'deductible_health'
  | 'deductible_education'
  | 'pgbl_pension'
  | 'operating_expense'
  | 'personal_expense_in_pj'
  | 'same_holder_transfer'
  | 'bank_fee'
  | 'unclassified';

/** Classification labels of ENGINE-SPEC E.2–E.3 (what the E.8 accuracy is measured on). */
export type ClassificationLabel =
  | 'das_simples'
  | 'das_mei'
  | 'darf_irrf_dividends'
  | 'darf_irrf_employment'
  | 'dctfweb'
  | 'fgts'
  | 'gps_inss'
  | 'carne_leao'
  | 'export_revenue'
  | 'domestic_revenue'
  | 'partner_contribution'
  | 'loan_received'
  | 'pro_labore'
  | 'distribution'
  | 'salary'
  | 'deductible_health'
  | 'health_to_confirm'
  | 'deductible_education'
  | 'non_deductible'
  | 'personal_in_pj'
  | 'pgbl';

// ---------- Persona data (what /demo imports) ----------

export interface PersonaAccount {
  account: SourceAccount;
  transactions: SourceTransaction[];
}

export interface PersonaItem {
  holder: 'PF' | 'PJ';
  item: SourceItem;
  identity: SourceIdentity;
  accounts: PersonaAccount[];
}

export interface PersonaData {
  schemaVersion: 1;
  id: PersonaId;
  seed: number;
  synthetic: true;
  /** First name shown in the UI. Never a full name (ARCHITECTURE §6.5). */
  holderDisplayName: string;
  analysisDate: CivilDate;
  referenceMonth: YearMonth;
  period: { from: CivilDate; to: CivilDate };
  company: PublicCompany;
  items: PersonaItem[];
}

// ---------- Answer key (tests only; ARCHITECTURE §5.1) ----------

export interface AnswerKeyTransaction {
  sourceId: string;
  holder: 'PF' | 'PJ';
  month: YearMonth;
  amountCents: number;
  /** ENGINE-SPEC E.3 label of the true classification. */
  label: ClassificationLabel;
  /** ARCHITECTURE §4.4 category; null when no category of the contract fits (EXECUTION §9, 14/11). */
  category: Category | null;
  /** Card that confirms it, when the label always asks (E.1.4, E.2, E.3). */
  cardId: string | null;
  /** What F.2 says about it (gross amount, accrual month…), for the reviewer. */
  note: string;
}

export interface SameHolderPair {
  kind: 'pro_labore' | 'distribution';
  pjTransactionId: string;
  pfTransactionId: string;
  amountCents: number;
}

export interface CardAnswer {
  id: string;
  type: 'transaction' | 'monthly_pro_labore' | 'assumption';
  question: string;
  answer: string | boolean | number | Series;
  transactionIds: string[];
  source: string;
}

export interface VideoNumber {
  screen: 'analysis' | 'dashboard';
  testId: string;
  cents: Cents;
}

export interface ExpectedFinding {
  ruleId: 'R01' | 'R05' | 'R06' | 'R04' | 'R05-REC' | 'R02' | 'A01' | 'A02' | 'R03';
  confidence: 'confirmed' | 'estimated' | null;
  countsInTotal: boolean;
  marginalValue12m: Cents | null;
  annualRegimeValue: Cents | null;
  range: { min: Cents; max: Cents } | null;
  cashCost: Cents | null;
  note: string;
}

export interface ExpectedFacts {
  referenceMonth: YearMonth;
  analysisDate: CivilDate;
  rbt12: Cents;
  fs12: Cents;
  /** FS12 / RBT12 as an exact decimal string. */
  fatorR: string;
  anexo: 'V';
  company: {
    cnpj: string;
    primaryCnae: string;
    regime: 'SIMPLES';
    uf: string;
    openedOn: CivilDate;
  };
  companyDetails: {
    subjectToFatorR: boolean;
    resellsMonofasico: boolean;
    hasFullBookkeeping: boolean;
  };
  revenueByMarket: { domestic: Series; export: Series };
  cltPayroll: { grossPay: Series; fgtsPaid: Series; cppOutsideDas: Series };
  partner: {
    worksInCompany: boolean;
    grossProLabore: Series;
    distributions: {
      month: YearMonth;
      payerCnpj: string;
      grossAmount: Cents;
      irrfWithheld: Cents;
      profitThrough2025Approved: boolean;
    }[];
  };
  dasPaid: { pa: YearMonth; amount: Cents; paymentDate: CivilDate }[];
  qualifications: {
    exportResultAbroad: boolean;
    pgdasSegregatesExport: 'no';
    contributesToRgps: boolean;
  };
  pgdasInference: {
    hypothesis: 'V_not_segregated';
    matchedPas: number;
    expectedDasByHypothesis: {
      vNotSegregated: Cents;
      vSegregated: Cents;
      iiiNotSegregated: Cents;
      iiiSegregated: Cents;
    };
  };
  pfDetails: {
    monthlyTaxableIncome: Series;
    officialPensionDeductions: Series;
    dependents: number;
    healthExpenses: { amount: Cents; cnaeOrProfession: string; beneficiary: 'holder' }[];
    educationExpenses: { person: string; amount: Cents }[];
    pgblContributedThisYear: Cents;
  };
  /** Σ 12m row of ENGINE-SPEC F.2 plus the PF lines. */
  totals12m: {
    exportRevenue: Cents;
    grossCltPay: Cents;
    fgtsPaid: Cents;
    grossProLabore: Cents;
    dasPaid: Cents;
    grossDistributions: Cents;
    darf1841: Cents;
    personalOnPjCard: Cents;
    pfHealthPlan: Cents;
    pfPsychologist: Cents;
    pfGym: Cents;
    pfTotalIncome: Cents;
  };
}

export interface AnswerKey {
  schemaVersion: 1;
  personaId: PersonaId;
  source: string;
  transactions: AnswerKeyTransaction[];
  sameHolderPairs: SameHolderPair[];
  expectedFacts: ExpectedFacts;
  cardAnswers: CardAnswer[];
  expectedFindings: ExpectedFinding[];
  /** ENGINE-SPEC F.4: cost(S0) − cost(S4). */
  expectedTotal: { next12m: Cents; annualRegime: Cents };
  videoNumbers: VideoNumber[];
}

export interface GeneratedPersona {
  data: PersonaData;
  answerKey: AnswerKey;
}
