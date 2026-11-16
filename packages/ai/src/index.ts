// Public API of @refund/ai (ARCHITECTURE §4.5).
export const PACKAGE_NAME = '@refund/ai';

export {
  type CitationGuardResult,
  citationGuard,
  type ExplanationVerdict,
  findingNumericGuard,
  guardExplanation,
  type NumericGuardResult,
  numericGuard,
} from './guards/index.ts';
export { createLlmPort, type LlmPortOptions } from './port.ts';
export {
  type Audience,
  TEMPLATE_VERSION,
  templateExplanation,
  templateOutput,
} from './templates.ts';
