// Classification step 2: the LlmPort, only for what the rules left over (ENGINE-SPEC E.1; REVISAO A5).
import { redactDescription } from '@refund/sources';
import type { LlmClassificationInput, LlmClassificationOutput, LlmPort } from '../ports.ts';
import { type Category, CLASSIFICATION_POLICY, type NormalizedTransaction } from '../types.ts';

/** Categories that move a finding (E.1.3): an LLM guess on them is always a card, never applied. */
export const FEEDS_FINDING: ReadonlySet<Category> = new Set<Category>([
  'service_revenue',
  'sales_revenue',
  'export_revenue',
  'pro_labore',
  'profit_distribution',
  'salary',
  'inss_charge',
  'fgts_charge',
  'das_tax',
  'darf_tax',
  'deductible_health',
  'deductible_education',
  'pgbl_pension',
  'personal_expense_in_pj',
]);

/**
 * What the model may answer per account and direction. Same holder, pró-labore and distribution need the holder's
 * identity (E.2), which the model never sees, so they are not offered.
 */
export function allowedCategories(
  t: Pick<NormalizedTransaction, 'holder' | 'direction'>,
): Category[] {
  if (t.holder === 'PJ') {
    return t.direction === 'inflow'
      ? ['service_revenue', 'sales_revenue', 'export_revenue', 'financial_income', 'unclassified']
      : [
          'operating_expense',
          'personal_expense_in_pj',
          'bank_fee',
          'other_taxes',
          'das_tax',
          'darf_tax',
          'inss_charge',
          'fgts_charge',
          'salary',
          'unclassified',
        ];
  }
  return t.direction === 'inflow'
    ? ['financial_income', 'unclassified']
    : [
        'deductible_health',
        'deductible_education',
        'pgbl_pension',
        'bank_fee',
        'other_taxes',
        'unclassified',
      ];
}

export const BATCH_SIZE = 50;
export const PARALLELISM = 2;
export const DEFAULT_LLM_TIMEOUT_MS = 20_000;

export interface LlmVerdict {
  category: Category;
  confidence: number;
  reason: string;
  status: 'applied' | 'pending_confirmation' | 'unclassified';
}

export function toLlmInput(t: NormalizedTransaction, original: string): LlmClassificationInput {
  return {
    transactionId: t.id,
    redactedDescription: redactDescription(original, t.counterparty ?? undefined),
    amountCents: t.amountCents,
    direction: t.direction,
    holder: t.holder,
    method: t.method,
    counterpartyType: t.counterparty?.document?.type ?? null,
    counterpartyCnae: t.counterparty?.cnae ?? null,
    allowedCategories: allowedCategories(t),
  };
}

/** Bounded call: a throw, a stall past `timeoutMs` or a non-array answer all become []. */
export async function boundedCall<T>(
  call: () => Promise<T>,
  fallback: T,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), timeoutMs);
  });
  try {
    // Promise.resolve().then(call): a port that throws synchronously also lands in the fallback (code review #1).
    return await Promise.race([
      Promise.resolve()
        .then(call)
        .catch(() => fallback),
      expired,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** CLASSIFICATION_POLICY over one validated model answer. */
export function verdictOf(
  out: LlmClassificationOutput,
  input: LlmClassificationInput,
): LlmVerdict | null {
  if (!input.allowedCategories.includes(out.category)) return null;
  if (typeof out.confidence !== 'number' || !(out.confidence >= 0 && out.confidence <= 1))
    return null;
  const reason = typeof out.reason === 'string' ? out.reason.slice(0, 200) : '';
  if (out.confidence < CLASSIFICATION_POLICY.discardBelow || out.category === 'unclassified') {
    return { category: 'unclassified', confidence: out.confidence, reason, status: 'unclassified' };
  }
  const direct =
    !FEEDS_FINDING.has(out.category) &&
    out.confidence >= CLASSIFICATION_POLICY.llmAppliesDirectlyIfNotFeedingFinding.minConfidence;
  return {
    category: out.category,
    confidence: out.confidence,
    reason,
    status: direct ? 'applied' : 'pending_confirmation',
  };
}

/** Batches of 50, two at a time (ARCHITECTURE §4.4). Unknown or invalid answers are dropped. */
export async function classifyWithLlm(
  inputs: LlmClassificationInput[],
  llm: LlmPort,
  timeoutMs: number,
): Promise<Map<string, LlmVerdict>> {
  const verdicts = new Map<string, LlmVerdict>();
  const batches: LlmClassificationInput[][] = [];
  for (let i = 0; i < inputs.length; i += BATCH_SIZE) batches.push(inputs.slice(i, i + BATCH_SIZE));
  for (let i = 0; i < batches.length; i += PARALLELISM) {
    const group = batches.slice(i, i + PARALLELISM);
    const answers = await Promise.all(
      group.map((batch) => boundedCall(() => llm.classify(batch), [], timeoutMs)),
    );
    group.forEach((batch, j) => {
      const answer = answers[j];
      if (!Array.isArray(answer)) return;
      const byId = new Map(batch.map((b) => [b.transactionId, b]));
      for (const out of answer as unknown[]) {
        if (typeof out !== 'object' || out === null) continue;
        const o = out as LlmClassificationOutput;
        const input = byId.get(o.transactionId);
        if (input === undefined || verdicts.has(o.transactionId)) continue;
        const v = verdictOf(o, input);
        if (v !== null) verdicts.set(o.transactionId, v);
      }
    });
  }
  return verdicts;
}
