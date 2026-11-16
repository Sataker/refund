// A mocked AI Gateway model (AI SDK `ai/test`): no key, no network. `reply` returns the model's raw text (JSON for
// structured outputs) or throws; every call's options are kept for assertions.
import { MockLanguageModelV4 } from 'ai/test';

type CallOptions = MockLanguageModelV4['doGenerateCalls'][number];

export function mockModel(reply: (call: CallOptions) => string | Promise<string>) {
  return new MockLanguageModelV4({
    modelId: 'claude-sonnet-5.5',
    doGenerate: async (call) => ({
      content: [{ type: 'text', text: await reply(call) }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 20, text: 20, reasoning: undefined },
      },
      warnings: [],
    }),
  });
}

/** The user prompt text the model received. */
export function promptText(call: CallOptions): string {
  return call.prompt
    .flatMap((m) =>
      m.role === 'user' ? m.content.flatMap((p) => (p.type === 'text' ? [p.text] : [])) : [],
    )
    .join('\n');
}

/** A model that never answers until the call is aborted (the port's timeout). */
export const stalledModel = () =>
  mockModel(
    (call) =>
      new Promise<string>((_, reject) => {
        call.abortSignal?.addEventListener('abort', () => reject(call.abortSignal?.reason));
      }),
  );
