import type { Finding } from '@refund/engine';
import type { ExplanationInput, LlmClassificationInput } from '@refund/pipeline';
import { beforeAll, describe, expect, it } from 'vitest';
import { FALLBACK_REASON, safeReason } from '../src/gateway.ts';
import {
  type AiLogEvent,
  createLlmPort,
  DEFAULT_BUDGET,
  EXPLAIN_PROMPT_VERSION,
  type GatewayOptions,
  MODELS,
  type Recordings,
  recordingKey,
  summarizeDiff,
  templateExplanation,
} from '../src/index.ts';
import { POISONED, REAL_EXPLANATIONS } from './fixtures/explanations.ts';
import { explanationInputs, heroRuns } from './hero.ts';
import { mockModel, promptText, stalledModel } from './model-mock.ts';
import { syntheticCpf, syntheticEmail } from './pii.ts';

let inputs: ExplanationInput[];
beforeAll(async () => {
  inputs = explanationInputs((await heroRuns(createLlmPort({ mode: 'template' }))).answered);
}, 60_000);

const inputOf = (ruleId: string): ExplanationInput => {
  const i = inputs.find((x) => x.finding.ruleId === ruleId);
  if (i === undefined) throw new Error(`missing ${ruleId}`);
  return i;
};

function gateway(model: ReturnType<typeof mockModel>, over: Partial<GatewayOptions> = {}) {
  const logs: AiLogEvent[] = [];
  const port = createLlmPort({
    mode: 'gateway',
    budget: DEFAULT_BUDGET,
    model: () => model,
    log: (e) => logs.push(e),
    ...over,
  });
  return { port, logs, model };
}

const explainReply = (text: string, citedRefIds: string[] = []) =>
  JSON.stringify({ text, citedRefIds });

describe('gateway explain (AI SDK 7, mocked model)', () => {
  it('a text that passes both guards is shown as the model wrote it', async () => {
    const r01 = REAL_EXPLANATIONS[0] as { ruleId: string; text: string };
    const { port, logs, model } = gateway(
      mockModel(() => explainReply(r01.text, ['lc123-2006/art18/p5-j'])),
    );
    const out = await port.explain(inputOf('R01'));
    expect(out).toEqual({
      text: r01.text,
      origin: 'llm',
      guards: { numeric: 'ok', citation: 'ok' },
      model: 'claude-sonnet-5.5',
      promptVersion: EXPLAIN_PROMPT_VERSION,
    });
    expect(logs).toMatchObject([{ event: 'ai.call', task: 'explain', tokens: 30 }]);
    const call = model.doGenerateCalls[0];
    expect(call?.providerOptions).toEqual({
      gateway: {
        models: [...MODELS.explain.fallbacks],
        caching: 'auto',
        disallowPromptTraining: true,
      },
    });
  });

  it('the model gets formatted values from the trace and the law text, never raw cents', async () => {
    const { port, model } = gateway(mockModel(() => explainReply('Texto.')));
    await port.explain(inputOf('R01'));
    const prompt = promptText(model.doGenerateCalls[0] as never);
    expect(prompt).toContain('"value12Months": "R$ 28.316,52"');
    expect(prompt).toContain('"valuePerYear": "R$ 42.896,52"');
    expect(prompt).toContain('"margin": "1%"');
    expect(prompt).toContain('LC 123/2006, art. 18, § 5º-J');
    expect(prompt).not.toContain('2831652');
  });

  it.each(POISONED)(
    'poisoned $guard falls back to the template: $text',
    async ({ ruleId, text, guard }) => {
      const { port, logs } = gateway(mockModel(() => explainReply(text)));
      const input = inputOf(ruleId);
      const out = await port.explain(input);
      expect(out.origin).toBe('template');
      expect(out.text).toBe(templateExplanation(input.finding));
      expect(out.guards[guard]).toBe('failed');
      expect(logs.some((l) => l.event === 'ai.guard_failed' && l.ruleId === ruleId)).toBe(true);
    },
  );

  it('a declared ref id that is not the finding’s falls back (citation failed)', async () => {
    const { port } = gateway(mockModel(() => explainReply('Texto sem números.', ['lc999/art1'])));
    const out = await port.explain(inputOf('R01'));
    expect(out).toMatchObject({ origin: 'template', guards: { citation: 'failed' } });
  });

  it('output outside the schema is discarded (TESTS §3.5)', async () => {
    for (const reply of ['{"texto":"x"}', 'not json', '{"text":"","citedRefIds":[]}']) {
      const { port, logs } = gateway(mockModel(() => reply));
      const out = await port.explain(inputOf('R05'));
      expect(out.origin, reply).toBe('template');
      expect(out.guards).toEqual({ numeric: 'not_applied', citation: 'not_applied' });
      expect(logs).toMatchObject([{ event: 'ai.call_failed', task: 'explain' }]);
    }
  });

  it('a throwing or stalled model never throws: template', async () => {
    const thrower = gateway(
      mockModel(() => {
        throw new Error('gateway down');
      }),
    );
    expect((await thrower.port.explain(inputOf('R02'))).origin).toBe('template');
    expect(thrower.logs).toMatchObject([{ event: 'ai.call_failed', code: 'AI_CALL_FAILED' }]);

    const stalled = gateway(stalledModel(), { budget: { ...DEFAULT_BUDGET, timeoutMs: 5 } });
    expect((await stalled.port.explain(inputOf('R02'))).origin).toBe('template');
    expect(stalled.logs).toMatchObject([{ event: 'ai.call_failed' }]);
  });

  it('a malformed input still gets an answer', async () => {
    const { port } = gateway(mockModel(() => explainReply('x')));
    const out = await port.explain({ finding: null, articles: [], audience: 'owner' } as never);
    expect(out).toMatchObject({ origin: 'template', text: 'Veja o cálculo em “Ver cálculo”.' });
    const titled = await port.explain({
      finding: { title: 'Título' },
      articles: [],
      audience: 'owner',
    } as never);
    expect(titled.text).toBe('Título');
  });

  it('personal data in the payload: the model is never called (rule 4)', async () => {
    const { port, model, logs } = gateway(mockModel(() => explainReply('x')));
    const input = inputOf('R01');
    const dirty: ExplanationInput = {
      ...input,
      finding: { ...input.finding, title: `Pró-labore de ${syntheticCpf(true)}` } as Finding,
    };
    const out = await port.explain(dirty);
    expect(out.origin).toBe('template');
    expect(model.doGenerateCalls).toHaveLength(0);
    expect(logs).toEqual([{ event: 'ai.pii_blocked', task: 'explain', count: 1 }]);
  });

  it('a recording is replayed before any call', async () => {
    const input = inputOf('R05');
    const text = 'Você pode pagar R$ 34.002,40 a menos nos próximos 12 meses.';
    const recordings: Recordings = {
      $format: 'refund.ai-recording/v1',
      persona: 'dev-exportador',
      engineVersion: '1',
      parametersVersion: '1',
      items: {
        [recordingKey('explain', input)]: {
          task: 'explain',
          ruleId: 'R05',
          origin: 'gateway',
          promptVersion: EXPLAIN_PROMPT_VERSION,
          model: 'anthropic/claude-sonnet-5.5',
          recordedAt: '2026-11-15T12:00:00-03:00',
          output: { text, citedRefIds: [] },
          guards: { numeric: 'ok', citation: 'ok' },
        },
      },
    };
    const { port, model } = gateway(
      mockModel(() => explainReply('x')),
      { recordings },
    );
    expect(await port.explain(input)).toMatchObject({ text, origin: 'recording' });
    expect(model.doGenerateCalls).toHaveLength(0);
  });
});

const tx = (over: Partial<LlmClassificationInput> = {}): LlmClassificationInput => ({
  transactionId: 't1',
  redactedDescription: 'PAG BOLETO PAPELARIA CENTRAL',
  amountCents: 12_345,
  direction: 'outflow',
  holder: 'PJ',
  method: 'BOLETO',
  counterpartyType: 'CNPJ',
  counterpartyCnae: null,
  allowedCategories: ['operating_expense', 'bank_fee', 'unclassified'],
  ...over,
});

describe('gateway classify', () => {
  it('keeps only answers about sent transactions, inside each one’s categories', async () => {
    const items = [
      { transactionId: 't1', category: 'operating_expense', confidence: 0.9, reason: 'Material.' },
      { transactionId: 't1', category: 'bank_fee', confidence: 0.9, reason: 'Duplicada.' },
      { transactionId: 't2', category: 'service_revenue', confidence: 0.99, reason: 'Fora.' },
      { transactionId: 'tX', category: 'bank_fee', confidence: 0.9, reason: 'Inventada.' },
      {
        transactionId: 't3',
        category: 'bank_fee',
        confidence: 0.7,
        reason: `ver ${syntheticEmail('fulano')}`,
      },
    ];
    const { port, model } = gateway(mockModel(() => JSON.stringify({ items })));
    const out = await port.classify([
      tx(),
      tx({ transactionId: 't2' }),
      tx({ transactionId: 't3', redactedDescription: `TARIFA ${syntheticCpf(true)}` }),
    ]);
    expect(out).toEqual([
      { transactionId: 't1', category: 'operating_expense', confidence: 0.9, reason: 'Material.' },
      { transactionId: 't3', category: 'bank_fee', confidence: 0.7, reason: 'ver [email]' },
    ]);
    const prompt = promptText(model.doGenerateCalls[0] as never);
    expect(prompt).toContain('TARIFA [doc]');
    expect(prompt).toContain('"amount": "R$ 123,45"');
    expect(model.doGenerateCalls[0]?.providerOptions).toEqual({
      gateway: {
        models: [...MODELS.classify.fallbacks],
        caching: 'auto',
        disallowPromptTraining: true,
      },
    });
  });

  it('budget: at most maxTransactionsPerAnalysis per port, then nothing is sent', async () => {
    const { port, model, logs } = gateway(
      mockModel(() => JSON.stringify({ items: [] })),
      { budget: { maxTransactionsPerAnalysis: 2, timeoutMs: 1000 } },
    );
    await port.classify([tx(), tx({ transactionId: 't2' }), tx({ transactionId: 't3' })]);
    expect(await port.classify([tx({ transactionId: 't4' })])).toEqual([]);
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(promptText(model.doGenerateCalls[0] as never)).not.toContain('"t3"');
    expect(logs.filter((l) => l.event === 'ai.budget_exhausted')).toEqual([
      { event: 'ai.budget_exhausted', dropped: 1 },
      { event: 'ai.budget_exhausted', dropped: 1 },
    ]);
  });

  it('errors and garbage become []', async () => {
    for (const reply of ['garbage', '{"items":[{"transactionId":"t1","category":"nope"}]}']) {
      const { port } = gateway(mockModel(() => reply));
      expect(await port.classify([tx()])).toEqual([]);
    }
    const thrower = gateway(
      mockModel(() => {
        throw new Error('down');
      }),
    );
    expect(await thrower.port.classify([tx()])).toEqual([]);
    expect(await thrower.port.classify(null as never)).toEqual([]);
  });

  it('a recorded classification is replayed and not sent again', async () => {
    const input = tx();
    const recordings: Recordings = {
      $format: 'refund.ai-recording/v1',
      persona: 'p',
      engineVersion: '1',
      parametersVersion: '1',
      items: {
        [recordingKey('classify', input)]: {
          task: 'classify',
          origin: 'gateway',
          promptVersion: 'classify@1',
          recordedAt: '2026-11-15T12:00:00-03:00',
          output: { category: 'operating_expense', confidence: 0.97, reason: 'Material.' },
        },
      },
    };
    const { port, model } = gateway(
      mockModel(() => JSON.stringify({ items: [] })),
      {
        recordings,
      },
    );
    expect(await port.classify([input])).toEqual([
      { transactionId: 't1', category: 'operating_expense', confidence: 0.97, reason: 'Material.' },
    ]);
    expect(model.doGenerateCalls).toHaveLength(0);
  });
});

describe('summarizeDiff (P1)', () => {
  const options = (model: ReturnType<typeof mockModel>): GatewayOptions => ({
    budget: DEFAULT_BUDGET,
    model: () => model,
  });

  it('returns the summary, or null on failure', async () => {
    const ok = mockModel(() =>
      JSON.stringify({ summary: 'Mudou o limite do MEI.', mayAffectCalculation: true }),
    );
    expect(await summarizeDiff('- R$ 81.000\n+ R$ 130.000', 'LC 123/2006', options(ok))).toEqual({
      summary: 'Mudou o limite do MEI.',
      mayAffectCalculation: true,
      model: 'claude-sonnet-5.5',
      promptVersion: 'summarize-diff@1',
    });
    expect(await summarizeDiff('x', 'y', options(mockModel(() => '{}')))).toBeNull();
  });

  it('the summary passes the guards against the diff itself (code review 16/11, MEDIUM 4)', async () => {
    const diff = '- R$ 81.000,00\n+ R$ 130.000,00 (LC 123/2006, art. 18-A, § 1º)';
    const reply = (summary: string) =>
      options(mockModel(() => JSON.stringify({ summary, mayAffectCalculation: true })));
    const ok = 'O limite do MEI passa de R$ 81 mil para R$ 130 mil (art. 18-A, § 1º).';
    expect((await summarizeDiff(diff, 'LC 123/2006', reply(ok)))?.summary).toBe(ok);
    const logs: AiLogEvent[] = [];
    const invented = {
      ...reply('O limite passa para R$ 150 mil.'),
      log: (e: AiLogEvent) => logs.push(e),
    };
    expect(await summarizeDiff(diff, 'LC 123/2006', invented)).toBeNull();
    expect(logs.at(-1)).toMatchObject({ event: 'ai.guard_failed', numeric: 'failed' });
    expect(await summarizeDiff(diff, 'LC 123/2006', reply('Veja a MP 1.303.'))).toBeNull();
  });
});

describe('classification reason (code review 16/11, MEDIUM 4)', () => {
  it('a reason with an amount, a percentage or a citation becomes the fixed text', () => {
    expect(safeReason('Compra de material de escritório.')).toBe(
      'Compra de material de escritório.',
    );
    for (const r of [
      'Economia de R$ 500,00.',
      '30% do faturamento.',
      'Dedutível pelo art. 18 da LC 123.',
    ])
      expect(safeReason(r), r).toBe(FALLBACK_REASON);
  });
});
