// Classification step 1: deterministic rules (ENGINE-SPEC E.2, E.3, E.6, E.7). Confidence comes from the rule
// type, never from a model (E.1.2). Whatever no rule resolves is left for the LlmPort (step 2).
import { addMonths, type YearMonth } from '@refund/engine';
import type { Category, NormalizedTransaction } from '../types.ts';
import { deductionClass, isHealthCompany, isRegularSchool } from './cnae.ts';
import {
  amountClusters,
  counterpartyKey,
  documentKey,
  type HolderIdentity,
  isCpfCounterparty,
  isRecurring,
  lastMonths,
  pairSameHolder,
  sameCpf,
} from './identity.ts';
import {
  accrualMonth,
  darfCode,
  PERSONAL_MCC,
  PHARMACY_MCC,
  RX_DAS,
  RX_DAS_MEI,
  RX_DCTFWEB,
  RX_FGTS,
  RX_FX,
  RX_FX_PLATFORMS,
  RX_GPS,
  RX_JCP,
  RX_LOAN,
  RX_PENSION,
  RX_PERSONAL,
  RX_REVERSAL,
} from './regex.ts';

/** ENGINE-SPEC E.2/E.3 labels (what E.8 accuracy is measured on), plus the pipeline's own deterministic ids. */
export type Label =
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
  | 'pgbl'
  // not in E.3 (no tax label): the PF leg of a same-holder transfer, a holder transfer not yet qualified,
  // interest on equity (T02-11) and bank fees.
  | 'same_holder'
  | 'holder_transfer'
  | 'jcp'
  | 'bank_fee'
  // E9 review: a transfer between two accounts of the company itself (H1a) and a refund/redemption credit (H1b).
  | 'own_account'
  | 'reversal_credit';

/** Cards of E.2/E.3 (stable ids: the next run reuses the answer). */
export const CARD = {
  proLaboreGross: 'pro-labore-gross',
  distribution: 'monthly-distribution',
  payrollGross: 'clt-payroll-gross',
  export: 'export-qualification',
  worksInCompany: 'partner-works-in-company',
  bookkeeping: 'full-bookkeeping',
  employee: (k: string) => `clt-employee:${k}`,
  partnerTransfer: (k: string) => `partner-transfer:${k}`,
  health: (k: string) => `health:${k}`,
  education: (k: string) => `education:${k}`,
  pgbl: (k: string) => `pgbl:${k}`,
  revenue: (k: string) => `revenue:${k}`,
  contribution: (k: string) => `contribution:${k}`,
  llm: (category: Category, k: string) => `llm:${category}:${k}`,
  reversal: (k: string) => `reversal:${k}`,
  /** Two or more DAS for the same PA (E9 review H3): which one is the DAS? */
  das: (pa: YearMonth) => `das:${pa}`,
} as const;

export interface RuleHit {
  label: Label;
  category: Category;
  confidence: number;
  /** The card that confirms it; null = applies directly (E.3 "Confirmation: no"). */
  cardId: string | null;
  reason: string;
  /** The category a "yes" on the card gives when the suggestion is undecided (`unclassified`). */
  confirmAs?: Category;
}

export interface RuleContext {
  identity: HolderIdentity;
  primaryCnae: string;
  /** 'sales_revenue' for commerce (Anexo I/II), 'service_revenue' otherwise. */
  revenueCategory: 'service_revenue' | 'sales_revenue';
  referenceMonth: YearMonth;
}

const hit = (
  label: Label,
  category: Category,
  confidence: number,
  reason: string,
  cardId: string | null = null,
): RuleHit => ({ label, category, confidence, cardId, reason });

/** A PIX/TED/DOC to a counterparty the bank identified is a payment to someone, never a tax guide. */
const toIdentifiedPayee = (t: NormalizedTransaction): boolean =>
  TRANSFER_METHODS.has(t.method) && t.counterparty?.document != null;

const TRANSFER_METHODS = new Set(['PIX', 'TED', 'DOC']);
const RECEIPT_METHODS = new Set(['PIX', 'TED', 'DOC', 'BOLETO']);

function taxPayment(t: NormalizedTransaction): RuleHit | null {
  const d = t.description;
  if (RX_DAS_MEI.test(d)) return hit('das_mei', 'das_tax', 0.98, 'DAS do MEI');
  if (t.holder === 'PJ') {
    // E9 review H3: "DAS" is also a Portuguese article ("REI DAS COXINHAS", "MARIA DAS GRACAS").
    if (RX_DAS.test(d) && t.method !== 'CARD' && !toIdentifiedPayee(t))
      return hit('das_simples', 'das_tax', 0.98, 'DAS do Simples Nacional');
    if (darfCode(d, '1841'))
      return hit('darf_irrf_dividends', 'darf_tax', 0.97, 'DARF 1841: IRRF sobre lucros');
    if (darfCode(d, '0561') || darfCode(d, '0588'))
      return hit(
        'darf_irrf_employment',
        'darf_tax',
        0.95,
        'DARF de IRRF sobre salário ou pró-labore',
      );
    if (RX_DCTFWEB.test(d))
      return hit('dctfweb', 'darf_tax', 0.95, 'DARF da DCTFWeb (INSS e IRRF da folha)');
    if (RX_FGTS.test(d)) return hit('fgts', 'fgts_charge', 0.98, 'Guia do FGTS');
  } else if (darfCode(d, '0190')) {
    return hit('carne_leao', 'darf_tax', 0.97, 'DARF 0190: carnê-leão');
  }
  // E.3: GPS only as a boleto ("GPS TRACKER LTDA" by card or Pix is not INSS), never the DCTFWeb DARF.
  if (RX_GPS.test(d) && !RX_DCTFWEB.test(d) && t.method === 'BOLETO') {
    return hit('gps_inss', 'inss_charge', 0.9, 'Guia da Previdência Social (INSS)');
  }
  return null;
}

/** E.7 high signal, PJ account or card. */
function personalInPj(t: NormalizedTransaction, primaryCnae: string): RuleHit | null {
  const personal = hit(
    'personal_in_pj',
    'personal_expense_in_pj',
    0.9,
    'Gasto pessoal pago pela empresa',
  );
  if (t.mcc !== null && PERSONAL_MCC.has(t.mcc)) return personal;
  if (t.mcc === PHARMACY_MCC && !isHealthCompany(primaryCnae)) return personal;
  if (RX_PERSONAL.test(t.description)) return personal;
  if (
    (t.method === 'BOLETO' || t.method === 'PIX') &&
    t.counterparty?.document?.type === 'CNPJ' &&
    isRegularSchool(t.counterparty.cnae)
  ) {
    return personal;
  }
  return null;
}

function pfDeduction(t: NormalizedTransaction): RuleHit | null {
  const k = counterpartyKey(t);
  switch (deductionClass(t.counterparty?.cnae ?? null)) {
    case 'health_deductible':
      return hit(
        'deductible_health',
        'deductible_health',
        0.95,
        'Saúde dedutível (CNAE do recebedor)',
      );
    case 'health_confirm':
      return hit(
        'health_to_confirm',
        'deductible_health',
        0.9,
        'Pode ser saúde dedutível: precisa confirmar',
        CARD.health(k),
      );
    case 'education_deductible':
      return hit(
        'deductible_education',
        'deductible_education',
        0.9,
        'Educação dedutível (CNAE da escola)',
        CARD.education(k),
      );
    case 'not_deductible':
      // EXECUTION §9 (14/11, E3/E9): `Category` has no value for a PF non-deductible expense.
      return hit('non_deductible', 'unclassified', 0.95, 'Despesa pessoal que não deduz no IR');
    default:
      return null;
  }
}

/** Step 1 over every transaction. Returns the hits; transactions without a hit go to the LlmPort. */
export function applyRules(
  txs: readonly NormalizedTransaction[],
  ctx: RuleContext,
): Map<string, RuleHit> {
  const hits = new Map<string, RuleHit>();
  const byId = new Map(txs.map((t) => [t.id, t]));

  // E.2: same holder. Rule 1 (CPF HMAC) and rule 3 (PF leg with the company's CNPJ, same amount, ±1 day).
  const transfers = pairSameHolder(txs, ctx.identity, 'outflow');
  const contributions = pairSameHolder(txs, ctx.identity, 'inflow');
  for (const pairs of [transfers, contributions]) {
    for (const pfId of pairs.values()) {
      hits.set(
        pfId,
        hit('same_holder', 'same_holder_transfer', 0.99, 'Transferência entre a empresa e o sócio'),
      );
    }
  }
  const toHolder = txs.filter(
    (t) =>
      t.holder === 'PJ' &&
      t.direction === 'outflow' &&
      (transfers.has(t.id) || sameCpf(t, ctx.identity)),
  );
  const toHolderIds = new Set(toHolder.map((t) => t.id));

  for (const t of txs) {
    if (hits.has(t.id) || toHolderIds.has(t.id)) continue;
    const h = single(t, ctx, contributions.has(t.id));
    if (h !== null) hits.set(t.id, h);
  }

  classifyHolderTransfers(toHolder, txs, byId, transfers, ctx, hits);
  classifyEmployees(txs, ctx, hits);
  classifyRecurringPfPix(txs, ctx, hits);
  flagLargeDomesticRevenue(txs, hits);
  flagDuplicateDas(txs, hits);
  return hits;
}

/** E9 review H1a: the company's own account at another bank (counterparty CNPJ = the company's). */
const isOwnAccount = (t: NormalizedTransaction, ctx: RuleContext): boolean =>
  t.holder === 'PJ' &&
  t.counterparty?.document?.type === 'CNPJ' &&
  documentKey(t.counterparty.document.publicValue) === ctx.identity.cnpj;

/**
 * D21 (PLAN §18, 15/11; E9 review H1b): refunds, returns, reimbursements and redemptions never count as revenue on
 * their own: a card asks "Isso foi receita da empresa?" with the category undecided ("yes" = revenue, "no" =
 * excluded) and they move no number until answered. Credits from the company's own CNPJ: `isOwnAccount`.
 */
export function reversalCredit(t: NormalizedTransaction, ctx: RuleContext): RuleHit | null {
  if (!RX_REVERSAL.test(t.description)) return null;
  return {
    ...hit(
      'reversal_credit',
      'unclassified',
      0.9,
      'Estorno, devolução ou resgate: é receita?',
      CARD.reversal(counterpartyKey(t)),
    ),
    confirmAs: ctx.revenueCategory,
  };
}

/** E9 review H3: two DAS for one PA are never silently merged or overwritten; a card asks which one. */
function flagDuplicateDas(txs: readonly NormalizedTransaction[], hits: Map<string, RuleHit>): void {
  const byPa = new Map<YearMonth, NormalizedTransaction[]>();
  for (const t of txs) {
    if (hits.get(t.id)?.label !== 'das_simples') continue;
    const pa = accrualMonth(t.description, t.month);
    byPa.set(pa, [...(byPa.get(pa) ?? []), t]);
  }
  for (const [pa, list] of byPa) {
    if (list.length < 2) continue;
    for (const t of list) {
      const h = hits.get(t.id);
      if (h !== undefined) hits.set(t.id, { ...h, cardId: CARD.das(pa) });
    }
  }
}

function single(t: NormalizedTransaction, ctx: RuleContext, fromHolder: boolean): RuleHit | null {
  const d = t.description;
  if (isOwnAccount(t, ctx)) {
    return hit(
      'own_account',
      'same_holder_transfer',
      0.99,
      'Transferência entre contas da própria empresa',
    );
  }
  if (t.direction === 'outflow') {
    const tax = taxPayment(t);
    if (tax !== null) return tax;
    if (t.holder === 'PJ') {
      const personal = personalInPj(t, ctx.primaryCnae);
      if (personal !== null) return personal;
    } else {
      if (RX_PENSION.test(d))
        return hit(
          'pgbl',
          'pgbl_pension',
          0.85,
          'Previdência privada: PGBL ou VGBL?',
          CARD.pgbl(counterpartyKey(t)),
        );
      const deduction = pfDeduction(t);
      if (deduction !== null) return deduction;
    }
    if (t.method === 'FEE') return hit('bank_fee', 'bank_fee', 0.95, 'Tarifa bancária');
    return null;
  }
  // Inflows.
  if (RX_LOAN.test(d)) {
    // EXECUTION §9 (E9): `Category` has no value for a loan; it stays outside revenue as 'unclassified'.
    return hit('loan_received', 'unclassified', 0.95, 'Empréstimo recebido (fora da receita)');
  }
  if (t.holder === 'PF') return null;
  const reversal = reversalCredit(t, ctx);
  if (reversal !== null) return reversal;
  if (fromHolder || sameCpf(t, ctx.identity)) {
    return hit(
      'partner_contribution',
      'same_holder_transfer',
      0.95,
      'Crédito vindo do sócio: aporte ou empréstimo?',
      CARD.contribution(counterpartyKey(t)),
    );
  }
  const payer = t.counterparty?.name ? t.counterparty.name.toUpperCase() : '';
  if (
    t.method === 'FX' ||
    RX_FX.test(d) ||
    RX_FX_PLATFORMS.test(d) ||
    RX_FX_PLATFORMS.test(payer)
  ) {
    return hit(
      'export_revenue',
      'export_revenue',
      0.9,
      'Recebimento do exterior (câmbio)',
      CARD.export,
    );
  }
  if (RECEIPT_METHODS.has(t.method) && t.counterparty?.document != null) {
    return hit('domestic_revenue', ctx.revenueCategory, 0.85, 'Recebimento de cliente no Brasil');
  }
  return null;
}

/**
 * E.2 pró-labore × distribution among PJ → holder transfers (always a card). The pró-labore candidate is the
 * recurring cluster (≥ 3 of the last 4 months, ±2%) with a DARF 0588/DCTFWeb in the same or next month; E.2 does not
 * say which one wins when two clusters recur (the hero's 1.442,69 and 18.000,00), so the smallest amount does
 * (EXECUTION §9, E9). Interest on equity (T02-11) is neither.
 */
function classifyHolderTransfers(
  toHolder: NormalizedTransaction[],
  all: readonly NormalizedTransaction[],
  byId: ReadonlyMap<string, NormalizedTransaction>,
  transfers: ReadonlyMap<string, string>,
  ctx: RuleContext,
  hits: Map<string, RuleHit>,
): void {
  const regular: NormalizedTransaction[] = [];
  for (const t of toHolder) {
    const pfLeg = byId.get(transfers.get(t.id) ?? '');
    if (RX_JCP.test(t.description) || (pfLeg !== undefined && RX_JCP.test(pfLeg.description))) {
      hits.set(
        t.id,
        hit('jcp', 'same_holder_transfer', 0.95, 'Juros sobre capital próprio não são dividendos'),
      );
      if (pfLeg !== undefined)
        hits.set(
          pfLeg.id,
          hit(
            'jcp',
            'same_holder_transfer',
            0.95,
            'Juros sobre capital próprio não são dividendos',
          ),
        );
    } else {
      regular.push(t);
    }
  }
  const payrollTaxMonths = new Set(
    all
      .filter(
        (t) =>
          t.holder === 'PJ' &&
          t.direction === 'outflow' &&
          (RX_DCTFWEB.test(t.description) || darfCode(t.description, '0588')),
      )
      .map((t) => t.month),
  );
  const withPayrollTax = (cluster: NormalizedTransaction[]) =>
    cluster.some(
      (t) => payrollTaxMonths.has(t.month) || payrollTaxMonths.has(addMonths(t.month, 1)),
    );
  // E9 review M1: the pró-labore follows the minimum wage, which changes every January, so the ±2% clusters are
  // built per calendar year. In the reference year the E.2 test applies (≥ 3 of the last 4 months); in an earlier
  // year of the window the cluster must be paid in ≥ min(3, months of that year in the window) months.
  const window = new Set(lastMonths(ctx.referenceMonth, 12));
  const referenceYear = ctx.referenceMonth.slice(0, 4);
  const proLabore = new Set<string>();
  for (const year of new Set(regular.map((t) => t.month.slice(0, 4)))) {
    const inYear = regular.filter((t) => t.month.startsWith(year));
    const monthsInWindow = [...window].filter((m) => m.startsWith(year)).length;
    const eligible = amountClusters(inYear, 0.02).filter((c) =>
      year === referenceYear
        ? isRecurring(c, ctx.referenceMonth, 0.02)
        : new Set(c.map((t) => t.month)).size >= Math.min(3, Math.max(1, monthsInWindow)),
    );
    const ranked = [...eligible].sort(
      (a, b) =>
        Number(withPayrollTax(b)) - Number(withPayrollTax(a)) ||
        (a[0]?.amountCents ?? 0) - (b[0]?.amountCents ?? 0),
    );
    for (const t of ranked[0] ?? []) proLabore.add(t.id);
  }
  for (const t of regular) {
    hits.set(
      t.id,
      proLabore.has(t.id)
        ? hit(
            'pro_labore',
            'pro_labore',
            0.99,
            'Transferência mensal ao sócio: pró-labore?',
            CARD.proLaboreGross,
          )
        : hit(
            'distribution',
            'profit_distribution',
            0.99,
            'Transferência ao sócio: distribuição de lucros?',
            CARD.distribution,
          ),
    );
  }
}

/**
 * E.2 CLT salary: PJ → CPF ≠ holder, recurring in ≥ 3 of the last 4 months (±10%), by Pix/TED. One card per person;
 * every payment to that person (13º, vacation) joins the same card. The net is not payroll (the gross comes from
 * the "folha bruta" card).
 */
function classifyEmployees(
  txs: readonly NormalizedTransaction[],
  ctx: RuleContext,
  hits: Map<string, RuleHit>,
): void {
  const byPerson = new Map<string, NormalizedTransaction[]>();
  for (const t of txs) {
    if (t.holder !== 'PJ' || t.direction !== 'outflow' || hits.has(t.id)) continue;
    if (!isCpfCounterparty(t) || !TRANSFER_METHODS.has(t.method)) continue;
    const k = counterpartyKey(t);
    byPerson.set(k, [...(byPerson.get(k) ?? []), t]);
  }
  for (const [k, list] of byPerson) {
    if (!isRecurring(list, ctx.referenceMonth, 0.1)) {
      // E.2: without an identity match, a transfer to a CPF may be the holder's: card.
      if (!ctx.identity.pfConnected && ctx.identity.cpfHmac === null) {
        for (const t of list) {
          hits.set(
            t.id,
            hit(
              'holder_transfer',
              'unclassified',
              0.5,
              'Transferência para pessoa: foi para você (sócio)?',
              CARD.partnerTransfer(k),
            ),
          );
        }
      }
      continue;
    }
    for (const t of list) {
      hits.set(
        t.id,
        hit(
          'salary',
          'salary',
          0.9,
          'Pagamento recorrente a pessoa: salário de empregado?',
          CARD.employee(k),
        ),
      );
    }
  }
}

/** E.3 `health_to_confirm`: a recurring Pix from the PF to a CPF (self-employed professional) is always a card. */
function classifyRecurringPfPix(
  txs: readonly NormalizedTransaction[],
  ctx: RuleContext,
  hits: Map<string, RuleHit>,
): void {
  const byPerson = new Map<string, NormalizedTransaction[]>();
  for (const t of txs) {
    if (t.holder !== 'PF' || t.direction !== 'outflow' || hits.has(t.id)) continue;
    if (!isCpfCounterparty(t) || t.method !== 'PIX') continue;
    const k = counterpartyKey(t);
    byPerson.set(k, [...(byPerson.get(k) ?? []), t]);
  }
  for (const [k, list] of byPerson) {
    if (!isRecurring(list, ctx.referenceMonth, null)) continue;
    for (const t of list) {
      hits.set(
        t.id,
        hit(
          'health_to_confirm',
          'deductible_health',
          0.9,
          'Pix recorrente a profissional: foi saúde?',
          CARD.health(k),
        ),
      );
    }
  }
}

/** E.3 `domestic_revenue`: a card only when one credit is > 20% of the month's revenue. */
function flagLargeDomesticRevenue(
  txs: readonly NormalizedTransaction[],
  hits: Map<string, RuleHit>,
): void {
  const monthRevenue = new Map<string, number>();
  const revenue = txs.filter((t) => {
    const label = hits.get(t.id)?.label;
    return label === 'domestic_revenue' || label === 'export_revenue';
  });
  for (const t of revenue)
    monthRevenue.set(t.month, (monthRevenue.get(t.month) ?? 0) + t.amountCents);
  for (const t of revenue) {
    const h = hits.get(t.id);
    if (h?.label !== 'domestic_revenue') continue;
    if (t.amountCents * 5 > (monthRevenue.get(t.month) ?? 0)) {
      hits.set(t.id, { ...h, cardId: CARD.revenue(counterpartyKey(t)) });
    }
  }
}
