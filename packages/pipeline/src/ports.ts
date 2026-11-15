// Ports of the pipeline (ARCHITECTURE §4.4): implemented by @refund/ai and by the web app, never here.
// The pipeline does no I/O, reads no clock and calls no model directly (ARCHITECTURE §3.3, rule 3).
import type { CivilDate, Finding } from '@refund/engine';
import type { Category } from './category.ts';

export interface LlmPort {
  readonly mode: 'gateway' | 'recording' | 'template';
  /** Never throws; error → []. The pipeline still guards against a throw, a stall or garbage (TESTS §3.4). */
  classify(batch: LlmClassificationInput[]): Promise<LlmClassificationOutput[]>;
  /** Never throws; error → template. */
  explain(input: ExplanationInput): Promise<ExplanationOutput>;
}

export interface LlmClassificationInput {
  transactionId: string;
  redactedDescription: string;
  amountCents: number;
  direction: 'inflow' | 'outflow';
  holder: 'PF' | 'PJ';
  method: string;
  counterpartyType: 'CPF' | 'CNPJ' | null;
  counterpartyCnae: string | null;
  allowedCategories: Category[];
}

export interface LlmClassificationOutput {
  transactionId: string;
  category: Category;
  confidence: number;
  reason: string;
}

export interface ExplanationInput {
  finding: Finding;
  articles: { id: string; label: string; text: string }[];
  audience: 'owner' | 'accountant';
}

export interface ExplanationOutput {
  text: string;
  origin: 'llm' | 'recording' | 'template';
  guards: {
    numeric: 'ok' | 'failed' | 'not_applied';
    citation: 'ok' | 'failed' | 'not_applied';
  };
  model?: string;
  promptVersion: string;
}

/**
 * The analysis clock (ARCHITECTURE §3.1 `ports.ts`). Live: today in BRT; /demo: the persona's date, so the
 * hero always runs on 2026-11-12. `now()` only stamps `startedAt` and `durationMs`; no number depends on it.
 */
export interface AnalysisClock {
  today(): CivilDate;
  now(): number;
}
