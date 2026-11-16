// The two guards every model explanation crosses before anyone sees it (ARCHITECTURE §4.5; ADR-002).
import type { Finding } from '@refund/engine';
import type { ExplanationOutput } from '@refund/pipeline';
import { citationGuard } from './citation.ts';
import { findingNumericGuard } from './numeric.ts';

export { type CitationGuardResult, citationGuard } from './citation.ts';
export {
  allowanceFromTrace,
  findingNumericGuard,
  type NumericGuardResult,
  numericGuard,
} from './numeric.ts';

export interface ExplanationVerdict {
  ok: boolean;
  guards: ExplanationOutput['guards'];
  outsideTrace: string[];
  outsideRefs: string[];
}

/**
 * Numeric guard over the finding (trace + its own amounts), citation guard over its refs, plus the ref ids the model
 * declared it used: each must be a `LegalRef.id` of the finding (rule 3).
 */
export function guardExplanation(
  text: string,
  finding: Finding,
  citedRefIds: readonly string[] = [],
): ExplanationVerdict {
  const numeric = findingNumericGuard(text, finding);
  const citation = citationGuard(text, finding.refs);
  const known = new Set(finding.refs.map((r) => r.id));
  const unknownIds = citedRefIds.filter((id) => !known.has(id));
  const outsideRefs = [...citation.outsideRefs, ...unknownIds];
  return {
    ok: numeric.ok && outsideRefs.length === 0,
    guards: {
      numeric: numeric.ok ? 'ok' : 'failed',
      citation: outsideRefs.length === 0 ? 'ok' : 'failed',
    },
    outsideTrace: numeric.outsideTrace,
    outsideRefs,
  };
}
