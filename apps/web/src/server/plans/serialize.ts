import 'server-only';
import type { Finding, RecoveryItem } from '@refund/engine';
import type { ExplanationOutput, FindingDto } from '@refund/pipeline';
import type { Entitlements } from './catalog.ts';

// ARCHITECTURE §8.3: the value shows, the trace does not. A locked trace leaves the server as `null`; it is never sent
// and hidden on the client. The SSE `finding` event and every page read go through this function.

/** FindingDto plus how many recovery items exist when the list was summarized (free plan: count + most urgent). */
export type LiveFindingDto = FindingDto & { recoveryItemsTotal?: number };

/** Free plan: only the most urgent item (smallest `daysLeft`, E8b) is listed; the count goes beside it. */
export function summarizeItems(items: readonly RecoveryItem[]): RecoveryItem[] {
  let urgent: RecoveryItem | undefined;
  for (const item of items)
    if (urgent === undefined || item.daysLeft < urgent.daysLeft) urgent = item;
  return urgent === undefined ? [] : [urgent];
}

/**
 * Which finding is "o maior" (07 §3.5: free plan opens the calculation of 1 finding, the largest): the savings finding
 * with the largest 12-month value; with no savings, the largest value of any type. Ties keep the engine order.
 */
export function largestRuleId(
  findings: readonly Pick<Finding, 'ruleId' | 'type' | 'marginalValue12m' | 'order'>[],
): string | null {
  const pool = findings.some((f) => f.type === 'savings')
    ? findings.filter((f) => f.type === 'savings')
    : findings;
  let best: (typeof pool)[number] | undefined;
  for (const f of [...pool].sort((a, b) => a.order - b.order))
    if (best === undefined || f.marginalValue12m > best.marginalValue12m) best = f;
  return best?.ruleId ?? null;
}

export function traceUnlocked(ent: Entitlements, isLargest: boolean): boolean {
  return ent.calcTraceUnlocked === 'all' || (ent.calcTraceUnlocked >= 1 && isLargest);
}

export function serializeFinding(
  f: Finding,
  ctx: {
    ent: Entitlements;
    isLargest: boolean;
    id: string;
    explanation: { text: string; origin: ExplanationOutput['origin'] } | null;
  },
): LiveFindingDto {
  const { trace, recoveryItems, ...base } = f;
  const unlocked = traceUnlocked(ctx.ent, ctx.isLargest);
  const dto: LiveFindingDto = {
    ...base,
    id: ctx.id,
    explanation: ctx.explanation?.text ?? f.title,
    explanationOrigin: ctx.explanation?.origin ?? 'template',
    trace: unlocked ? trace : null,
    traceLocked: !unlocked,
  };
  if (recoveryItems !== undefined) {
    if (ctx.ent.actionPlan) dto.recoveryItems = recoveryItems;
    else {
      dto.recoveryItems = summarizeItems(recoveryItems);
      dto.recoveryItemsTotal = recoveryItems.length;
    }
  }
  return dto;
}
