// Replay by recording (ARCHITECTURE §5.4, §7.2): /demo runs with zero env and no network. The key hashes the input
// the pipeline sends, so an engine change that moves a number misses the recording (and `recordings-complete` fails)
// instead of showing a stale explanation.
import { createHash } from 'node:crypto';
import type {
  ExplanationInput,
  ExplanationOutput,
  LlmClassificationInput,
  LlmClassificationOutput,
  LlmPort,
} from '@refund/pipeline';
import devExportador from '../recordings/dev-exportador.json' with { type: 'json' };
import { guardExplanation } from './guards/index.ts';
import type { AiTask } from './models.ts';
import { CLASSIFY_PROMPT_VERSION, EXPLAIN_PROMPT_VERSION } from './prompts/index.ts';
import { type RecordingItem, type Recordings, recordingsSchema } from './schemas.ts';
import { safeTemplateOutput } from './templates.ts';

/** JSON with sorted keys and no undefined: the same value always hashes the same. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v ?? null)).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const PROMPT_VERSION: Record<Exclude<AiTask, 'summarizeDiff'>, string> = {
  classify: CLASSIFY_PROMPT_VERSION,
  explain: EXPLAIN_PROMPT_VERSION,
};

/** sha256(stableStringify({ task, promptVersion, input })) with the current prompt version of the task. */
export function recordingKey(task: 'classify', input: LlmClassificationInput): string;
export function recordingKey(task: 'explain', input: ExplanationInput): string;
export function recordingKey(
  task: 'classify' | 'explain',
  input: LlmClassificationInput | ExplanationInput,
): string {
  const body = stableStringify({ task, promptVersion: PROMPT_VERSION[task], input });
  return `sha256:${createHash('sha256').update(body).digest('hex')}`;
}

/** An empty recording file (a persona nobody recorded yet). */
export const emptyRecordings = (persona: string): Recordings => ({
  $format: 'refund.ai-recording/v1',
  persona,
  engineVersion: '',
  parametersVersion: '',
  items: {},
});

/** Parses a recording file; an invalid one is treated as empty (every item falls back to the template). */
export function parseRecordings(raw: unknown, persona: string): Recordings {
  const parsed = recordingsSchema.safeParse(raw);
  return parsed.success ? parsed.data : emptyRecordings(persona);
}

/** The recordings bundled with the build (ARCHITECTURE §7.2: static import, nothing read at runtime). */
export const RECORDINGS: Readonly<Record<string, Recordings>> = {
  'dev-exportador': parseRecordings(devExportador, 'dev-exportador'),
};

export const recordingsFor = (persona: string): Recordings =>
  RECORDINGS[persona] ?? emptyRecordings(persona);

type ExplainItem = Extract<RecordingItem, { task: 'explain' }>;
type ClassifyItem = Extract<RecordingItem, { task: 'classify' }>;

export function findExplanation(recordings: Recordings, input: ExplanationInput) {
  const item = recordings.items[recordingKey('explain', input)];
  return item?.task === 'explain' ? item : undefined;
}

export function findClassification(recordings: Recordings, input: LlmClassificationInput) {
  const item = recordings.items[recordingKey('classify', input)];
  return item?.task === 'classify' ? item : undefined;
}

/**
 * A recorded explanation as the port returns it. The slotted source crosses the guards again and is rendered with
 * today's slots (a hand-edited file cannot slip a number past them); a template-written item keeps origin
 * 'template', so the UI never labels it as the model's text.
 */
export function replayExplanation(item: ExplainItem, input: ExplanationInput): ExplanationOutput {
  const verdict = guardExplanation(item.output.source, input.finding);
  if (!verdict.ok || verdict.rendered === null) return safeTemplateOutput(input, verdict.guards);
  return {
    text: verdict.rendered,
    origin: item.origin === 'gateway' ? 'recording' : 'template',
    guards: item.guards,
    ...(item.model === undefined ? {} : { model: item.model }),
    promptVersion: item.promptVersion,
  };
}

/** A recorded classification, only if its category is still allowed for this input. */
export function replayClassification(
  item: ClassifyItem,
  input: LlmClassificationInput,
): LlmClassificationOutput | null {
  if (!input.allowedCategories.includes(item.output.category)) return null;
  return { transactionId: input.transactionId, ...item.output };
}

/** `recording`: replay only. A missing item explains with the template and classifies nothing. */
export function recordingPort(recordings: Recordings): LlmPort {
  return {
    mode: 'recording',
    classify: async (batch) => {
      try {
        return batch.flatMap((input) => {
          const item = findClassification(recordings, input);
          const out = item === undefined ? null : replayClassification(item, input);
          return out === null ? [] : [out];
        });
      } catch {
        return [];
      }
    },
    explain: async (input) => {
      try {
        const item = findExplanation(recordings, input);
        return item === undefined ? safeTemplateOutput(input) : replayExplanation(item, input);
      } catch {
        return safeTemplateOutput(input);
      }
    },
  };
}
