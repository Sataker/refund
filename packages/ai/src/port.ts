// createLlmPort (ARCHITECTURE §4.5). Every mode honours the port's contract: never throws; classify errors → [],
// explain errors → the template.
import type { LlmPort } from '@refund/pipeline';
import { type GatewayOptions, gatewayPort } from './gateway.ts';
import { recordingPort } from './replay.ts';
import type { Recordings } from './schemas.ts';
import { safeTemplateOutput } from './templates.ts';

export type LlmPortOptions =
  | ({ mode: 'gateway' } & GatewayOptions)
  | { mode: 'recording'; recordings: Recordings }
  | { mode: 'template' };

/** `template`: no model, no key, no network. Classifies nothing (the pipeline turns leftovers into cards). */
function templatePort(): LlmPort {
  return {
    mode: 'template',
    classify: async () => [],
    explain: async (input) => safeTemplateOutput(input),
  };
}

export function createLlmPort(options: LlmPortOptions): LlmPort {
  switch (options.mode) {
    case 'gateway':
      return gatewayPort(options);
    case 'recording':
      return recordingPort(options.recordings);
    default:
      return templatePort();
  }
}
