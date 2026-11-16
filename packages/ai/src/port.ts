// createLlmPort (ARCHITECTURE §4.5). Every mode honours the port's contract: never throws; classify errors → [],
// explain errors → the template.
import type { ExplanationInput, ExplanationOutput, LlmPort } from '@refund/pipeline';
import { templateOutput } from './templates.ts';

export type LlmPortOptions = { mode: 'template' };

function safeTemplate(input: ExplanationInput): ExplanationOutput {
  return templateOutput(input.finding, input.audience);
}

/** `template`: no model, no key, no network. Classifies nothing (the pipeline turns leftovers into cards). */
function templatePort(): LlmPort {
  return {
    mode: 'template',
    classify: async () => [],
    explain: async (input) => safeTemplate(input),
  };
}

export function createLlmPort(options: LlmPortOptions): LlmPort {
  switch (options.mode) {
    case 'template':
      return templatePort();
  }
}
