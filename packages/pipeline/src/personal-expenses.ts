// Input of alert A01 (ENGINE-SPEC D.7; ARCHITECTURE §4.2 `Facts.personalExpensesInPj`): PJ outflows that E.7
// classified as personal. The merchant is shown in the trace, so it is never copied from the statement: it is a
// label from a closed vocabulary (the E.7 keyword or MCC that fired), which by construction carries no person's name
// and no EI/MEI legal name (ARCHITECTURE §6.1 "allow explicitly"; CLAUDE.md rule 4).
import type { Facts, PersonalExpense } from '@refund/engine';
import { isRegularSchool } from './classify/cnae.ts';
import type { Classified } from './classify/index.ts';
import { PERSONAL_MCC, PHARMACY_MCC, RX_PERSONAL } from './classify/regex.ts';
import type { NormalizedTransaction } from './types.ts';

/** E.7 keyword → the label shown. Brands only (companies); the regex alternatives are the whole list. */
const KEYWORD_LABEL: Readonly<Record<string, string>> = {
  'SMART FIT': 'SMART FIT',
  SMARTFIT: 'SMART FIT',
};

const MCC_LABEL: Readonly<Record<string, string>> = {
  '5411': 'SUPERMERCADO',
  '4899': 'STREAMING OU CONTEÚDO DIGITAL',
  '5815': 'STREAMING OU CONTEÚDO DIGITAL',
  '5816': 'STREAMING OU CONTEÚDO DIGITAL',
  '5817': 'STREAMING OU CONTEÚDO DIGITAL',
  '5818': 'STREAMING OU CONTEÚDO DIGITAL',
  '7997': 'CLUBE OU ACADEMIA',
  '8211': 'ESCOLA',
  '8220': 'ESCOLA',
  [PHARMACY_MCC]: 'FARMÁCIA',
};

export const PERSON_PAYEE_LABEL = 'PAGAMENTO A PESSOA FÍSICA';
export const OTHER_PERSONAL_LABEL = 'OUTRO GASTO PESSOAL';

/** The trace label of one personal PJ outflow: E.7 keyword, else MCC, else school CNAE, else a generic label. */
export function personalMerchant(t: NormalizedTransaction): string {
  // A payment to a CPF: whatever the description says, it names a person. Never echo it.
  if (t.counterparty?.document?.type === 'CPF') return PERSON_PAYEE_LABEL;
  const keyword = RX_PERSONAL.exec(t.description)?.[1];
  if (keyword !== undefined) {
    if (keyword.startsWith('SUPERMERC')) return 'SUPERMERCADO';
    return KEYWORD_LABEL[keyword] ?? keyword;
  }
  if (t.mcc !== null && (PERSONAL_MCC.has(t.mcc) || t.mcc === PHARMACY_MCC)) {
    return MCC_LABEL[t.mcc] ?? OTHER_PERSONAL_LABEL;
  }
  if (t.counterparty?.document?.type === 'CNPJ' && isRegularSchool(t.counterparty.cnae))
    return 'ESCOLA';
  return OTHER_PERSONAL_LABEL;
}

/**
 * Which classifications feed A01: category `personal_expense_in_pj` on a PJ outflow, decided by an E.7 rule
 * (`applied`) or by the user (`confirmed`). An LLM guess on this category is always a card (FEEDS_FINDING) and
 * never feeds A01 before the user confirms it (D.7: "classified as personal by E.7"; E.9.2: never `llm`).
 */
export function feedsA01(c: Classified): boolean {
  const { category, status, origin } = c.classification;
  return (
    category === 'personal_expense_in_pj' &&
    c.tx.holder === 'PJ' &&
    c.tx.direction === 'outflow' &&
    ((origin === 'rule' && status === 'applied') || (origin === 'user' && status === 'confirmed'))
  );
}

/**
 * D.7: only SIMPLES and MEI ("No Simples, despesa da empresa não reduz imposto"; EXECUTION §9, 15/11 A01 row).
 * Absent (undefined) when the regime is another one or no transaction qualifies.
 */
export function personalExpensesFact(
  classified: readonly Classified[],
  regime: Facts['company']['value']['regime'],
  window: ReadonlySet<string>,
): Facts['personalExpensesInPj'] {
  if (regime !== 'SIMPLES' && regime !== 'MEI') return undefined;
  const list = classified.filter((c) => window.has(c.tx.month) && feedsA01(c));
  if (list.length === 0) return undefined;
  const value: PersonalExpense[] = list.map((c) => ({
    transactionId: c.tx.id,
    month: c.tx.month,
    amount: c.tx.amountCents as PersonalExpense['amount'],
    merchant: personalMerchant(c.tx),
  }));
  return {
    value,
    provenance: {
      origin: 'open_finance',
      source: 'E.7: personal expense in the PJ account or card',
      transactionIds: list.map((c) => c.tx.id),
    },
  };
}
