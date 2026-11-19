import { type Facts, recalculate } from '@refund/engine';
import { MARGIN_STEPS, proLaborePoint } from './model';
import type { MarginStepValue } from './simulator-text';

/**
 * R01's per-year value at every slider step (D32 margin cost), run by the engine with the step's `fatorRMargin`.
 * Called by the static R01 detail page at build time, so the browser does not run 21 recalculations.
 */
export function marginStepValues(facts: Facts): MarginStepValue[] {
  return MARGIN_STEPS.map((margin) => {
    const r = recalculate(facts, {
      ...facts.assumptions,
      fatorRMargin: { value: margin, origin: 'user', editable: true, source: 'slider' },
    });
    return { margin, annual: r.ok ? (proLaborePoint(r.value)?.annual ?? null) : null };
  });
}
