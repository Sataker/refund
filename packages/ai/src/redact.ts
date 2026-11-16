// Last redaction before anything reaches a model (ARCHITECTURE §6.3; rule 4). The pipeline already sends
// `redactedDescription` (documents stripped, the counterparty's name replaced); this is the second line: it strips
// again, removes e-mails and phones, and refuses the payload if `detectPii` still finds anything.
import type { ExplanationInput, LlmClassificationInput } from '@refund/pipeline';
import { detectPii, redactDescription, stripDocuments } from '@refund/sources';

export { redactDescription };

// Any token with an "@": the name redaction upstream may already have turned "joana.lima@…" into
// "[pessoa].[pessoa]@…", which a strict e-mail pattern no longer sees.
const EMAIL = /[^\s@]*@[^\s@]*/gu;
const PHONE = /(?<!\d)(?:\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}(?!\d)/g;
const LONG_DIGITS = /\d{6,}/g;

/** Documents → "[doc]", e-mails → "[email]", phones → "[telefone]", runs of 6+ digits → "#". */
export function redactForModel(text: string): string {
  return stripDocuments(text)
    .replace(EMAIL, '[email]')
    .replace(PHONE, '[telefone]')
    .replace(LONG_DIGITS, '#');
}

/** The classification input as it may leave the server, or null when something personal survives. */
export function toModelInput(input: LlmClassificationInput): LlmClassificationInput | null {
  const out = { ...input, redactedDescription: redactForModel(input.redactedDescription) };
  return detectPii({ description: out.redactedDescription }).length === 0 ? out : null;
}

/** True when the explanation payload (engine output and law text) carries nothing personal. */
export const explanationIsClean = (input: ExplanationInput): boolean =>
  detectPii({ finding: input.finding, articles: input.articles }).length === 0;
