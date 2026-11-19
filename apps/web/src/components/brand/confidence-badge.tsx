import type { Confidence } from '@refund/engine';
import { cn } from '@/lib/utils';

/** IDENTITY-AND-UI §4.2: color + shape + label, always all three (accessible for color-blind users). */
const LEVELS: Record<Confidence, { label: string; hint: string; text: string; swatch: string }> = {
  confirmed: {
    label: 'Confirmado',
    hint: 'Dado do extrato e regra objetiva da lei.',
    text: 'text-conf-confirmed',
    swatch: 'bg-current',
  },
  estimated: {
    label: 'Estimado',
    hint: 'Usa uma premissa que você ou seu contador precisam confirmar.',
    text: 'text-conf-estimated',
    swatch: 'hatch border border-current',
  },
  depends_on_regulation: {
    label: 'Depende de norma',
    hint: 'Tese legal, regulamentação pendente ou decisão do STF.',
    text: 'text-conf-norm',
    swatch: 'border border-dashed border-current',
  },
};

/** The level's label in running text ("estimado"), for lines that name the confidence without the badge. */
export function confidenceLabel(level: Confidence): string {
  return LEVELS[level].label.toLowerCase();
}

export function ConfidenceBadge({ level, className }: { level: Confidence; className?: string }) {
  const l = LEVELS[level];
  return (
    <span
      data-testid="confidence-badge"
      data-level={level}
      title={l.hint}
      className={cn('type-caption inline-flex items-center gap-1.5', l.text, className)}
    >
      <span className={cn('inline-block size-3 rounded-[3px]', l.swatch)} aria-hidden="true" />
      {l.label}
      <span className="sr-only">. {l.hint}</span>
    </span>
  );
}
