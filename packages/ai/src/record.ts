// The pieces of `pnpm ai:record` (scripts/record-ai.ts) that do not touch the disk or the network, so they are
// tested: capture what the pipeline asks the port, and build the recording file (ARCHITECTURE §5.4).
import type {
  ExplanationInput,
  LlmClassificationInput,
  LlmClassificationOutput,
  LlmPort,
} from '@refund/pipeline';
import { guardExplanation } from './guards/index.ts';
import { CLASSIFY_PROMPT_VERSION, EXPLAIN_PROMPT_VERSION } from './prompts/index.ts';
import { recordingKey, stableStringify } from './replay.ts';
import type { ExplainOutput, RecordingItem, Recordings } from './schemas.ts';
import { safeTemplateOutput, TEMPLATE_VERSION, templateExplanation } from './templates.ts';

export interface Captured {
  explain: ExplanationInput[];
  classify: LlmClassificationInput[];
}

/** A template-mode port that also keeps every input the pipeline sends (deduplicated by recording key). */
export function capturingPort(): { port: LlmPort; captured: Captured } {
  const captured: Captured = { explain: [], classify: [] };
  const seen = new Set<string>();
  const keep = <T>(list: T[], key: string, value: T) => {
    if (seen.has(key)) return;
    seen.add(key);
    list.push(value);
  };
  return {
    captured,
    port: {
      mode: 'template',
      classify: async (batch) => {
        for (const t of batch) keep(captured.classify, recordingKey('classify', t), t);
        return [];
      },
      explain: async (input) => {
        keep(captured.explain, recordingKey('explain', input), input);
        return safeTemplateOutput(input);
      },
    },
  };
}

/** The deterministic template as a recording item (origin 'template'): /demo is complete before any model run. */
export function templateItem(input: ExplanationInput, recordedAt: string): RecordingItem {
  const text = templateExplanation(input.finding, input.audience);
  return {
    task: 'explain',
    ruleId: input.finding.ruleId,
    origin: 'template',
    promptVersion: TEMPLATE_VERSION,
    recordedAt,
    output: { text, citedRefIds: [] },
    guards: guardExplanation(text, input.finding).guards,
  };
}

/** A model explanation that passed the guards (the gateway only hands those to `onExplanation`). */
export function gatewayExplainItem(
  input: ExplanationInput,
  output: ExplainOutput,
  model: string,
  recordedAt: string,
): RecordingItem {
  return {
    task: 'explain',
    ruleId: input.finding.ruleId,
    origin: 'gateway',
    promptVersion: EXPLAIN_PROMPT_VERSION,
    model,
    recordedAt,
    output: { text: output.text.trim(), citedRefIds: output.citedRefIds },
    guards: guardExplanation(output.text, input.finding, output.citedRefIds).guards,
  };
}

export function gatewayClassifyItem(
  output: LlmClassificationOutput,
  model: string,
  recordedAt: string,
): RecordingItem {
  return {
    task: 'classify',
    origin: 'gateway',
    promptVersion: CLASSIFY_PROMPT_VERSION,
    model,
    recordedAt,
    output: { category: output.category, confidence: output.confidence, reason: output.reason },
  };
}

/**
 * `pnpm ai:record --template`: every explanation the model has not written is the template; recorded model items
 * (explanations, and classifications, which have no template) the pipeline still asks for are kept.
 */
export function templateRun(
  previous: Recordings,
  captured: Captured,
  recordedAt: string,
): Record<string, RecordingItem> {
  const next: Record<string, RecordingItem> = {};
  for (const input of captured.explain) {
    const key = recordingKey('explain', input);
    const old = previous.items[key];
    next[key] = old?.origin === 'gateway' ? old : templateItem(input, recordedAt);
  }
  for (const input of captured.classify) {
    const key = recordingKey('classify', input);
    const old = previous.items[key];
    if (old?.task === 'classify') next[key] = old;
  }
  return next;
}

/**
 * The new file: only the keys the current run produced (stale ones are dropped); an unchanged item keeps its
 * `recordedAt`, so re-recording the same thing leaves the file byte-identical.
 */
export function buildRecordings(
  previous: Recordings,
  next: Record<string, RecordingItem>,
  meta: Pick<Recordings, 'persona' | 'engineVersion' | 'parametersVersion'>,
): Recordings {
  const items: Record<string, RecordingItem> = {};
  for (const key of Object.keys(next).sort()) {
    const item = next[key] as RecordingItem;
    const old = previous.items[key];
    const same =
      old !== undefined &&
      stableStringify({ ...old, recordedAt: '' }) === stableStringify({ ...item, recordedAt: '' });
    items[key] = same ? old : item;
  }
  return { $format: 'refund.ai-recording/v1', ...meta, items };
}
