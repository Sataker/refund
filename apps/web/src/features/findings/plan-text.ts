import type { ActionStep } from '@refund/engine';
import { formatYearMonth } from '@/lib/format';
import { ACTOR_LABEL, formatCivilDate } from './model';

/** The engine's steps as plain text for "Copiar" (same words, same dates, same refs; nothing added). */
export function planAsText(
  title: string,
  steps: readonly ActionStep[],
  labelOf: (refId: string) => string | undefined,
): string {
  const when = (w: string) => (w.length === 7 ? formatYearMonth(w) : formatCivilDate(w));
  const lines = [...steps]
    .sort((a, b) => a.order - b.order)
    .map((s, i) => {
      const parts = [`${i + 1}. [${ACTOR_LABEL[s.who]}] ${s.what}`];
      if (s.where)
        parts.push(`   Onde: ${s.where.name}${s.where.path ? ` › ${s.where.path}` : ''}`);
      if (s.from) parts.push(`   A partir de: ${when(s.from)}`);
      if (s.until) parts.push(`   Prazo: ${when(s.until)}`);
      const refs = s.refIds.map(labelOf).filter((l): l is string => l !== undefined);
      if (refs.length > 0) parts.push(`   Base: ${refs.join('; ')}`);
      return parts.join('\n');
    });
  return [title, '', ...lines].join('\n');
}
