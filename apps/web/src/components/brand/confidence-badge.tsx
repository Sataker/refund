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

/**
 * Bug bash 20/11 (C1): on example statements nothing is "Confirmado" (the data is not the company's); the badge
 * says what the number rests on instead. Same shape as "estimado" (it still needs the company's own statement).
 */
const EXAMPLE = {
  label: 'Exemplo · extrato de exemplo',
  hint: 'Calculado sobre um extrato de exemplo, não sobre os dados da empresa.',
  text: 'text-conf-estimated',
  swatch: 'hatch border border-current',
};

/** The level's label in running text ("estimado"), for lines that name the confidence without the badge. */
export function confidenceLabel(level: Confidence, example = false): string {
  if (example && level === 'confirmed') return 'exemplo (extrato de exemplo)';
  return LEVELS[level].label.toLowerCase();
}

export function ConfidenceBadge({
  level,
  className,
  example = false,
  size = 'sm',
}: {
  level: Confidence;
  className?: string;
  /** The analysis runs on example statements (features/live/data-origin.ts `isExampleBank`). */
  example?: boolean;
  /** `md`: 14px with a bigger swatch (finding detail, E21 readability). */
  size?: 'sm' | 'md';
}) {
  const l = example && level === 'confirmed' ? EXAMPLE : LEVELS[level];
  return (
    <span
      data-testid="confidence-badge"
      data-level={level}
      data-example={example ? 'true' : undefined}
      title={l.hint}
      className={cn(
        size === 'md' ? 'type-small font-medium' : 'type-caption',
        'inline-flex items-center gap-1.5',
        l.text,
        className,
      )}
    >
      <span
        className={cn(
          'inline-block rounded-[3px]',
          size === 'md' ? 'size-3.5' : 'size-3',
          l.swatch,
        )}
        aria-hidden="true"
      />
      {l.label}
      <span className="sr-only">. {l.hint}</span>
    </span>
  );
}
