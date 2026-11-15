// Boundary contracts of @refund/engine: ARCHITECTURE §4.1–4.2 (with the [CONTRACT] fields), ENGINE-SPEC C.2 and C.12.
// Names follow docs/GLOSSARY.md §4. Field names and unions here are a contract: do not rename.

// ---------- §4.1 Base types ----------

/** Money: integer in cents. Never float, never bigint (REVISAO M15). */
export type Cents = number & { readonly __brand: 'Cents' };
export const cents = (n: number): Cents => {
  if (!Number.isSafeInteger(n)) throw new RangeError(`invalid cents: ${n}`);
  return n as Cents;
};

/** Monthly accrual month "YYYY-MM". The engine never uses the JS clock type (the Brasília time zone breaks dates). */
export type YearMonth =
  `${number}-${'01' | '02' | '03' | '04' | '05' | '06' | '07' | '08' | '09' | '10' | '11' | '12'}`;
/** Civil date "YYYY-MM-DD" (no time, no time zone). */
export type CivilDate = `${number}-${string}-${string}`;
/** Rate as an exact decimal string ("0.1125"), converted to Decimal inside the engine. */
export type Rate = string & { readonly __brand: 'Rate' };

/** Result with no exception crossing package boundaries. */
export type Result<T, E = DomainError> = { ok: true; value: T } | { ok: false; error: E };
export interface DomainError {
  code: string; // stable, SCREAMING_SNAKE (e.g. 'INVALID_CNPJ')
  message: string; // PT-BR, can be shown to the user
  recoverable: boolean; // the UI can offer "try again"
  detail?: Record<string, unknown>; // never contains PII
}

// ---------- §4.2 Engine boundary ----------

export type Anexo = 'I' | 'II' | 'III' | 'IV' | 'V';

export interface Series {
  [m: YearMonth]: Cents;
}

export interface Provenance {
  origin: 'open_finance' | 'cnpj' | 'user' | 'default_assumption' | 'derived';
  transactionIds?: string[]; // ids of the NormalizedTransaction records that back the number
  source?: string; // e.g. 'brasilapi', 'question:pro_labore'
}
export interface Fact<T> {
  value: T;
  provenance: Provenance;
}

export interface Distribution {
  month: YearMonth;
  payerCnpj: string;
  grossAmount: Cents;
  irrfWithheld: Cents;
  profitThrough2025Approved: boolean;
}

export interface DasPayment {
  pa: YearMonth;
  amount: Cents;
  paymentDate: CivilDate;
}

export interface Facts {
  referenceMonth: YearMonth; // last closed month of the analysis
  company: Fact<{
    cnpj: string;
    primaryCnae: string;
    secondaryCnaes: string[];
    regime: 'MEI' | 'SIMPLES' | 'PRESUMIDO' | 'REAL' | 'OTHER';
    currentAnexo?: Anexo;
    openedOn: CivilDate;
    uf: string;
  }>;
  monthlyRevenue: Fact<Series>;
  monthlyExportRevenue: Fact<Series>;
  monthlyPayroll: Fact<Series>; // salaries + charges (Fator R)
  monthlyProLabore: Fact<Series>;
  monthlyDistributions: Fact<Series>;
  pf: Fact<{
    annualTaxableIncome: Cents;
    annualInssWithheld: Cents;
    annualIrrfWithheld: Cents;
    medicalExpenses: Cents;
    educationExpenses: Cents[];
    dependents: number;
    pgblContributed: Cents;
  }>;
  assumptions: Record<
    string,
    {
      value: number | string | boolean | Record<string, number | string>;
      origin: 'user' | 'default';
      editable: boolean;
      source: string;
    }
  >;
  // The keys of `assumptions` are those of the `Assumptions` interface below (ENGINE-SPEC C.2); unknown key = validation error.

  // ---------- [CONTRACT] extensions from ENGINE-SPEC C.2 ----------
  analysisDate: CivilDate; // '2026-11-12'; the engine does not read the clock
  companyDetails: Fact<{
    subjectToFatorR: boolean; // CNAE in § 5º-I or § 5º-D (ENGINE-SPEC E.4)
    baseAnexo: Anexo; // the CNAE's base anexo
    resellsMonofasico: boolean; // CNAE from list E.5
    hasFullBookkeeping: boolean; // question to the user (default: false)
  }>;
  revenueByMarket: { domestic: Fact<Series>; export: Fact<Series> }; // accrual basis
  cltPayroll: {
    // CASH basis (payment date)
    grossPay: Fact<Series>; // salaries, 13º, vacation + 1/3, overtime (no pró-labore)
    fgtsPaid: Fact<Series>;
    cppOutsideDas: Fact<Series>; // only Anexo IV / outside Simples; 0 in III and V
  };
  partner: {
    worksInCompany: Fact<boolean>; // question (A02)
    grossProLabore: Fact<Series>; // confirmed by card or payslip (ENGINE-SPEC D7); cash
    distributions: Fact<Distribution[]>;
  };
  dasPaid: Fact<DasPayment[]>; // PGDAS-D inference (C.3.7)
  qualifications: {
    exportResultAbroad?: Fact<boolean>; // question (R05)
    pgdasSegregatesExport?: Fact<'yes' | 'no' | 'unknown'>; // derived from C.3.7 or from the user
    contributesToRgps: Fact<boolean>; // derived: there is INSS on the pró-labore/salary
  };
  pfDetails: Fact<{
    monthlyTaxableIncome: Series; // gross RT per month (salary + pró-labore + others)
    officialPensionDeductions: Series; // INSS withheld
    dependents: number;
    healthExpenses: {
      amount: Cents;
      cnaeOrProfession: string;
      beneficiary: 'holder' | 'dependent' | 'other';
    }[];
    educationExpenses: { person: string; amount: Cents }[];
    pgblContributedThisYear: Cents;
    projectedAnnualTotalIncome: Cents; // includes exempt income and dividends (IRPFM, R02)
  }>;
  /**
   * [CONTRACT proposal, E8] Outflows of the PJ account or card classified as personal (`personal_expense_in_pj`,
   * ENGINE-SPEC E.7): the input of alert A01 (D.7). Optional: absent = no such transaction was found.
   */
  personalExpensesInPj?: Fact<PersonalExpense[]>;
}

/** One PJ outflow classified as a personal expense (ENGINE-SPEC E.7 → A01). */
export interface PersonalExpense {
  transactionId: string;
  month: YearMonth;
  amount: Cents;
  merchant: string; // normalized merchant name (a company; never a person)
}

/** ENGINE-SPEC C.2 names the extended facts `EngineFacts`; ARCHITECTURE §4.2 merged the extensions into `Facts`. */
export type EngineFacts = Facts;

/** Editable engine assumptions (ENGINE-SPEC C.2). Valid keys of `Facts.assumptions`. */
export interface Assumptions {
  start: YearMonth; // default: month after the analysis ('2026-12')
  horizonMonths: 12; // fixed in P0
  fatorRMargin: Rate; // default '0.01' (ENGINE-SPEC D13)
  revenueProjection: 'avg12'; // future revenue = average of the 12 observed months, per market
  payrollProjection: 'sameMonthPriorYear'; // preserves 13º and vacation
  selicAnnual: Rate; // sgs provider (series 432); replay: fixture
  dividendRefundMonth: YearMonth; // default '2027-06'
  pgblRedemptionRate: Rate; // default '0.10'
  monofasicoPct?: Rate; // no default (ENGINE-SPEC D.6)
  r01Threshold: { absoluteMinimum: Cents; rbt12Percentage: Rate }; // 300000, '0.01'
}

export interface LegalRef {
  id: string; // exists in @refund/law
  label: string; // e.g. "LC 123/2006, art. 18, § 5º-J"
  url: string; // [CONTRACT] primary source (Planalto, DOU, Receita)
  verifiedAt: CivilDate; // [CONTRACT] date it was verified at the source
  // ARCHITECTURE §4.2 note: "LegalRef gains `type` and `captureSha256`". Optional until E2/E8 wire every ref
  // to a capture in docs/conferencias/fontes-oficiais.
  type?: 'regulation' | 'procedure';
  captureSha256?: string;
}
/** ENGINE-SPEC C.2 `EngineLegalRef`: the [CONTRACT] fields already live in `LegalRef`. */
export type EngineLegalRef = LegalRef;

export type StepRounding = 'HALF_UP_CENT' | 'TRUNC_2_DECIMALS_DISPLAY' | 'NONE';
export interface Step {
  id: string; // [CONTRACT] stable: '<rule>.<quantity>[.<month>]', e.g. 'R01.FS12.2027-04'
  label: string;
  formula: string; // readable: "RBT12 × alíquota nominal − parcela a deduzir"
  inputs: Record<
    string,
    { value: number | string; unit: 'cents' | 'rate' | 'months' | 'text'; factKey?: string }
  >;
  result: { value: number | string; unit: 'cents' | 'rate' | 'text' };
  rounding: StepRounding; // [CONTRACT] ENGINE-SPEC C.8
  month?: YearMonth; // [CONTRACT] PA the step refers to
  ref?: LegalRef;
  /**
   * [CONTRACT proposal, E5] Set when the step used a parameter not yet published for its month (ENGINE-SPEC C.1,
   * item 4): "parâmetro de 2027 ainda não publicado; usado o de 2026". Absent otherwise.
   */
  projectedNote?: string;
}
/** ENGINE-SPEC C.2 `EngineStep`: the [CONTRACT] fields already live in `Step`. */
export type EngineStep = Step;
export type Trace = Step[];

export type Confidence = 'confirmed' | 'estimated' | 'depends_on_regulation';

// ---------- ENGINE-SPEC C.12 (copied literally, ARCHITECTURE §4.2) ----------
export type Actor = 'you' | 'accountant' | 'you_or_accountant' | 'lawyer';
export interface ActionStep {
  id: string; // '<rule>.action.<n>', stable
  order: number;
  who: Actor;
  what: string; // imperative sentence for a layperson; numbers only via {placeholders} from the trace
  where?: { name: string; path?: string; url?: string };
  from?: YearMonth | CivilDate; // when the step becomes available
  until?: CivilDate; // hard deadline (statute of limitations, due date)
  documents?: string[];
  refIds: string[]; // LegalRef.id (law or procedure)
  noSource?: true;
}
export interface RecoveryItem {
  pa: YearMonth;
  measured: boolean; // measured = DAS seen in the statement; otherwise projected
  paymentDate: CivilDate | null; // null for projected ones → uses the estimated due date (C.12.2)
  federal: Cents;
  iss: Cents;
  icms: Cents;
  claimFrom: YearMonth; // PA + 4 months (C.12.2)
  claimUntil: CivilDate; // statute of limitations (C.12.2)
}
export interface HowToReceive {
  method:
    | 'lower_tax'
    | 'refund_pix_cnpj'
    | 'refund_municipality'
    | 'refund_state'
    | 'offset'
    | 'irpf_refund';
  summary: string; // e.g.: "Pix na conta da empresa (chave = CNPJ), corrigido pela Selic"
  firstEffect?: YearMonth | CivilDate;
  refIds: string[];
}

export interface Finding {
  ruleId: string;
  ruleVersion: string;
  order: number; // fixed application order in the combined scenario
  type: 'savings' | 'recovery' | 'alert' | 'risk';
  title: string; // plain-language headline
  marginalValue12m: Cents; // marginal contribution over the next 12 months
  annualRegimeValue?: Cents; // annual savings once the regime stabilizes (C3)
  regimeFrom?: YearMonth;
  range?: [Cents, Cents];
  byDestination?: {
    // [CONTRACT] only in type 'recovery' (ENGINE-SPEC D.5: R05-REC/R06-REC)
    federal: [Cents, Cents]; // PIS + Cofins (and CBS/IBS from 2027)
    municipal: [Cents, Cents]; // ISS
    state: [Cents, Cents]; // ICMS (0 for the hero)
  };
  confidence: Confidence;
  deadline?: CivilDate; // in recovery = oldestDeadline from ENGINE-SPEC D.5
  trace: Trace;
  refs: LegalRef[];
  doNot: string[];
  tradeoffs: string[];
  assumptionsUsed: string[];
  countsInTotal: boolean; // R02/alerts/risks = false (C2)
  actionPlan: ActionStep[]; // [CONTRACT] ENGINE-SPEC C.12
  howToReceive: HowToReceive[]; // [CONTRACT] ENGINE-SPEC C.12
  recoveryItems?: RecoveryItem[]; // [CONTRACT] only in 'recovery'
}

export interface Total {
  savings12m: Cents; // cost(current) − cost(optimized) over the next 12 months
  annualRegimeSavings: Cents | null;
  byConfidence: Record<Confidence, Cents>;
  recoveryRange: [Cents, Cents] | null; // never in the big number (C5)
}

export interface EngineResult {
  engineVersion: string;
  parametersVersion: string;
  parametersHash: string;
  inputsHash: string;
  findings: Finding[]; // sorted by `order`; Σ marginalValue12m (countsInTotal) == total.savings12m
  total: Total;
  optimizerCurve?: { monthlyProLabore: Cents; annualTotalCost: Cents }[]; // R01
}

// ---------- Profile-based estimate (ENGINE-SPEC C.11; ARCHITECTURE §4.2) ----------
export type RevenueBracket =
  | 'up_to_15k'
  | 'from_15k_to_30k'
  | 'from_30k_to_60k'
  | 'from_60k_to_150k'
  | 'from_150k_to_300k'
  | 'from_300k_to_400k'
  | 'above_400k'
  | 'dont_know'; // AVERAGE MONTHLY revenue
export interface ProfileAnswers {
  monthlyRevenueBracket: RevenueBracket;
  hasEmployees: 'yes' | 'no' | 'dont_know'; // only asked if the CNAE is subject to Fator R
  receivesFromAbroad: 'no' | 'less_than_half' | 'half_or_more' | 'dont_know';
}
/** Assembled by the web app from PublicCompany (§4.3); the engine does not import @refund/sources. */
export interface PublicProfile {
  cnpj: string;
  primaryCnae: string;
  isActive: boolean;
  optedIntoSimples: boolean;
  optedIntoMei: boolean;
  size: 'MEI' | 'ME' | 'EPP' | 'OTHER' | 'UNKNOWN';
  activityStartDate: CivilDate;
  uf: string;
}
export type NoRangeReason =
  | 'COMPANY_NOT_ACTIVE'
  | 'REGIME_MEI'
  | 'REGIME_OUT_OF_SCOPE'
  | 'CNAE_OUT_OF_SCOPE'
  | 'REVENUE_NOT_PROVIDED'
  | 'ABOVE_SUBLIMIT'
  | 'ABOVE_CEILING'
  | 'NO_RULE_WITH_VALUE'
  | 'MINIMUM_BELOW_FLOOR'
  | 'RANGE_TOO_WIDE';
export interface VisibleAssumption {
  id: 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P7' | 'P8'; // ENGINE-SPEC C.11.3
  text: string;
  why: string;
  type: 'answer' | 'grid_limit' | 'conservative' | 'potential_value' | 'source';
  ref?: LegalRef;
}
export interface ApplicableRule {
  ruleId: 'R01' | 'R05' | 'R06' | 'R03' | 'R02';
  title: string;
  why: string;
  ref: LegalRef; // ref = 1st LegalRef in the rule's metadata
  range?: [Cents, Cents]; // only R01/R05; they do NOT add up (C.11.4)
}
export interface BoundaryScenario {
  id: string; // 'R3000000-S0.75-F1517800'
  monthlyRevenue: Cents;
  exportFraction: Rate;
  monthlyCltPayroll: Cents;
  annualRegimeTotal: Cents;
  byRule: { R01: Cents; R05: Cents };
}
export interface EstimateBase {
  label: 'estimativa por perfil';
  rules: ApplicableRule[];
  assumptions: VisibleAssumption[];
  scenarios: BoundaryScenario[];
  engineVersion: string;
  parametersVersion: string;
}
export type ProfileEstimate =
  | (EstimateBase & {
      type: 'range';
      unit: 'per_year_in_regime';
      total: [Cents, Cents]; // displayed: [0,85 × grid min.; grid max.]
      gridTotal: [Cents, Cents];
    })
  | (EstimateBase & { type: 'no_range'; reason: NoRangeReason; gridTotal?: [Cents, Cents] });

// ---------- ENGINE-SPEC C.2 internal model (scenario, PA result, cost) ----------
export type Tax =
  | 'IRPJ'
  | 'CSLL'
  | 'COFINS'
  | 'PIS'
  | 'CPP'
  | 'ICMS'
  | 'ISS'
  | 'IPI'
  | 'CBS'
  | 'IBS';
export type Market = 'domestic' | 'export';
export type SimplesBracket = 1 | 2 | 3 | 4 | 5 | 6;

export interface Decisions {
  proLabore: Series; // per accrual month; from `start` on, P* applies
  segregateExport: boolean;
  segregateMonofasico: boolean;
  pgblContribution: Record<number /* year */, Cents>;
}
export interface MarketDas {
  market: Market;
  revenue: Cents;
  bracket: SimplesBracket;
  effectiveRate: Rate;
  byTax: Partial<Record<Tax, Cents>>;
  subtotal: Cents;
}
export interface PaResult {
  pa: YearMonth;
  rbt12: { domestic: Cents; export: Cents; total: Cents };
  fs12: Cents;
  windowFrom: YearMonth;
  windowTo: YearMonth;
  fatorR: Rate | null; // null if the CNAE is not subject to it
  anexo: Anexo;
  byMarket: MarketDas[];
  das: Cents;
  inssPartner: Cents;
  cppOutsideDas: Cents;
  irrfProLabore: Cents; // irrf = cash
}
export interface Cost {
  das: Cents;
  inssPartner: Cents;
  cppOutsideDas: Cents;
  irpfAdjustment: Cents;
  pgblRedemptionProvision: Cents;
  total: Cents;
}
export interface Scenario {
  id: 'S0' | 'S1' | 'S2' | 'S3' | 'S4';
  decisions: Decisions;
  pas: PaResult[]; // horizon of 12 PAs + 12 steady-state PAs
  irpf: Record<number, { rt: Cents; model: 'simplified' | 'full'; tax: Cents; reduction: Cents }>;
  cost12m: Cost;
  regimeCost: Cost;
  regimeFrom: YearMonth;
}
