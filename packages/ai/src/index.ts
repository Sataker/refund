// Public API of @refund/ai (ARCHITECTURE §4.5).
export const PACKAGE_NAME = '@refund/ai';

export { createLlmPort, type LlmPortOptions } from './port.ts';
export {
  type Audience,
  TEMPLATE_VERSION,
  templateExplanation,
  templateOutput,
} from './templates.ts';
