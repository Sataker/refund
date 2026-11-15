// D23 (PLAN §18, 15/11): confirmation cards ordered by their effect on the total (biggest R$ change first), so the
// user confirms what matters before getting tired. The effect is computed, not guessed: the facts are rebuilt and
// the engine recalculated with each plausible answer of the card (a what-if; the analysis itself still runs the
// engine once, ARCHITECTURE §4.4). `estimatedImpact` = the largest |Δ savings12m| among those answers.
import type { Cents } from '@refund/engine';
import type { AnswerValue, Classified } from './classify/index.ts';
import { CARD } from './classify/rules.ts';
import type { ConfirmationQuestion } from './types.ts';

/** savings12m with these answers, or null when the facts or the engine fail. */
export type TotalWith = (answers: ReadonlyMap<string, AnswerValue>) => number | null;

/**
 * Fixed priority when a card has no computable effect (facts or engine fail): first what moves the total through
 * the Fator R and the export segregation, then revenue, then what only feeds alerts or deductions.
 */
export const FALLBACK_PRIORITY = [
  CARD.proLaboreGross,
  CARD.payrollGross,
  CARD.export,
  'clt-employee',
  'das',
  CARD.worksInCompany,
  'revenue',
  'reversal',
  'contribution',
  'partner-transfer',
  CARD.distribution,
  CARD.bookkeeping,
  'health',
  'education',
  'pgbl',
  'llm',
] as const;

const kindOf = (id: string): string => id.split(':')[0] ?? id;

const priorityOf = (id: string): number => {
  const i = (FALLBACK_PRIORITY as readonly string[]).indexOf(kindOf(id));
  return i === -1 ? FALLBACK_PRIORITY.length : i;
};

/** The answers a card can plausibly get, as values `applyUserInput` / `buildFacts` accept. */
export function plausibleAnswers(
  q: ConfirmationQuestion,
  classified: readonly Classified[],
): AnswerValue[] {
  switch (kindOf(q.id)) {
    case CARD.proLaboreGross:
      return ['yes', 'no'];
    case CARD.payrollGross: {
      // The other plausible extreme of the D22 default: the net salaries of the statement (a lower bound).
      const ids = new Set(q.transactionIds);
      const net: Record<string, number> = {};
      for (const c of classified)
        if (ids.has(c.tx.id)) net[c.tx.month] = (net[c.tx.month] ?? 0) + c.tx.amountCents;
      return Object.keys(net).length > 0 ? [net] : [];
    }
    case 'health':
      // The deductible case (a professional of Lei 9.250, art. 8º, II, a) and "not health".
      return [{ beneficiary: 'holder', profession: 'physician' }, 'no'];
    case 'education':
      return ['holder', 'dependent'];
    default:
      return q.options.map((o) => o.value);
  }
}

/**
 * Orders the cards: computed effect desc (cards without one after, by FALLBACK_PRIORITY), then money moved, then id.
 * Sets `estimatedImpact` to the effect (null when not computable).
 */
export function rankByEffect(
  questions: readonly ConfirmationQuestion[],
  classified: readonly Classified[],
  answers: ReadonlyMap<string, AnswerValue>,
  totalWith: TotalWith,
): ConfirmationQuestion[] {
  const amount = new Map(classified.map((c) => [c.tx.id, c.tx.amountCents]));
  const base = safe(totalWith, answers);
  const ranked = questions.map((q) => {
    const moved = q.transactionIds.reduce((a, id) => a + (amount.get(id) ?? 0), 0);
    let effect: number | null = null;
    if (base !== null) {
      for (const value of plausibleAnswers(q, classified)) {
        const total = safe(totalWith, new Map([...answers, [q.id, value]]));
        if (total !== null) effect = Math.max(effect ?? 0, Math.abs(total - base));
      }
    }
    return { q: { ...q, estimatedImpact: effect as Cents | null }, effect, moved };
  });
  ranked.sort(
    (a, b) =>
      (b.effect ?? -1) - (a.effect ?? -1) ||
      (a.effect === null && b.effect === null ? priorityOf(a.q.id) - priorityOf(b.q.id) : 0) ||
      b.moved - a.moved ||
      (a.q.id < b.q.id ? -1 : a.q.id > b.q.id ? 1 : 0),
  );
  return ranked.map((r) => r.q);
}

function safe(totalWith: TotalWith, answers: ReadonlyMap<string, AnswerValue>): number | null {
  try {
    return totalWith(answers);
  } catch {
    return null;
  }
}
