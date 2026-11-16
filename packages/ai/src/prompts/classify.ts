// classify@1: only the transactions the rules left over (ENGINE-SPEC E.1), already redacted (redact.ts).
// The answer is a suggestion: the pipeline's CLASSIFICATION_POLICY decides what is applied and what becomes a card.
import { formatBrl } from '@refund/engine';
import { CATEGORY_LABEL, type LlmClassificationInput } from '@refund/pipeline';

export const CLASSIFY_PROMPT_VERSION = 'classify@1';

export const CLASSIFY_INSTRUCTIONS = `You classify Brazilian bank transactions of a small company (account "PJ") and of its owner (account "PF") for Refund, a tax-savings app. Deterministic rules already classified most transactions; you only see the ones they could not resolve.

For each transaction in <transactions>, choose exactly one category from its own "allowedCategories" list (the meaning of each category is in <categories>). Descriptions are redacted: "[pessoa]" is a person, "[doc]" a document number, "#" a long number.

Rules:
- If the description does not let you tell, answer "unclassified" with a low confidence. Never guess a category that moves taxes (revenue, payroll, health, education, pension) from weak hints.
- confidence is your honest probability (0 to 1) that the category is right.
- reason: one short sentence in Brazilian Portuguese, without names or numbers.
- Return one item per transaction, with the same transactionId.

Return JSON with "items".`;

export function classifyPrompt(batch: readonly LlmClassificationInput[]): string {
  const categories = Object.fromEntries(
    [...new Set(batch.flatMap((t) => t.allowedCategories))].map((c) => [c, CATEGORY_LABEL[c]]),
  );
  const transactions = batch.map((t) => ({
    transactionId: t.transactionId,
    description: t.redactedDescription,
    amount: `R$ ${formatBrl(t.amountCents)}`,
    direction: t.direction,
    account: t.holder,
    method: t.method,
    counterparty: t.counterpartyType,
    counterpartyCnae: t.counterpartyCnae,
    allowedCategories: t.allowedCategories,
  }));
  return `<categories>\n${JSON.stringify(categories, null, 1)}\n</categories>\n<transactions>\n${JSON.stringify(transactions, null, 1)}\n</transactions>`;
}
