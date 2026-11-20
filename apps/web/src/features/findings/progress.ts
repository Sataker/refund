import type { Total } from '@refund/engine';
import { formatBRL } from '@/lib/format';

// One source of truth for "confirmado", "estimado" and "N em aberto" (UX review 19/11, H2/M2), shared by Screen 4,
// its CTA and the dashboard. The big number is the confirmed savings only (ENGINE-SPEC C.9); the estimated savings
// are a second line, never inside it. Pure: it SELECTS the engine's own totals and counts cards; it computes no R$.

export interface ConfirmProgress {
  /** `total.byConfidence.confirmed`: the big number. */
  confirmed: number;
  /** `total.byConfidence.estimated`: the dashboard's "estimado" line (the same figure, never added). */
  estimated: number;
  /** Cards the run asked that have no saved answer yet. */
  open: number;
}

export function confirmProgress(
  total: Pick<Total, 'byConfidence'> | null,
  questionIds: readonly string[],
  answered: Iterable<string>,
): ConfirmProgress {
  const done = new Set(answered);
  return {
    confirmed: total?.byConfidence.confirmed ?? 0,
    estimated: total?.byConfidence.estimated ?? 0,
    open: new Set(questionIds.filter((id) => !done.has(id))).size,
  };
}

/** D36 CTA, without a misleading "até R$ X" (M2: the answers can unlock more than the estimate shows). */
export function confirmCta(open: number): string {
  return open === 1
    ? 'Responda 1 pergunta para confirmar'
    : `Responda ${open} perguntas para confirmar`;
}

/** The line under the big number: "+ R$ X estimados — responda N perguntas para confirmar" (null when nothing). */
export function estimatedLine(p: Pick<ConfirmProgress, 'estimated' | 'open'>): string | null {
  if (p.estimated <= 0) return null;
  const head = `+ ${formatBRL(p.estimated)} estimados`;
  return p.open > 0
    ? `${head} — ${confirmCta(p.open).toLowerCase()}`
    : `${head} (fora do número grande)`;
}
