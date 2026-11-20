// The financial view behind IDENTITY-AND-UI Screen 5b ("Finanças"; ARCHITECTURE §4.4 "Financial view", E14b, D27).
// E9's classifications grouped by display group, deterministic detectors, and tax seals that only LINK to findings the
// engine already produced (ENGINE-SPEC E.9). Pure: no clock, no I/O, no LLM. Money in integer cents.
import {
  addMonths,
  type Cents,
  type CivilDate,
  type DomainError,
  type Finding,
  type LegalRef,
  legalRefOf,
  type ParameterKey,
  param,
  type Result,
  sumCents,
  type YearMonth,
} from '@refund/engine';
import { redactDescription, type SourceTransaction } from '@refund/sources';
import { amountClusters, counterpartyKey, daysApart, isRecurring } from './classify/identity.ts';
import { RX_ACCRUAL } from './classify/regex.ts';
import { regimeOf } from './facts.ts';
import { normalizeTransactions } from './normalize.ts';
import { ratioBps } from './ratio.ts';
import type {
  AnalysisInput,
  Category,
  Classification,
  NormalizedTransaction,
  PipelineResult,
} from './types.ts';

/** Display groups: a Category, split by the E.2/E.3 label where one Category mixes different things. */
export type FinancialGroupId =
  | 'export_revenue'
  | 'service_revenue'
  | 'sales_revenue'
  | 'financial_income'
  | 'loans'
  | 'partner_contribution'
  | 'holder_transfer'
  | 'internal_transfer'
  | 'reversal'
  | 'das'
  | 'payroll_taxes'
  | 'dividend_irrf'
  | 'carne_leao'
  | 'other_taxes'
  | 'fgts'
  | 'salaries'
  | 'pro_labore'
  | 'distributions'
  | 'operating_expense'
  | 'personal_in_pj'
  | 'bank_fees'
  | 'health'
  | 'education'
  | 'pension'
  | 'personal'
  | 'unclassified';

export type TaxSealKind =
  | 'money_to_receive' // "tem dinheiro a receber"
  | 'lower_tax' // "pode pagar menos"
  | 'deductible' // "é dedutível"
  | 'generates_credit' // "gera crédito": contract only, emitted nowhere in P0 (D27)
  | 'risk' // "é risco"
  | 'attention'; // "atenção"

export interface TaxSeal {
  kind: TaxSealKind;
  /** Findings this seal opens (sorted by engine `order`). Empty only for 'deductible'. */
  ruleIds: string[];
  /** Citation shown in the LawSeal: refs[0] of the first finding, or legalRefOf(param) for 'deductible'. */
  ref: LegalRef;
}

/** The finding fields a seal reads. `howToReceive` only decides R02 on DARF 1841 (D29). */
export type FinancialViewFinding = Pick<
  Finding,
  'ruleId' | 'order' | 'type' | 'refs' | 'countsInTotal' | 'marginalValue12m'
> &
  Partial<Pick<Finding, 'howToReceive'>>;

export interface FinancialViewInput {
  referenceMonth: YearMonth; // last closed month (= Facts.referenceMonth)
  regime: 'MEI' | 'SIMPLES' | 'PRESUMIDO' | 'REAL' | 'OTHER';
  transactions: readonly NormalizedTransaction[];
  classifications: readonly Classification[]; // one per transaction (E9 output, after answers)
  findings: readonly FinancialViewFinding[];
  /** Open card ids (e.g. 'das:2026-05') so a duplicate can link to its card on Screen 7. */
  openQuestionIds?: readonly string[];
  /** [D31] Display names of the bank accounts ("Banco Meridiano · Conta Corrente PJ"); never a number or an id. */
  accounts?: readonly FinancialViewAccount[];
  /**
   * [D31] Transactions the account owner removed as a duplicate. The view is rebuilt without them (totals, groups,
   * seals, detectors); the engine analysis is NOT re-run. /demo keeps them client-side, /app will persist them (E14).
   */
  excludedTransactionIds?: readonly string[];
}

export interface FinancialViewAccount {
  id: string;
  holder: 'PF' | 'PJ';
  label: string;
  /** [D43] The Open Finance account type; 'CREDIT' is a credit-card account. Absent = unknown (nothing inferred). */
  type?: 'BANK' | 'CREDIT';
}

export interface MonthValue {
  month: YearMonth;
  cents: Cents;
}

export interface GroupLine {
  groupId: FinancialGroupId;
  slug: string; // PT, URL anchor: '#grupo-das'; unique per holder ('-entradas'/'-saidas' when both directions exist)
  label: string; // PT-BR
  holder: 'PF' | 'PJ';
  direction: 'inflow' | 'outflow';
  total12m: Cents;
  count: number;
  byMonth: MonthValue[]; // the 12 months, oldest → newest, zeros included
  lastMonth: Cents; // referenceMonth
  previousMonth: Cents;
  deltaCents: number; // lastMonth − previousMonth
  deltaBps: number | null; // ratioBps(delta, previousMonth); null when previousMonth = 0
  shareBps: number; // ratioBps(total12m, holder+direction total)
  seals: TaxSeal[]; // order: money_to_receive, lower_tax, deductible, generates_credit, attention, risk
  pending: number; // transactions still 'pending_confirmation'
  byOrigin: { rule: number; llm: number; user: number };
  transactionIds: string[];
}

export interface ChargeRow {
  key: string; // stable: groupId + counterparty key + amount
  groupId: FinancialGroupId;
  label: string; // CNPJ → counterparty name; CPF → "Pessoa física · <mask>"; card → description
  holder: 'PF' | 'PJ';
  amount: Cents; // one occurrence (the latest)
  occurrences: number;
  total: Cents; // Σ of the occurrences (sumCents)
  firstDate: CivilDate;
  lastDate: CivilDate;
  transactionIds: string[];
}

export interface MonthHighlight {
  month: YearMonth;
  deltaCents: number; // holder outflow, month − previous month (> 0 only)
  driver: { groupId: FinancialGroupId; deltaCents: number }; // the group whose own delta is largest
}

export interface DuplicateSuspect {
  reason: 'same_guide_same_period' | 'same_charge_within_3_days';
  groupId: FinancialGroupId;
  amount: Cents;
  dates: CivilDate[];
  transactionIds: string[]; // ≥ 2
  questionId?: string; // E9 card, e.g. 'das:2026-05'
}

/** [CONTRACT addition, E14b] The tile "{mês}: R$ X saíram · R$ Y a mais que {mês anterior}" (the web never subtracts). */
export interface OutflowChange {
  month: YearMonth;
  cents: Cents;
  previousMonth: YearMonth;
  previousCents: Cents;
  deltaCents: number;
}

export interface HolderView {
  holder: 'PF' | 'PJ';
  inflow12m: Cents;
  outflow12m: Cents;
  monthly: { month: YearMonth; inflow: Cents; outflow: Cents }[];
  groups: GroupLine[]; // inflows then outflows, each by total12m desc
  biggestOutflows: ChargeRow[]; // top 5 by single amount; identical series collapse (group + amount)
  recurring: ChargeRow[];
  fees: { total12m: Cents; rows: ChargeRow[] };
  duplicates: DuplicateSuspect[];
  highlights: MonthHighlight[]; // top 3 month-over-month increases of outflow
  outflowChange: OutflowChange;
  /** [D31] The tiles split per bank account (Σ = the tiles), largest outflow first. */
  accounts: AccountLine[];
  /** [D31] Own-account transfers inside the tiles ("Entre contas da empresa": they enter one account, leave another). */
  internalTransfers: { inflow: Cents; outflow: Cents };
  /**
   * [D43] Card-bill payments, kept OUT of the tiles, the groups, the accounts and the detectors because the holder's
   * card account is connected and its purchases already count in "Saiu". `outflow`: paid from a bank account;
   * `inflow`: the same payment credited on the card account. Ids in date order.
   */
  cardBillPayments: { outflow: Cents; inflow: Cents; transactionIds: string[] };
}

/** [D31] One bank account of a holder. `internal*` are its transfers to/from the holder's other accounts. */
export interface AccountLine {
  accountId: string;
  label: string;
  inflow12m: Cents;
  outflow12m: Cents;
  internalIn: Cents;
  internalOut: Cents;
  count: number;
}

/** [D31] A transaction the owner excluded, listed so the screen can offer "Desfazer". */
export interface ExcludedTransaction {
  transactionId: string;
  holder: 'PF' | 'PJ';
  accountId: string;
  date: CivilDate;
  amount: Cents;
  groupId: FinancialGroupId;
  label: string;
}

export interface FinancialView {
  referenceMonth: YearMonth;
  months: YearMonth[]; // 12, oldest → newest
  basis: 'cash'; // as the money left/entered the account (net), not the gross facts
  pj: HolderView | null; // null when the PJ account was not connected
  pf: HolderView | null; // null when the user skipped the PF
  /** [D31] The owner's exclusions, in date order (empty without any). */
  excluded: ExcludedTransaction[];
}

// ---------- Fixed group table (ARCHITECTURE §4.4; label and slug are user-visible, so PT) ----------

export const FINANCIAL_GROUPS: Readonly<Record<FinancialGroupId, { label: string; slug: string }>> =
  {
    export_revenue: { label: 'Receita do exterior', slug: 'receita-exterior' },
    service_revenue: { label: 'Receita de serviços', slug: 'receita-servicos' },
    sales_revenue: { label: 'Receita de vendas', slug: 'receita-vendas' },
    financial_income: { label: 'Rendimentos', slug: 'rendimentos' },
    loans: { label: 'Empréstimos recebidos', slug: 'emprestimos' },
    partner_contribution: { label: 'Aportes do sócio', slug: 'aportes' },
    holder_transfer: { label: 'Entre você e a empresa', slug: 'entre-voce-e-a-empresa' },
    internal_transfer: { label: 'Entre contas da empresa', slug: 'entre-contas' },
    reversal: { label: 'Estornos e resgates', slug: 'estornos' },
    das: { label: 'DAS (Simples ou MEI)', slug: 'das' },
    payroll_taxes: { label: 'INSS e IR da folha', slug: 'impostos-da-folha' },
    dividend_irrf: { label: 'IR sobre lucros (DARF 1841)', slug: 'ir-sobre-lucros' },
    carne_leao: { label: 'Carnê-leão', slug: 'carne-leao' },
    other_taxes: { label: 'Outros impostos', slug: 'outros-impostos' },
    fgts: { label: 'FGTS', slug: 'fgts' },
    salaries: { label: 'Salários', slug: 'salarios' },
    pro_labore: { label: 'Pró-labore', slug: 'pro-labore' },
    distributions: { label: 'Distribuição de lucros', slug: 'distribuicao-de-lucros' },
    operating_expense: { label: 'Despesas da empresa', slug: 'despesas-da-empresa' },
    personal_in_pj: {
      label: 'Gastos pessoais pagos pela empresa',
      slug: 'gastos-pessoais-na-empresa',
    },
    bank_fees: { label: 'Tarifas bancárias', slug: 'tarifas' },
    health: { label: 'Saúde', slug: 'saude' },
    education: { label: 'Educação', slug: 'educacao' },
    pension: { label: 'Previdência privada', slug: 'previdencia' },
    personal: { label: 'Gastos pessoais', slug: 'gastos-pessoais' },
    unclassified: { label: 'Sem categoria', slug: 'sem-categoria' },
  };

const BY_CATEGORY: Readonly<Record<Category, FinancialGroupId>> = {
  export_revenue: 'export_revenue',
  service_revenue: 'service_revenue',
  sales_revenue: 'sales_revenue',
  financial_income: 'financial_income',
  same_holder_transfer: 'holder_transfer',
  das_tax: 'das',
  inss_charge: 'payroll_taxes',
  // A DARF with no recognized code label (e.g. an LLM row) has no specific group of its own.
  darf_tax: 'other_taxes',
  other_taxes: 'other_taxes',
  fgts_charge: 'fgts',
  salary: 'salaries',
  pro_labore: 'pro_labore',
  profit_distribution: 'distributions',
  operating_expense: 'operating_expense',
  personal_expense_in_pj: 'personal_in_pj',
  bank_fee: 'bank_fees',
  deductible_health: 'health',
  deductible_education: 'education',
  pgbl_pension: 'pension',
  unclassified: 'unclassified',
};

/**
 * Labels that split a Category (`Category:label` rows of the group table). The split applies only while the row still
 * has the category that label gives: an answer that moved it (e.g. a refund credit the user called revenue) wins.
 */
const BY_LABEL: Readonly<Record<string, { category: Category; group: FinancialGroupId }>> = {
  loan_received: { category: 'unclassified', group: 'loans' },
  partner_contribution: { category: 'same_holder_transfer', group: 'partner_contribution' },
  own_account: { category: 'same_holder_transfer', group: 'internal_transfer' },
  reversal_credit: { category: 'unclassified', group: 'reversal' },
  dctfweb: { category: 'darf_tax', group: 'payroll_taxes' },
  darf_irrf_employment: { category: 'darf_tax', group: 'payroll_taxes' },
  darf_irrf_dividends: { category: 'darf_tax', group: 'dividend_irrf' },
  carne_leao: { category: 'darf_tax', group: 'carne_leao' },
  non_deductible: { category: 'unclassified', group: 'personal' },
};

/** The display group of one classification (ARCHITECTURE §4.4 group table). */
export function groupOf(c: Classification | undefined): FinancialGroupId {
  if (c === undefined || c.status === 'unclassified') return 'unclassified';
  if (c.origin !== 'llm' && c.ruleId !== undefined) {
    const split = BY_LABEL[c.ruleId];
    if (split !== undefined && split.category === c.category) return split.group;
  }
  return BY_CATEGORY[c.category];
}

// ---------- Seal table (ENGINE-SPEC E.9.2; fixed, reviewed by the engine reviewer) ----------

const SEAL_ORDER: readonly TaxSealKind[] = [
  'money_to_receive',
  'lower_tax',
  'deductible',
  'generates_credit',
  'attention',
  'risk',
];

const isLowerTax = (f: FinancialViewFinding) => f.type === 'savings' && f.countsInTotal;
const hasIrpfRefund = (f: FinancialViewFinding) =>
  (f.howToReceive ?? []).some((h) => h.method === 'irpf_refund');

interface SealRow {
  groups: readonly FinancialGroupId[];
  kind: TaxSealKind;
  ruleIds: readonly string[];
  when: (f: FinancialViewFinding) => boolean;
}

/** E.9.2, row by row. `generates_credit` has no row: no P0 rule emits it (D27). */
export const SEAL_TABLE: readonly SealRow[] = [
  {
    groups: ['das'],
    kind: 'money_to_receive',
    ruleIds: ['R05-REC', 'R06-REC'],
    when: (f) => f.type === 'recovery',
  },
  { groups: ['das'], kind: 'lower_tax', ruleIds: ['R01', 'R05', 'R06'], when: isLowerTax },
  { groups: ['export_revenue'], kind: 'lower_tax', ruleIds: ['R05'], when: isLowerTax },
  { groups: ['sales_revenue'], kind: 'lower_tax', ruleIds: ['R06'], when: isLowerTax },
  { groups: ['pro_labore'], kind: 'lower_tax', ruleIds: ['R01'], when: isLowerTax },
  {
    groups: ['pro_labore', 'holder_transfer'],
    kind: 'risk',
    ruleIds: ['A02'],
    when: (f) => f.type === 'risk',
  },
  {
    groups: ['distributions'],
    kind: 'attention',
    ruleIds: ['R02'],
    when: (f) => f.type === 'alert',
  },
  // D29: the 10% withheld comes back in the IRPF return when the year's income is below R$ 600 mil.
  {
    groups: ['dividend_irrf'],
    kind: 'money_to_receive',
    ruleIds: ['R02'],
    when: (f) => f.type === 'alert' && hasIrpfRefund(f),
  },
  {
    groups: ['dividend_irrf'],
    kind: 'attention',
    ruleIds: ['R02'],
    when: (f) => f.type === 'alert' && !hasIrpfRefund(f),
  },
  { groups: ['personal_in_pj'], kind: 'risk', ruleIds: ['A01'], when: (f) => f.type === 'risk' },
  {
    groups: ['export_revenue', 'service_revenue', 'sales_revenue'],
    kind: 'attention',
    ruleIds: ['R03'],
    when: (f) => f.type === 'alert',
  },
  {
    groups: ['health', 'pension'],
    kind: 'lower_tax',
    ruleIds: ['R04'],
    when: (f) => isLowerTax(f) && f.marginalValue12m > 0,
  },
];

/** E.6 deductions: the label (and status) that makes a row deductible, and the parameter whose ref is cited. */
const DEDUCTIBLE: Partial<
  Record<FinancialGroupId, { key: ParameterKey; qualifies: (c: Classification) => boolean }>
> = {
  health: {
    key: 'irpf.annual.health',
    qualifies: (c) =>
      c.category === 'deductible_health' &&
      ((c.ruleId === 'deductible_health' && settled(c)) ||
        (c.ruleId === 'health_to_confirm' && c.status === 'confirmed' && c.origin === 'user')),
  },
  education: {
    key: 'irpf.annual.education',
    qualifies: (c) =>
      c.category === 'deductible_education' && c.ruleId === 'deductible_education' && settled(c),
  },
  pension: {
    key: 'irpf.pgbl.limit',
    qualifies: (c) =>
      c.category === 'pgbl_pension' &&
      c.ruleId === 'pgbl' &&
      c.status === 'confirmed' &&
      c.origin === 'user',
  },
};

/** E.9.2 condition (1): applied or confirmed, by a rule or by the user. Never an LLM guess, never pending. */
const settled = (c: Classification): boolean =>
  (c.status === 'applied' || c.status === 'confirmed') && c.origin !== 'llm';

function deductionRef(key: ParameterKey, month: YearMonth): LegalRef | undefined {
  try {
    return legalRefOf({ key, effectiveFrom: param(key, month).effectiveFrom });
  } catch {
    return undefined; // no parameter in force for that month: no citation, so no seal
  }
}

function sealsOf(
  groupId: FinancialGroupId,
  rows: readonly Classification[],
  findings: readonly FinancialViewFinding[],
  referenceMonth: YearMonth,
): TaxSeal[] {
  if (!rows.some(settled)) return [];
  const seals = new Map<TaxSealKind, TaxSeal>();
  for (const row of SEAL_TABLE) {
    if (!row.groups.includes(groupId) || seals.has(row.kind)) continue;
    const linked = findings
      .filter((f) => row.ruleIds.includes(f.ruleId) && row.when(f))
      .sort((a, b) => a.order - b.order);
    // E.9.2: the citation is refs[0] of the first finding by order; no ref there, no seal (never a borrowed one).
    const ref = linked[0]?.refs[0];
    if (ref === undefined) continue;
    seals.set(row.kind, { kind: row.kind, ruleIds: linked.map((f) => f.ruleId), ref });
  }
  const deduction = DEDUCTIBLE[groupId];
  if (deduction !== undefined && rows.some(deduction.qualifies)) {
    const ref = deductionRef(deduction.key, referenceMonth);
    if (ref !== undefined) seals.set('deductible', { kind: 'deductible', ruleIds: [], ref });
  }
  return SEAL_ORDER.flatMap((k) => {
    const s = seals.get(k);
    return s === undefined ? [] : [s];
  });
}

// ---------- Detectors (ARCHITECTURE §4.4; reuse classify/identity.ts) ----------

const TAX_GROUPS: ReadonlySet<FinancialGroupId> = new Set([
  'das',
  'payroll_taxes',
  'dividend_irrf',
  'carne_leao',
  'other_taxes',
]);

/** Not subscriptions: taxes, payroll, the owner's money and transfers between own accounts. */
const NOT_RECURRING: ReadonlySet<FinancialGroupId> = new Set([
  ...TAX_GROUPS,
  'fgts',
  'salaries',
  'pro_labore',
  'distributions',
  'holder_transfer',
  'internal_transfer',
]);

const OWN_TRANSFERS: ReadonlySet<FinancialGroupId> = new Set([
  'holder_transfer',
  'internal_transfer',
]);

const RECURRING_TOLERANCE = 0.02; // E.2 "stable amount" (±2%)
const DUPLICATE_WINDOW_DAYS = 3;
const TOP_OUTFLOWS = 5;
const TOP_HIGHLIGHTS = 3;

interface Row {
  tx: NormalizedTransaction;
  c: Classification | undefined;
  groupId: FinancialGroupId;
}

const byDateThenId = (a: NormalizedTransaction, b: NormalizedTransaction) =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/**
 * CNPJ → counterparty name; CPF → "Pessoa física · <mask>"; card → description (the merchant); otherwise the
 * description with documents and person names redacted (ARCHITECTURE §6.3).
 */
function counterpartyLabel(tx: NormalizedTransaction): string {
  const doc = tx.counterparty?.document;
  if (doc?.type === 'CNPJ' && tx.counterparty?.name) return tx.counterparty.name;
  if (doc?.type === 'CPF') return `Pessoa física · ${doc.mask}`;
  if (tx.method === 'CARD') return redactDescription(tx.description);
  return redactDescription(tx.description, tx.counterparty ?? undefined);
}

function chargeRow(
  key: string,
  groupId: FinancialGroupId,
  label: string,
  txs: readonly NormalizedTransaction[],
): ChargeRow {
  const sorted = [...txs].sort(byDateThenId);
  const first = sorted[0] as NormalizedTransaction;
  const last = sorted.at(-1) as NormalizedTransaction;
  return {
    key,
    groupId,
    label,
    holder: first.holder,
    amount: last.amountCents as Cents,
    occurrences: sorted.length,
    total: sumCents(sorted.map((t) => t.amountCents as Cents)),
    firstDate: first.date,
    lastDate: last.date,
    transactionIds: sorted.map((t) => t.id),
  };
}

/** Top 5 single outflows; a series with the same group and amount collapses into one row (× n). */
function biggestOutflows(outflows: readonly Row[]): ChargeRow[] {
  const series = new Map<string, Row[]>();
  for (const r of outflows) {
    const k = `${r.groupId}:${r.tx.amountCents}`;
    series.set(k, [...(series.get(k) ?? []), r]);
  }
  return [...series.values()]
    .map((rows) => {
      const keys = new Set(rows.map((r) => counterpartyKey(r.tx)));
      const one = keys.size === 1;
      const head = rows[0] as Row;
      const label = one ? counterpartyLabel(head.tx) : FINANCIAL_GROUPS[head.groupId].label;
      const key = `${head.groupId}:${one ? counterpartyKey(head.tx) : '*'}:${head.tx.amountCents}`;
      return chargeRow(
        key,
        head.groupId,
        label,
        rows.map((r) => r.tx),
      );
    })
    .sort(
      (a, b) =>
        b.amount - a.amount || b.total - a.total || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
    )
    .slice(0, TOP_OUTFLOWS);
}

/**
 * "Assinaturas e cobranças recorrentes": same counterparty key and amount ±2%, in ≥ 3 of the last 4 months (E.2).
 * Taxes, payroll, the owner's money, own transfers and installment purchases ("3 de 10") are not subscriptions.
 */
function recurring(outflows: readonly Row[], referenceMonth: YearMonth): ChargeRow[] {
  const byCounterparty = new Map<string, Row[]>();
  for (const r of outflows) {
    if (NOT_RECURRING.has(r.groupId) || r.tx.installment != null) continue;
    const k = `${r.groupId}:${counterpartyKey(r.tx)}`;
    byCounterparty.set(k, [...(byCounterparty.get(k) ?? []), r]);
  }
  const rows: ChargeRow[] = [];
  for (const [k, group] of byCounterparty) {
    const groupId = (group[0] as Row).groupId;
    for (const cluster of amountClusters(
      group.map((r) => r.tx),
      RECURRING_TOLERANCE,
    )) {
      if (!isRecurring(cluster, referenceMonth, RECURRING_TOLERANCE)) continue;
      const head = cluster[0] as NormalizedTransaction;
      rows.push(chargeRow(`${k}:${head.amountCents}`, groupId, counterpartyLabel(head), cluster));
    }
  }
  return rows.sort((a, b) => b.total - a.total || (a.key < b.key ? -1 : 1));
}

function fees(rows: readonly Row[]): HolderView['fees'] {
  const fee = rows.filter((r) => r.groupId === 'bank_fees' && r.tx.direction === 'outflow');
  const byCharge = new Map<string, NormalizedTransaction[]>();
  for (const r of fee) {
    const k = `bank_fees:${counterpartyKey(r.tx)}:${r.tx.amountCents}`;
    byCharge.set(k, [...(byCharge.get(k) ?? []), r.tx]);
  }
  return {
    total12m: sumCents(fee.map((r) => r.tx.amountCents as Cents)),
    rows: [...byCharge.entries()]
      .map(([k, txs]) =>
        chargeRow(k, 'bank_fees', counterpartyLabel(txs[0] as NormalizedTransaction), txs),
      )
      .sort((a, b) => b.total - a.total || (a.key < b.key ? -1 : 1)),
  };
}

/**
 * Duplicates (no seal, 16/11 Q6): (a) two or more tax payments of one group naming the same PA; (b) the same charge
 * (account, counterparty, amount) within 3 days, not an installment and not a transfer between own accounts.
 */
function duplicates(
  outflows: readonly Row[],
  openQuestions: ReadonlySet<string>,
): DuplicateSuspect[] {
  const out: DuplicateSuspect[] = [];
  const flagged = new Set<string>();
  const byGuide = new Map<string, Row[]>();
  for (const r of outflows) {
    if (!TAX_GROUPS.has(r.groupId)) continue;
    const m = RX_ACCRUAL.exec(r.tx.description);
    if (m === null) continue; // only a PA written in the description identifies the guide
    const k = `${r.groupId}:${m[2]}-${m[1]}`;
    byGuide.set(k, [...(byGuide.get(k) ?? []), r]);
  }
  for (const [k, rows] of byGuide) {
    if (rows.length < 2) continue;
    const txs = rows.map((r) => r.tx).sort(byDateThenId);
    const groupId = (rows[0] as Row).groupId;
    const pa = k.slice(groupId.length + 1);
    const questionId =
      groupId === 'das' && openQuestions.has(`das:${pa}`) ? `das:${pa}` : undefined;
    for (const t of txs) flagged.add(t.id);
    out.push({
      reason: 'same_guide_same_period',
      groupId,
      amount: (txs.at(-1) as NormalizedTransaction).amountCents as Cents,
      dates: txs.map((t) => t.date),
      transactionIds: txs.map((t) => t.id),
      ...(questionId === undefined ? {} : { questionId }),
    });
  }
  const byCharge = new Map<string, Row[]>();
  for (const r of outflows) {
    if (OWN_TRANSFERS.has(r.groupId) || flagged.has(r.tx.id) || r.tx.installment != null) continue;
    const k = `${r.tx.accountId}:${counterpartyKey(r.tx)}:${r.tx.amountCents}`;
    byCharge.set(k, [...(byCharge.get(k) ?? []), r]);
  }
  for (const rows of byCharge.values()) {
    const sorted = [...rows].sort((a, b) => byDateThenId(a.tx, b.tx));
    let run: Row[] = [];
    const flush = () => {
      if (run.length >= 2) {
        const head = run[0] as Row;
        out.push({
          reason: 'same_charge_within_3_days',
          groupId: head.groupId,
          amount: head.tx.amountCents as Cents,
          dates: run.map((r) => r.tx.date),
          transactionIds: run.map((r) => r.tx.id),
        });
      }
    };
    for (const r of sorted) {
      const head = run[0];
      if (head !== undefined && daysApart(head.tx.date, r.tx.date) <= DUPLICATE_WINDOW_DAYS) {
        run.push(r);
      } else {
        flush();
        run = [r];
      }
    }
    flush();
  }
  return out.sort(
    (a, b) =>
      ((a.dates[0] ?? '') < (b.dates[0] ?? '')
        ? -1
        : (a.dates[0] ?? '') > (b.dates[0] ?? '')
          ? 1
          : 0) || ((a.transactionIds[0] ?? '') < (b.transactionIds[0] ?? '') ? -1 : 1),
  );
}

// ---------- Assembly ----------

function monthSeries(rows: readonly Row[], months: readonly YearMonth[]): MonthValue[] {
  const by = new Map<YearMonth, number>();
  for (const r of rows) by.set(r.tx.month, (by.get(r.tx.month) ?? 0) + r.tx.amountCents);
  return months.map((month) => ({ month, cents: (by.get(month) ?? 0) as Cents }));
}

function groupLines(
  rows: readonly Row[],
  months: readonly YearMonth[],
  directionTotal: Cents,
  findings: readonly FinancialViewFinding[],
  referenceMonth: YearMonth,
): GroupLine[] {
  const byGroup = new Map<FinancialGroupId, Row[]>();
  for (const r of rows) byGroup.set(r.groupId, [...(byGroup.get(r.groupId) ?? []), r]);
  const lines: GroupLine[] = [];
  for (const [groupId, members] of byGroup) {
    const head = members[0] as Row;
    const byMonth = monthSeries(members, months);
    const lastMonth = (byMonth.at(-1) as MonthValue).cents;
    const previousMonth = (byMonth.at(-2) as MonthValue).cents;
    const total12m = sumCents(members.map((r) => r.tx.amountCents as Cents));
    const delta = lastMonth - previousMonth;
    const byOrigin = { rule: 0, llm: 0, user: 0 };
    for (const r of members) if (r.c !== undefined) byOrigin[r.c.origin] += 1;
    const classifications = members.flatMap((r) => (r.c === undefined ? [] : [r.c]));
    lines.push({
      groupId,
      slug: FINANCIAL_GROUPS[groupId].slug,
      label: FINANCIAL_GROUPS[groupId].label,
      holder: head.tx.holder,
      direction: head.tx.direction,
      total12m,
      count: members.length,
      byMonth,
      lastMonth,
      previousMonth,
      deltaCents: delta,
      deltaBps: ratioBps(delta, previousMonth),
      shareBps: ratioBps(total12m, directionTotal) ?? 0,
      seals: sealsOf(groupId, classifications, findings, referenceMonth),
      pending: classifications.filter((c) => c.status === 'pending_confirmation').length,
      byOrigin,
      transactionIds: [...members].sort((a, b) => byDateThenId(a.tx, b.tx)).map((r) => r.tx.id),
    });
  }
  return lines.sort((a, b) => b.total12m - a.total12m || (a.groupId < b.groupId ? -1 : 1));
}

function highlights(
  monthly: HolderView['monthly'],
  outflowGroups: readonly GroupLine[],
): MonthHighlight[] {
  const out: MonthHighlight[] = [];
  for (let i = 1; i < monthly.length; i += 1) {
    const cur = monthly[i] as HolderView['monthly'][number];
    const prev = monthly[i - 1] as HolderView['monthly'][number];
    const delta = cur.outflow - prev.outflow;
    if (delta <= 0) continue;
    let driver: MonthHighlight['driver'] | undefined;
    for (const g of outflowGroups) {
      const d = (g.byMonth[i]?.cents ?? 0) - (g.byMonth[i - 1]?.cents ?? 0);
      if (driver === undefined || d > driver.deltaCents)
        driver = { groupId: g.groupId, deltaCents: d };
    }
    if (driver !== undefined) out.push({ month: cur.month, deltaCents: delta, driver });
  }
  return out
    .sort((a, b) => b.deltaCents - a.deltaCents || (a.month < b.month ? -1 : 1))
    .slice(0, TOP_HIGHLIGHTS);
}

/** [D31] The tiles per account, largest outflow first; an account the input does not name gets "Conta n". */
function accountLines(rows: readonly Row[], named: readonly FinancialViewAccount[]): AccountLine[] {
  const byAccount = new Map<string, Row[]>();
  for (const r of rows)
    byAccount.set(r.tx.accountId, [...(byAccount.get(r.tx.accountId) ?? []), r]);
  const sum = (list: readonly Row[]) => sumCents(list.map((r) => r.tx.amountCents as Cents));
  const lines = [...byAccount.entries()].map(([accountId, list]) => {
    const inn = list.filter((r) => r.tx.direction === 'inflow');
    const out = list.filter((r) => r.tx.direction === 'outflow');
    return {
      accountId,
      label: named.find((a) => a.id === accountId)?.label ?? '',
      inflow12m: sum(inn),
      outflow12m: sum(out),
      internalIn: sum(inn.filter((r) => r.groupId === 'internal_transfer')),
      internalOut: sum(out.filter((r) => r.groupId === 'internal_transfer')),
      count: list.length,
    };
  });
  lines.sort(
    (a, b) =>
      b.outflow12m - a.outflow12m ||
      b.inflow12m - a.inflow12m ||
      (a.accountId < b.accountId ? -1 : 1),
  );
  return lines.map((l, i) => (l.label === '' ? { ...l, label: `Conta ${i + 1}` } : l));
}

/**
 * [D31] What the owner may remove from a duplicate suspect: every occurrence but the first (the payment that
 * stays). Pure, so /demo (client state) and /app (persisted, E14) exclude the same ids.
 */
export function duplicateRemovals(suspect: DuplicateSuspect): string[] {
  return suspect.transactionIds.slice(1);
}

// ---------- D43: the card-bill payment ----------

/** Pluggy's transaction category for paying a card bill (its taxonomy names categories in English). */
const CARD_BILL_CATEGORY = /^credit card payment$/i;
/** "PAGAMENTO FATURA", "PAG FATURA CARTAO", "PGTO FATURA", "PAGTO DA FATURA" (normalized, E.1.5). Not "FATURAMENTO". */
const RX_CARD_BILL = /\b(?:PAGAMENTO|PAGTO|PGTO|PAG)\.? (?:DA |DE |DO )?FATURA\b/u;
/** On the card account itself: the bill payment credited ("PAGAMENTO RECEBIDO"). */
const RX_CARD_BILL_CREDIT = /\bPAGAMENTO RECEBIDO\b/u;

/**
 * Conservative (D43): only when the same holder has a connected credit-card account, and only a clear bill payment:
 * an outflow from a non-card account, not a card purchase, with Pluggy's category or a bill-payment description; or,
 * on the card account, the inflow that is that payment arriving. Anything else stays where it is.
 */
function isCardBillPayment(
  t: NormalizedTransaction,
  cardAccounts: ReadonlySet<string>,
  cardHolders: ReadonlySet<'PF' | 'PJ'>,
): boolean {
  if (!cardHolders.has(t.holder) || t.method === 'CARD') return false;
  const named = CARD_BILL_CATEGORY.test(t.sourceCategory ?? '') || RX_CARD_BILL.test(t.description);
  if (cardAccounts.has(t.accountId))
    return t.direction === 'inflow' && (named || RX_CARD_BILL_CREDIT.test(t.description));
  return t.direction === 'outflow' && named;
}

function holderView(
  holder: 'PF' | 'PJ',
  rows: readonly Row[],
  cardBills: readonly Row[],
  months: readonly YearMonth[],
  input: FinancialViewInput,
  openQuestions: ReadonlySet<string>,
): HolderView {
  const billSum = (direction: 'inflow' | 'outflow') =>
    sumCents(
      cardBills.filter((r) => r.tx.direction === direction).map((r) => r.tx.amountCents as Cents),
    );
  const inflows = rows.filter((r) => r.tx.direction === 'inflow');
  const outflows = rows.filter((r) => r.tx.direction === 'outflow');
  const inflow12m = sumCents(inflows.map((r) => r.tx.amountCents as Cents));
  const outflow12m = sumCents(outflows.map((r) => r.tx.amountCents as Cents));
  const inSeries = monthSeries(inflows, months);
  const outSeries = monthSeries(outflows, months);
  const monthly = months.map((month, i) => ({
    month,
    inflow: (inSeries[i] as MonthValue).cents,
    outflow: (outSeries[i] as MonthValue).cents,
  }));
  const inGroups = groupLines(inflows, months, inflow12m, input.findings, input.referenceMonth);
  const outGroups = groupLines(outflows, months, outflow12m, input.findings, input.referenceMonth);
  // One group can have lines in both directions (e.g. "Entre você e a empresa"): the anchors must stay unique per
  // holder, so a colliding slug gets its direction (#grupo-<slug>-entradas / -saidas).
  const both = new Set(
    inGroups.filter((g) => outGroups.some((o) => o.groupId === g.groupId)).map((g) => g.groupId),
  );
  for (const g of [...inGroups, ...outGroups]) {
    if (both.has(g.groupId))
      g.slug = `${g.slug}-${g.direction === 'inflow' ? 'entradas' : 'saidas'}`;
  }
  const last = monthly.at(-1) as HolderView['monthly'][number];
  const prev = monthly.at(-2) as HolderView['monthly'][number];
  return {
    holder,
    inflow12m,
    outflow12m,
    monthly,
    groups: [...inGroups, ...outGroups],
    biggestOutflows: biggestOutflows(outflows),
    recurring: recurring(outflows, input.referenceMonth),
    fees: fees(rows),
    duplicates: duplicates(outflows, openQuestions),
    highlights: highlights(monthly, outGroups),
    accounts: accountLines(rows, input.accounts ?? []),
    internalTransfers: {
      inflow: sumCents(
        inflows
          .filter((r) => r.groupId === 'internal_transfer')
          .map((r) => r.tx.amountCents as Cents),
      ),
      outflow: sumCents(
        outflows
          .filter((r) => r.groupId === 'internal_transfer')
          .map((r) => r.tx.amountCents as Cents),
      ),
    },
    cardBillPayments: {
      outflow: billSum('outflow'),
      inflow: billSum('inflow'),
      transactionIds: [...cardBills].sort((a, b) => byDateThenId(a.tx, b.tx)).map((r) => r.tx.id),
    },
    outflowChange: {
      month: last.month,
      cents: last.outflow,
      previousMonth: prev.month,
      previousCents: prev.outflow,
      deltaCents: last.outflow - prev.outflow,
    },
  };
}

const YEAR_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function invalid(reason: string): Result<FinancialView, DomainError> {
  return {
    ok: false,
    error: {
      code: 'FINANCIAL_VIEW_INVALID_INPUT',
      message: 'Não conseguimos montar suas finanças com estes dados.',
      recoverable: false,
      detail: { reason },
    },
  };
}

/**
 * Pure and deterministic (ARCHITECTURE §4.4 "Financial view"). Only transactions of the 12 months ending at
 * `referenceMonth` enter. Error code: 'FINANCIAL_VIEW_INVALID_INPUT'.
 */
export function buildFinancialView(input: FinancialViewInput): Result<FinancialView, DomainError> {
  if (!YEAR_MONTH.test(input.referenceMonth)) return invalid('referenceMonth');
  const months = Array.from({ length: 12 }, (_, i) => addMonths(input.referenceMonth, i - 11));
  const window = new Set<string>(months);
  const seen = new Set<string>();
  for (const t of input.transactions) {
    if (seen.has(t.id)) return invalid('duplicate transaction id');
    seen.add(t.id);
    if (!Number.isSafeInteger(t.amountCents) || t.amountCents <= 0) return invalid('amountCents');
  }
  const byTx = new Map<string, Classification>();
  for (const c of input.classifications) {
    if (!seen.has(c.transactionId)) return invalid('classification without transaction');
    if (byTx.has(c.transactionId)) return invalid('two classifications for one transaction');
    byTx.set(c.transactionId, c);
  }
  const excludedIds = new Set(input.excludedTransactionIds ?? []);
  for (const id of excludedIds) if (!seen.has(id)) return invalid('exclusion without transaction');
  const rows: Row[] = input.transactions
    .filter((t) => window.has(t.month) && !excludedIds.has(t.id))
    .map((tx) => {
      const c = byTx.get(tx.id);
      return { tx, c, groupId: groupOf(c) };
    });
  const openQuestions = new Set(input.openQuestionIds ?? []);
  const cards = (input.accounts ?? []).filter((a) => a.type === 'CREDIT');
  const cardAccounts = new Set(cards.map((a) => a.id));
  const cardHolders = new Set(cards.map((a) => a.holder));
  const isBill = (r: Row) => isCardBillPayment(r.tx, cardAccounts, cardHolders);
  const viewOf = (holder: 'PF' | 'PJ'): HolderView | null => {
    if (!input.transactions.some((t) => t.holder === holder)) return null;
    const own = rows.filter((r) => r.tx.holder === holder);
    return holderView(
      holder,
      own.filter((r) => !isBill(r)),
      own.filter(isBill),
      months,
      input,
      openQuestions,
    );
  };
  return {
    ok: true,
    value: {
      referenceMonth: input.referenceMonth,
      months,
      basis: 'cash',
      pj: viewOf('PJ'),
      pf: viewOf('PF'),
      excluded: input.transactions
        .filter((t) => excludedIds.has(t.id))
        .sort(byDateThenId)
        .map((t) => ({
          transactionId: t.id,
          holder: t.holder,
          accountId: t.accountId,
          date: t.date,
          amount: t.amountCents as Cents,
          groupId: groupOf(byTx.get(t.id)),
          label: counterpartyLabel(t),
        })),
    },
  };
}

/**
 * The view of a finished run: the transactions are normalized exactly as the run did, the classifications, findings
 * and open cards come from its result. `/demo` calls this at build time; the live app builds the input from the
 * database instead (`listAnalysisLedger`).
 */
export function financialViewOfRun(
  input: Pick<AnalysisInput, 'accounts' | 'company' | 'referenceMonth'> & {
    transactions: readonly SourceTransaction[];
  },
  result: Pick<PipelineResult, 'classifications' | 'engineResult' | 'questions'>,
  excludedTransactionIds: readonly string[] = [],
): Result<FinancialView, DomainError> {
  return buildFinancialView({
    accounts: input.accounts.map((a) => ({
      id: a.sourceId,
      holder: a.holder,
      label: `${a.institution} · ${a.productName}`,
      type: a.type,
    })),
    excludedTransactionIds,
    referenceMonth: input.referenceMonth,
    regime: regimeOf(input.company),
    transactions: normalizeTransactions(input.accounts, input.transactions),
    classifications: result.classifications,
    findings: result.engineResult?.findings ?? [],
    openQuestionIds: result.questions.map((q) => q.id),
  });
}
