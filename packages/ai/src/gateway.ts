// Live implementation (ARCHITECTURE §4.5): AI SDK 7 `generateText` + `Output.object` through the AI Gateway, with
// the task's fallback models, a hard timeout and no throw. Auth: OIDC on Vercel, AI_GATEWAY_API_KEY locally; the
// web app builds this port only when the `ai` capability is on (ARCHITECTURE §4.10).
import type {
  ExplanationInput,
  ExplanationOutput,
  LlmClassificationInput,
  LlmClassificationOutput,
  LlmPort,
} from '@refund/pipeline';
import { generateText, type LanguageModel, Output } from 'ai';
import type { z } from 'zod';
import { citationGuard, guardExplanation } from './guards/index.ts';
import { allowanceFromText, checkNumbers } from './guards/numeric.ts';
import { type AiBudget, type AiTask, MODELS } from './models.ts';
import {
  CLASSIFY_INSTRUCTIONS,
  classifyPrompt,
  EXPLAIN_INSTRUCTIONS,
  EXPLAIN_PROMPT_VERSION,
  explainPrompt,
  SUMMARIZE_DIFF_INSTRUCTIONS,
  SUMMARIZE_DIFF_PROMPT_VERSION,
  summarizeDiffPrompt,
} from './prompts/index.ts';
import { explanationIsClean, redactForModel, toModelInput } from './redact.ts';
import {
  findClassification,
  findExplanation,
  replayClassification,
  replayExplanation,
} from './replay.ts';
import {
  classifyOutputSchema,
  type ExplainOutput,
  explainOutputSchema,
  type Recordings,
  type SummarizeDiffOutput,
  summarizeDiffOutputSchema,
} from './schemas.ts';
import { safeTemplateOutput } from './templates.ts';

/** JSON log events (ARCHITECTURE §10.1; GLOSSARY: `ai.call`, `ai.guard_failed`). No text and no input is logged. */
export type AiLogEvent =
  | { event: 'ai.call'; task: AiTask; model: string; ms: number; tokens: number | null }
  | { event: 'ai.call_failed'; task: AiTask; code: string; ms: number }
  | { event: 'ai.guard_failed'; ruleId: string; numeric: string; citation: string; outside: number }
  | { event: 'ai.pii_blocked'; task: AiTask; count: number }
  | { event: 'ai.budget_exhausted'; dropped: number };

export interface GatewayOptions {
  budget: AiBudget;
  /** Replay before calling the model, when present (ARCHITECTURE §4.5). */
  recordings?: Recordings;
  /** The model per task; default = the AI Gateway slug of MODELS. Tests inject mock models here. */
  model?: (task: AiTask) => LanguageModel;
  log?: (event: AiLogEvent) => void;
  /** Injectable clock for `ms` in the logs (the package reads no clock of its own in tests). */
  now?: () => number;
  /** Called with the model's raw answer once it passed both guards (`pnpm ai:record` keeps the cited ref ids). */
  onExplanation?: (input: ExplanationInput, output: ExplainOutput) => void;
}

type Generated<T> =
  | { ok: true; value: T; model: string }
  | { ok: false; code: 'AI_TIMEOUT' | 'AI_SCHEMA_MISMATCH' | 'AI_CALL_FAILED' };

function errorCode(e: unknown): 'AI_TIMEOUT' | 'AI_SCHEMA_MISMATCH' | 'AI_CALL_FAILED' {
  const name = e instanceof Error ? e.name : '';
  if (name === 'AbortError' || name === 'TimeoutError') return 'AI_TIMEOUT';
  if (/NoObjectGenerated|NoOutputGenerated|TypeValidation|JSONParse/.test(name))
    return 'AI_SCHEMA_MISMATCH';
  return 'AI_CALL_FAILED';
}

/** One structured call: primary model, gateway fallbacks, timeout, schema validation. Never throws. */
async function generate<S extends z.ZodType>(
  task: AiTask,
  schema: S,
  instructions: string,
  prompt: string,
  options: GatewayOptions,
): Promise<Generated<z.infer<S>>> {
  const now = options.now ?? (() => 0);
  const started = now();
  try {
    const result = await generateText({
      model: options.model?.(task) ?? MODELS[task].primary,
      instructions,
      prompt,
      output: Output.object({ schema }),
      providerOptions: {
        gateway: {
          models: [...MODELS[task].fallbacks],
          caching: 'auto',
          disallowPromptTraining: true,
        },
      },
      abortSignal: AbortSignal.timeout(options.budget.timeoutMs),
      maxRetries: 1,
    });
    const parsed = schema.safeParse(result.output);
    if (!parsed.success) {
      options.log?.({
        event: 'ai.call_failed',
        task,
        code: 'AI_SCHEMA_MISMATCH',
        ms: now() - started,
      });
      return { ok: false, code: 'AI_SCHEMA_MISMATCH' };
    }
    const model = result.response.modelId || MODELS[task].primary;
    options.log?.({
      event: 'ai.call',
      task,
      model,
      ms: now() - started,
      tokens: result.usage.totalTokens ?? null,
    });
    return { ok: true, value: parsed.data, model };
  } catch (e) {
    const code = errorCode(e);
    options.log?.({ event: 'ai.call_failed', task, code, ms: now() - started });
    return { ok: false, code };
  }
}

/** Shown on the confirmation card when the model's reason cannot be (a number, a citation). */
export const FALLBACK_REASON = 'Classificação sugerida pelo modelo.';

/**
 * The model's reason, redacted, with no amount, percentage or citation at all (nothing in a reason is backed by a
 * trace; code review 16/11, MEDIUM 4).
 */
export function safeReason(reason: string): string {
  const text = redactForModel(reason).slice(0, 200);
  const clean = checkNumbers(text, { cents: [], rates: [] }).ok && citationGuard(text, []).ok;
  return clean ? text : FALLBACK_REASON;
}

/** A model classification survives only if it answers a transaction we sent, inside that transaction's list. */
function acceptClassification(
  out: {
    transactionId: string;
    category: LlmClassificationOutput['category'];
    confidence: number;
    reason: string;
  },
  sent: ReadonlyMap<string, LlmClassificationInput>,
): LlmClassificationOutput | null {
  const input = sent.get(out.transactionId);
  if (input === undefined || !input.allowedCategories.includes(out.category)) return null;
  return {
    transactionId: out.transactionId,
    category: out.category,
    confidence: out.confidence,
    reason: safeReason(out.reason),
  };
}

export function gatewayPort(options: GatewayOptions): LlmPort {
  let sentSoFar = 0;

  async function classify(batch: LlmClassificationInput[]): Promise<LlmClassificationOutput[]> {
    const replayed: LlmClassificationOutput[] = [];
    const toSend: LlmClassificationInput[] = [];
    let blocked = 0;
    for (const input of batch) {
      const item = options.recordings && findClassification(options.recordings, input);
      const out = item ? replayClassification(item, input) : null;
      if (out !== null) {
        replayed.push(out);
        continue;
      }
      const clean = toModelInput(input);
      if (clean === null) blocked++;
      else toSend.push(clean);
    }
    if (blocked > 0) options.log?.({ event: 'ai.pii_blocked', task: 'classify', count: blocked });

    const room = Math.max(0, options.budget.maxTransactionsPerAnalysis - sentSoFar);
    if (toSend.length > room)
      options.log?.({ event: 'ai.budget_exhausted', dropped: toSend.length - room });
    const sending = toSend.slice(0, room);
    if (sending.length === 0) return replayed;
    sentSoFar += sending.length;

    const res = await generate(
      'classify',
      classifyOutputSchema,
      CLASSIFY_INSTRUCTIONS,
      classifyPrompt(sending),
      options,
    );
    if (!res.ok) return replayed;
    const sent = new Map(sending.map((t) => [t.transactionId, t]));
    const seen = new Set<string>();
    const fresh = res.value.items.flatMap((o) => {
      if (seen.has(o.transactionId)) return [];
      seen.add(o.transactionId);
      const accepted = acceptClassification(o, sent);
      return accepted === null ? [] : [accepted];
    });
    return [...replayed, ...fresh];
  }

  async function explain(input: ExplanationInput): Promise<ExplanationOutput> {
    const recorded = options.recordings && findExplanation(options.recordings, input);
    if (recorded) return replayExplanation(recorded, input);
    if (!explanationIsClean(input)) {
      options.log?.({ event: 'ai.pii_blocked', task: 'explain', count: 1 });
      return safeTemplateOutput(input);
    }
    const res = await generate(
      'explain',
      explainOutputSchema,
      EXPLAIN_INSTRUCTIONS,
      explainPrompt(input),
      options,
    );
    if (!res.ok) return safeTemplateOutput(input);
    const verdict = guardExplanation(res.value.text, input.finding, res.value.citedRefIds);
    if (!verdict.ok) {
      options.log?.({
        event: 'ai.guard_failed',
        ruleId: input.finding.ruleId,
        numeric: verdict.guards.numeric,
        citation: verdict.guards.citation,
        outside: verdict.outsideTrace.length + verdict.outsideRefs.length,
      });
      return safeTemplateOutput(input, verdict.guards);
    }
    options.onExplanation?.(input, res.value);
    return {
      text: res.value.text.trim(),
      origin: 'llm',
      guards: verdict.guards,
      model: res.model,
      promptVersion: EXPLAIN_PROMPT_VERSION,
    };
  }

  return {
    mode: 'gateway',
    classify: async (batch) => {
      try {
        return await classify(batch);
      } catch {
        return [];
      }
    },
    explain: async (input) => {
      try {
        return await explain(input);
      } catch {
        return safeTemplateOutput(input);
      }
    },
  };
}

/** P1 "a lei mudou": what changed, in plain words. Null on any failure (the screen shows the raw diff). */
export async function summarizeDiff(
  diff: string,
  regulationLabel: string,
  options: GatewayOptions,
): Promise<(SummarizeDiffOutput & { model: string; promptVersion: string }) | null> {
  const res = await generate(
    'summarizeDiff',
    summarizeDiffOutputSchema,
    SUMMARIZE_DIFF_INSTRUCTIONS,
    summarizeDiffPrompt(redactForModel(diff), regulationLabel),
    options,
  );
  if (!res.ok) return null;
  // The summary may only repeat amounts and citations the diff itself shows (code review 16/11, MEDIUM 4).
  const source = `${regulationLabel}\n${diff}`;
  const pseudoRef = { id: 'diff', label: source, url: '', verifiedAt: '1970-01-01' } as const;
  const numbersOk = checkNumbers(res.value.summary, allowanceFromText(source)).ok;
  const citationsOk = citationGuard(res.value.summary, [pseudoRef]).ok;
  if (!numbersOk || !citationsOk) {
    options.log?.({
      event: 'ai.guard_failed',
      ruleId: 'summarizeDiff',
      numeric: numbersOk ? 'ok' : 'failed',
      citation: citationsOk ? 'ok' : 'failed',
      outside: 1,
    });
    return null;
  }
  return { ...res.value, model: res.model, promptVersion: SUMMARIZE_DIFF_PROMPT_VERSION };
}
