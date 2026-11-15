// The classification cascade (ENGINE-SPEC E.1): rules → LlmPort (leftovers) → user (cards), then the user's
// answers and confirmations are applied. Confidence comes from the rule type; LLM output that feeds a finding is
// never applied directly (CLASSIFICATION_POLICY).
import type { Category, Classification, NormalizedTransaction, QuestionAnswer } from '../types.ts';
import { counterpartyKey } from './identity.ts';
import type { LlmVerdict } from './llm.ts';
import { CARD, type Label, type RuleHit } from './rules.ts';

export { allowedCategories, classifyWithLlm, FEEDS_FINDING, toLlmInput } from './llm.ts';
export { applyRules, CARD, type Label, type RuleContext, type RuleHit } from './rules.ts';

/** Answer detail some facts need (health beneficiary and profession, the enrolled person). */
export interface AnswerDetail {
  beneficiary?: 'holder' | 'dependent' | 'other';
  profession?: string;
  person?: string;
}

export interface Classified {
  tx: NormalizedTransaction;
  label: Label | null;
  cardId: string | null;
  classification: Classification;
  detail: AnswerDetail;
  /** What a "yes" gives when the rule left the category undecided (refund/redemption credits). */
  confirmAs?: Category;
}

export type AnswerValue = QuestionAnswer['value'];

export const isYes = (v: AnswerValue | undefined): boolean =>
  v === true || v === 'yes' || v === 'sim';
export const isNo = (v: AnswerValue | undefined): boolean =>
  v === false || v === 'no' || v === 'nao';

/** Merges the three steps for one transaction, before any answer. */
export function initial(
  tx: NormalizedTransaction,
  hit: RuleHit | undefined,
  verdict: LlmVerdict | undefined,
  llmConsulted: boolean,
): Classified {
  if (hit !== undefined) {
    return {
      tx,
      label: hit.label,
      cardId: hit.cardId,
      detail: {},
      ...(hit.confirmAs === undefined ? {} : { confirmAs: hit.confirmAs }),
      classification: {
        transactionId: tx.id,
        category: hit.category,
        confidence: hit.confidence,
        origin: 'rule',
        ruleId: hit.label,
        reason: hit.reason,
        status: hit.cardId === null ? 'applied' : 'pending_confirmation',
      },
    };
  }
  if (verdict !== undefined) {
    return {
      tx,
      label: null,
      cardId:
        verdict.status === 'pending_confirmation'
          ? CARD.llm(verdict.category, counterpartyKey(tx))
          : null,
      detail: {},
      classification: {
        transactionId: tx.id,
        category: verdict.category,
        confidence: verdict.confidence,
        origin: 'llm',
        reason: verdict.reason,
        status: verdict.status,
      },
    };
  }
  return {
    tx,
    label: null,
    cardId: null,
    detail: {},
    classification: {
      transactionId: tx.id,
      category: 'unclassified',
      confidence: 0,
      origin: llmConsulted ? 'llm' : 'rule',
      reason: 'Nenhuma regra reconheceu este lançamento',
      status: 'unclassified',
    },
  };
}

function decide(
  c: Classified,
  category: Category,
  status: 'confirmed' | 'rejected',
  reason: string,
): void {
  c.classification = {
    ...c.classification,
    category,
    status,
    origin: 'user',
    confidence: 1,
    reason,
  };
}

const BENEFICIARIES = new Set(['holder', 'dependent', 'other']);

/** Applies one card answer to the transactions of that card. Unknown values leave the card open. */
function applyAnswer(c: Classified, cardId: string, value: AnswerValue): boolean {
  const kind = cardId.split(':')[0];
  switch (kind) {
    case CARD.proLaboreGross:
      // E9 review M2: not pró-labore → the transfer still went to the holder: it joins the distribution card.
      if (isNo(value)) {
        c.cardId = CARD.distribution;
        c.label = 'distribution';
        c.classification = {
          ...c.classification,
          category: 'profit_distribution',
          ruleId: 'distribution',
          status: 'pending_confirmation',
          reason: 'Você disse que não é pró-labore: é distribuição de lucros?',
        };
      } else if (
        isYes(value) ||
        (typeof value === 'number' && Number.isSafeInteger(value) && value > 0)
      )
        decide(c, 'pro_labore', 'confirmed', 'Pró-labore confirmado por você');
      else return false;
      return true;
    case CARD.distribution:
    case 'revenue':
    case 'llm': {
      if (!isYes(value) && !isNo(value)) return false;
      const category = c.classification.category;
      if (isYes(value)) decide(c, category, 'confirmed', 'Confirmado por você');
      else decide(c, 'unclassified', 'rejected', 'Você disse que não é isso');
      return true;
    }
    case 'reversal':
      if (isYes(value))
        decide(c, c.confirmAs ?? 'service_revenue', 'confirmed', 'Receita, segundo você');
      else if (isNo(value))
        decide(c, 'unclassified', 'confirmed', 'Estorno, devolução ou resgate: não é receita');
      else return false;
      return true;
    case 'das':
      // E9 review H3: which payment is the DAS of this PA; 'all' = DAS plus a complementary DAS.
      if (value === 'all' || value === c.tx.id)
        decide(c, 'das_tax', 'confirmed', 'DAS confirmado por você');
      else if (typeof value === 'string' && value !== '')
        decide(c, 'unclassified', 'rejected', 'Não é o DAS deste período');
      else return false;
      return true;
    case 'partner-transfer':
      if (value === 'distribution')
        decide(c, 'profit_distribution', 'confirmed', 'Distribuição de lucros, segundo você');
      else if (value === 'pro_labore')
        decide(c, 'pro_labore', 'confirmed', 'Pró-labore, segundo você');
      else if (isNo(value)) decide(c, 'operating_expense', 'rejected', 'Não foi para você');
      else return false;
      return true;
    case 'clt-employee':
      if (isYes(value)) decide(c, 'salary', 'confirmed', 'Empregado com carteira, segundo você');
      else if (isNo(value))
        decide(c, 'operating_expense', 'rejected', 'Não é empregado com carteira');
      else return false;
      return true;
    case CARD.export:
      // Not qualified as export: still revenue, in the domestic market (R05 does not apply).
      if (isYes(value))
        decide(c, 'export_revenue', 'confirmed', 'Exportação de serviço confirmada por você');
      else if (isNo(value))
        decide(c, 'service_revenue', 'rejected', 'Receita do exterior que não é exportação');
      else return false;
      return true;
    case 'contribution':
      if (isYes(value))
        decide(c, 'same_holder_transfer', 'confirmed', 'Aporte ou empréstimo do sócio');
      else if (isNo(value)) decide(c, 'service_revenue', 'rejected', 'Não foi aporte: é receita');
      else return false;
      return true;
    case 'pgbl':
      if (value === 'pgbl') decide(c, 'pgbl_pension', 'confirmed', 'PGBL, segundo você');
      else if (value === 'vgbl') decide(c, 'unclassified', 'rejected', 'VGBL não deduz no IR');
      else return false;
      return true;
    case 'education': {
      const person = typeof value === 'string' && !isNo(value) ? value : null;
      if (person === null) return false;
      decide(c, 'deductible_education', 'confirmed', 'Matrícula informada por você');
      c.detail = { person };
      return true;
    }
    case 'health': {
      if (isNo(value)) {
        decide(c, 'unclassified', 'rejected', 'Não foi atendimento de saúde');
        return true;
      }
      const raw: Record<string, unknown> =
        typeof value === 'object' ? value : { beneficiary: value };
      const beneficiary = String(raw.beneficiary ?? '');
      if (!BENEFICIARIES.has(beneficiary)) return false;
      decide(c, 'deductible_health', 'confirmed', 'Atendimento de saúde, segundo você');
      c.detail = { beneficiary: beneficiary as 'holder' | 'dependent' | 'other' };
      if (typeof raw.profession === 'string' && raw.profession !== '')
        c.detail.profession = raw.profession;
      return true;
    }
    default:
      return false;
  }
}

/**
 * Answers (by question id) and then per-transaction confirmations (by transaction id), which win.
 * Returns the ids of the cards that were answered.
 */
export function applyUserInput(
  classified: Classified[],
  answers: ReadonlyMap<string, AnswerValue>,
  confirmations: readonly Pick<Classification, 'transactionId' | 'category'>[],
): Set<string> {
  const answered = new Set<string>();
  // The pró-labore card first: a "no" moves its transfers into the distribution card (M2), answered next.
  const apply = (c: Classified) => {
    if (c.cardId === null) return;
    const id = c.cardId;
    const value = answers.get(id);
    if (value !== undefined && applyAnswer(c, id, value)) answered.add(id);
  };
  for (const c of classified) if (c.cardId === CARD.proLaboreGross) apply(c);
  for (const c of classified) if (c.cardId !== CARD.proLaboreGross) apply(c);
  const byId = new Map(classified.map((c) => [c.tx.id, c]));
  for (const conf of confirmations) {
    const c = byId.get(conf.transactionId);
    if (c !== undefined) decide(c, conf.category, 'confirmed', 'Categoria confirmada por você');
  }
  return answered;
}

/** Does this classification feed the facts? Rule suggestions do (as estimates); unconfirmed LLM guesses never do. */
export function feedsFacts(c: Classified): boolean {
  const s = c.classification.status;
  if (s === 'applied' || s === 'confirmed' || s === 'rejected') return true;
  return (
    s === 'pending_confirmation' &&
    c.classification.origin === 'rule' &&
    !WAIT_FOR_ANSWER.has(c.label ?? '') &&
    !(c.cardId?.startsWith('das:') ?? false)
  );
}

/** Rule suggestions that move nothing until answered: deductions, refund credits, and DAS with a twin (H3). */
const WAIT_FOR_ANSWER = new Set(['health_to_confirm', 'reversal_credit']);
