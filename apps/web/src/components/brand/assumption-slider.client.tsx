'use client';

import { useId } from 'react';
import { Slider } from '@/components/ui/slider.client';
import { formatBRL } from '@/lib/format';
import { cn } from '@/lib/utils';

interface Mark {
  cents: number;
  label: string;
}

interface AssumptionSliderProps {
  label: string;
  valueCents: number;
  minCents: number;
  maxCents: number;
  onValueChange: (cents: number) => void;
  /** "Você está aqui" (cobalt). */
  current?: Mark;
  /** The optimum (amber: it is found money). */
  optimum?: Mark;
  testId?: string;
  className?: string;
}

// §4.8: ←/→ = R$ 100; Shift+arrow = 10 steps = R$ 1.000 (Radix's built-in multiplier).
const STEP_CENTS = 10_000;

function percent(cents: number, min: number, max: number): number {
  return max === min ? 0 : ((cents - min) * 100) / (max - min);
}

/**
 * Assumption slider (IDENTITY-AND-UI §4.8): track --surface-2, range --accent-c, 20px thumb with --ring,
 * value in money-md above, marks for the current position and the optimum. The caller recalculates
 * (`recalculate()` from @refund/engine, E8); this component only reports integer cents.
 */
export function AssumptionSlider({
  label,
  valueCents,
  minCents,
  maxCents,
  onValueChange,
  current,
  optimum,
  testId = 'assumption-slider',
  className,
}: AssumptionSliderProps) {
  const labelId = useId();
  const marks = [
    ...(current ? [{ ...current, kind: 'current' as const }] : []),
    ...(optimum ? [{ ...optimum, kind: 'optimum' as const }] : []),
  ];
  return (
    <div data-testid={testId} data-cents={valueCents} className={cn('space-y-3', className)}>
      <div className="flex items-baseline justify-between gap-4">
        <span id={labelId} className="type-small text-muted-foreground">
          {label}
        </span>
        <span className="type-money-md text-foreground">{formatBRL(valueCents)}</span>
      </div>
      <div className="relative pt-1 pb-8">
        <Slider
          aria-labelledby={labelId}
          min={minCents}
          max={maxCents}
          step={STEP_CENTS}
          value={[valueCents]}
          onValueChange={(v) => {
            const next = v[0];
            if (next !== undefined && Number.isSafeInteger(next)) onValueChange(next);
          }}
          className="**:data-[slot=slider-range]:bg-cobalt **:data-[slot=slider-thumb]:size-5 **:data-[slot=slider-thumb]:border-2 **:data-[slot=slider-thumb]:border-ring **:data-[slot=slider-thumb]:bg-surface **:data-[slot=slider-track]:bg-surface-2"
        />
        {marks.map((m) => (
          <span
            key={m.kind}
            className="type-caption absolute top-6 -translate-x-1/2 whitespace-nowrap text-muted-foreground"
            style={{ left: `${percent(m.cents, minCents, maxCents)}%` }}
          >
            <span
              aria-hidden="true"
              className={cn(
                'mx-auto mb-0.5 block h-2 w-0.5 rounded-full',
                m.kind === 'optimum' ? 'bg-found-chart' : 'bg-cobalt',
              )}
            />
            {m.label}
          </span>
        ))}
      </div>
    </div>
  );
}
