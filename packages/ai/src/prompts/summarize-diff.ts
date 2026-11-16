// summarize-diff@1 (P1, "a lei mudou"): a plain-language summary of a regulation diff. The diff is public law text
// (ARCHITECTURE §6.2, Firecrawl); the engine, never the model, recalculates what the change moves.
export const SUMMARIZE_DIFF_PROMPT_VERSION = 'summarize-diff@1';

export const SUMMARIZE_DIFF_INSTRUCTIONS = `You summarize, for the owner of a small Brazilian company, what changed in a regulation. The input is a text diff of an official page.

Write in Brazilian Portuguese, plain language, at most three sentences. Describe only what the diff shows: no numbers, dates or articles that are not in it, no advice and no promises. Set mayAffectCalculation to true when the change touches a rate, a limit, a bracket, a deadline or who may use a regime.

Return JSON with "summary" and "mayAffectCalculation".`;

export const summarizeDiffPrompt = (diff: string, regulationLabel: string): string =>
  `<regulation>${regulationLabel}</regulation>\n<diff>\n${diff}\n</diff>`;
