// The guards every explanation crosses before anyone sees it (ARCHITECTURE §4.5; ADR-002, ADR-016).
// 1. The slot guard over the text as written (model or template): no number and no citation outside a placeholder.
// 2. After our code fills the placeholders, the numeric and citation guards over the final text, as a second check:
//    only our values are inside, so it always passes; if a slot value ever drifted from the trace, it would not.
import type { Finding } from '@refund/engine';
import type { ExplanationOutput } from '@refund/pipeline';
import { buildSlots, renderSlots } from '../slots.ts';
import { citationGuard } from './citation.ts';
import { findingNumericGuard } from './numeric.ts';
import { slotGuard } from './slots.ts';

export { type CitationGuardResult, citationGuard } from './citation.ts';
export {
  allowanceFromTrace,
  findingNumericGuard,
  type NumericGuardResult,
  numericGuard,
} from './numeric.ts';
export { type SlotVerdict, slotGuard } from './slots.ts';

export interface ExplanationVerdict {
  ok: boolean;
  guards: ExplanationOutput['guards'];
  problems: string[];
  /** The final text (placeholders filled), when the slotted text was accepted. */
  rendered: string | null;
}

/** Slot guard over the slotted `text`, then the fill, then both guards over the final text. */
export function guardExplanation(text: string, finding: Finding): ExplanationVerdict {
  const slots = buildSlots(finding);
  const verdict = slotGuard(text, new Set(Object.keys(slots)));
  if (!verdict.ok)
    return {
      ok: false,
      guards: {
        numeric: verdict.numeric ? 'failed' : 'ok',
        citation: verdict.citation ? 'failed' : 'ok',
      },
      problems: verdict.problems,
      rendered: null,
    };
  const rendered = renderSlots(text, slots) as string;
  const numeric = findingNumericGuard(rendered, finding);
  const citation = citationGuard(rendered, finding.refs);
  return {
    ok: numeric.ok && citation.ok,
    guards: { numeric: numeric.ok ? 'ok' : 'failed', citation: citation.ok ? 'ok' : 'failed' },
    problems: [...numeric.outsideTrace, ...citation.outsideRefs],
    rendered: numeric.ok && citation.ok ? rendered : null,
  };
}
