// The guards every explanation crosses before anyone sees it (ARCHITECTURE §4.5; ADR-002, ADR-016).
// 1. The slot guard over the text as written (model or template): no number and no citation outside a placeholder.
// 2. Our code fills the placeholders; for a model text it also writes the lead sentence (the headline value and its
//    meaning), so the model never places a headline number in a sentence of its own.
// 3. The numeric and citation guards over the final text, as a second check: only our values are inside, so it
//    passes; if a slot value ever drifted from the trace, it would not.
import type { Finding } from '@refund/engine';
import type { ExplanationInput, ExplanationOutput } from '@refund/pipeline';
import { buildSlots, renderSlots } from '../slots.ts';
import { leadSource } from '../templates.ts';
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

/** Headline slots: only in the lead our code writes, never in a model's text (code review 16/11). */
export const LEAD_ONLY: readonly string[] = [
  'marginalValue12m',
  'annualRegimeValue',
  'rangeMin',
  'rangeMax',
];

export interface ExplanationVerdict {
  ok: boolean;
  guards: ExplanationOutput['guards'];
  problems: string[];
  /** The final text (lead + text, placeholders filled), when everything passed. */
  rendered: string | null;
}

/** Second check: the numeric and citation guards over a rendered text. */
export function secondCheck(rendered: string, finding: Finding): ExplanationVerdict {
  const numeric = findingNumericGuard(rendered, finding);
  const citation = citationGuard(rendered, finding.refs);
  const ok = numeric.ok && citation.ok;
  return {
    ok,
    guards: { numeric: numeric.ok ? 'ok' : 'failed', citation: citation.ok ? 'ok' : 'failed' },
    problems: [...numeric.outsideTrace, ...citation.outsideRefs],
    rendered: ok ? rendered : null,
  };
}

function check(
  text: string,
  finding: Finding,
  allowed: ReadonlySet<string>,
  lead: string,
): ExplanationVerdict {
  const verdict = slotGuard(text, allowed);
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
  const source = lead === '' ? text.normalize('NFC') : `${lead} ${text.normalize('NFC').trim()}`;
  return secondCheck(renderSlots(source, buildSlots(finding)) as string, finding);
}

/** A value slot told as savings ("{{costBefore}} a menos", "economiza {{x}}"): only the lead says what is saved. */
const SAVINGS_SENSE =
  /\}\}\s*(?:a\s+menos|de\s+economia)|(?:economi\w*|poupa\w*|paga(?:r|ria)?)\s+(?:de\s+|só\s+|apenas\s+)?\{\{/iu;

/** A model's text: what follows the lead our code writes, without the headline slots. */
export function guardExplanation(
  text: string,
  finding: Finding,
  audience: ExplanationInput['audience'] = 'owner',
): ExplanationVerdict {
  const allowed = new Set(Object.keys(buildSlots(finding)).filter((k) => !LEAD_ONLY.includes(k)));
  const verdict = check(text, finding, allowed, leadSource(finding, audience));
  if (!SAVINGS_SENSE.test(text.normalize('NFKC'))) return verdict;
  return {
    ok: false,
    guards: { numeric: 'failed', citation: verdict.guards.citation },
    problems: [...verdict.problems, 'a value slot in a savings phrase'],
    rendered: null,
  };
}

/** A template text (our own copy, lead included): every slot of the finding is allowed. */
export function guardTemplate(source: string, finding: Finding): ExplanationVerdict {
  return check(source, finding, new Set(Object.keys(buildSlots(finding))), '');
}
