// zod schemas of everything a model returns (ARCHITECTURE §4.5) and of the recording file (§5.4).
// A model answer outside its schema is discarded (TESTS §3.5).
import { CATEGORY_LABEL, type Category } from '@refund/pipeline';
import { z } from 'zod';

export const CATEGORIES = Object.keys(CATEGORY_LABEL) as [Category, ...Category[]];

export const classifyOutputSchema = z.object({
  items: z
    .array(
      z.object({
        transactionId: z.string().min(1),
        category: z.enum(CATEGORIES),
        confidence: z.number().min(0).max(1),
        reason: z.string().max(400),
      }),
    )
    .max(100),
});
export type ClassifyOutput = z.infer<typeof classifyOutputSchema>;

export const explainOutputSchema = z.object({
  /** pt-BR, plain language, every number copied from the data given. */
  text: z.string().min(1).max(1200),
  /** The `LegalRef.id`s the text relies on; each must be one of the finding's refs. */
  citedRefIds: z.array(z.string()).max(20),
});
export type ExplainOutput = z.infer<typeof explainOutputSchema>;

export const summarizeDiffOutputSchema = z.object({
  /** pt-BR, what changed in the regulation, without numbers the diff does not show. */
  summary: z.string().min(1).max(800),
  /** True when the change can move a value the engine computes (the engine recalculates; the model never does). */
  mayAffectCalculation: z.boolean(),
});
export type SummarizeDiffOutput = z.infer<typeof summarizeDiffOutputSchema>;

const guardsSchema = z.object({
  numeric: z.enum(['ok', 'failed', 'not_applied']),
  citation: z.enum(['ok', 'failed', 'not_applied']),
});

const recordingItemSchema = z.discriminatedUnion('task', [
  z.object({
    task: z.literal('explain'),
    ruleId: z.string(),
    /** Who wrote the text: the gateway (passed the guards) or the deterministic template. */
    origin: z.enum(['gateway', 'template']),
    promptVersion: z.string(),
    model: z.string().optional(),
    recordedAt: z.string(),
    output: explainOutputSchema,
    guards: guardsSchema,
  }),
  z.object({
    task: z.literal('classify'),
    origin: z.literal('gateway'),
    promptVersion: z.string(),
    model: z.string().optional(),
    recordedAt: z.string(),
    output: z.object({
      category: z.enum(CATEGORIES),
      confidence: z.number().min(0).max(1),
      reason: z.string(),
    }),
  }),
]);
export type RecordingItem = z.infer<typeof recordingItemSchema>;

export const recordingsSchema = z.object({
  $format: z.literal('refund.ai-recording/v1'),
  persona: z.string(),
  engineVersion: z.string(),
  parametersVersion: z.string(),
  /** key = sha256(stableStringify({ task, promptVersion, input })) (ARCHITECTURE §5.4). */
  items: z.record(z.string(), recordingItemSchema),
});
export type Recordings = z.infer<typeof recordingsSchema>;
