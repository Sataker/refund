// Public API of @refund/ai (ARCHITECTURE §4.5).
export const PACKAGE_NAME = '@refund/ai';

export {
  DIFF_TEMPLATE_VERSION,
  type LawChangeSummary,
  type LawChangeSummaryInput,
  summarizeLawChange,
  templateDiffSummary,
} from './diff-summary.ts';
export { type AiLogEvent, type GatewayOptions, summarizeDiff } from './gateway.ts';
export {
  type CitationGuardResult,
  citationGuard,
  type ExplanationVerdict,
  findingNumericGuard,
  guardExplanation,
  guardTemplate,
  LEAD_ONLY,
  type NumericGuardResult,
  numericGuard,
  type SlotVerdict,
  secondCheck,
  slotGuard,
} from './guards/index.ts';
export { type AiBudget, type AiTask, DEFAULT_BUDGET, MODELS } from './models.ts';
export { createLlmPort, type LlmPortOptions } from './port.ts';
export {
  CLASSIFY_PROMPT_VERSION,
  EXPLAIN_PROMPT_VERSION,
  SUMMARIZE_DIFF_PROMPT_VERSION,
} from './prompts/index.ts';
export { redactDescription, redactForModel, toModelInput } from './redact.ts';
export {
  emptyRecordings,
  parseRecordings,
  RECORDINGS,
  recordingKey,
  recordingsFor,
  stableStringify,
} from './replay.ts';
export { type RecordingItem, type Recordings, recordingsSchema } from './schemas.ts';
export { buildSlots, renderSlots, type SlotInfo, type Slots, slotInfo } from './slots.ts';
export {
  type Audience,
  leadSource,
  safeTemplateOutput,
  TEMPLATE_VERSION,
  templateExplanation,
  templateOutput,
  templateSource,
} from './templates.ts';
