import type { SourceTransaction } from '@refund/sources';
import { describe, expect, it } from 'vitest';
import {
  type AnalysisEvent,
  type AnalysisInput,
  type LlmClassificationInput,
  type LlmClassificationOutput,
  runAnalysis,
  toSseFrame,
} from '../src/index.ts';
import { deps, drain, heroAnswered, heroInput, persona, run, templatePort } from './helpers.ts';

const tag = (e: AnalysisEvent) =>
  e.type === 'stage'
    ? `stage:${e.stage}:${e.status}`
    : e.type === 'finding' || e.type === 'alert'
      ? `${e.type}:${e.finding.ruleId}`
      : e.type === 'explanation'
        ? `explanation:${e.ruleId}`
        : e.type === 'question'
          ? 'question'
          : e.type;

/** Extra PJ transactions no rule knows (left for the LlmPort). Not in the answer key; they move no fact. */
function unknowns(): SourceTransaction[] {
  const pj = persona().items.find((i) => i.holder === 'PJ')?.accounts[0]?.account.sourceId ?? '';
  const base = {
    accountSourceId: pj,
    pluggyType: 'DEBIT' as const,
    method: 'BOLETO' as const,
    sourceCategory: null,
    counterparty: null,
    mcc: null,
    installment: null,
  };
  return [
    {
      ...base,
      sourceId: 'x-1',
      date: '2026-10-15',
      amountCents: -35000,
      description: 'PAGAMENTO FORNECEDOR NUVEM',
    },
    {
      ...base,
      sourceId: 'x-2',
      date: '2026-10-16',
      amountCents: -12000,
      description: 'PAGAMENTO CONTABILIDADE',
    },
    {
      ...base,
      sourceId: 'x-3',
      date: '2026-10-17',
      amountCents: -8000,
      description: 'COMPRA DIVERSA',
    },
    {
      ...base,
      sourceId: 'x-4',
      date: '2026-10-18',
      amountCents: 25000,
      pluggyType: 'CREDIT',
      description: 'CREDITO DIVERSO',
    },
  ];
}

/** ENGINE-SPEC F.2 "Cards answered (all yes)". */
const F2_ANSWERS = (await heroAnswered()).answers;

const withUnknowns = (answers: AnalysisInput['answers'] = []) =>
  heroInput({
    answers,
    transactions: [...(heroInput().transactions as SourceTransaction[]), ...unknowns()],
  });

describe('event order (ARCHITECTURE §4.4, locked)', () => {
  it('the hero with the F.2 answers', async () => {
    const { events } = await heroAnswered();
    expect(events.map(tag)).toEqual([
      'start',
      'stage:normalization:started',
      'transaction_sample',
      'stage:normalization:completed',
      'stage:classification:started',
      'classification_summary',
      'stage:classification:completed',
      'stage:facts:started',
      'facts_summary',
      'stage:facts:completed',
      'stage:rules:started',
      'finding:R01',
      'finding:R05',
      'finding:R05-REC',
      'alert:R02',
      'total',
      'stage:rules:completed',
      'stage:explanation:started',
      'explanation:R01',
      'explanation:R05',
      'explanation:R05-REC',
      'explanation:R02',
      'stage:explanation:completed',
      'end',
    ]);
    expect(events.at(-1)).toMatchObject({ type: 'end', status: 'completed' });
  });

  it('without answers: the 9 F.2 cards come after the summary, by effect on the total (D23), and the run awaits them', async () => {
    const { events, result } = await run();
    const tags = events.map(tag);
    const first = tags.indexOf('question');
    expect(tags.slice(first - 1, first)).toEqual(['stage:classification:completed']);
    expect(tags.slice(first + 9, first + 10)).toEqual(['stage:facts:started']);
    const questions = events.flatMap((e) => (e.type === 'question' ? [e.question] : []));
    // D23: by effect on the total (export 34.002,40; pró-labore; payroll), then ties by money moved, then id.
    expect(questions.map((q) => q.id.split(':')[0])).toEqual([
      'export-qualification',
      'pro-labore-gross',
      'clt-payroll-gross',
      'monthly-distribution',
      'clt-employee',
      'clt-employee',
      'health',
      'full-bookkeeping',
      'partner-works-in-company',
    ]);
    expect(questions.map((q) => q.estimatedImpact)).toEqual([
      3400240, 2765472, 2364108, 0, 0, 0, 0, 0, 0,
    ]);
    const impacts = questions.map((q) => q.estimatedImpact ?? -1);
    expect(impacts).toEqual([...impacts].sort((a, b) => b - a));
    expect(questions.find((q) => q.id === 'pro-labore-gross')?.text).toBe(
      'Seu pró-labore bruto é R$ 1.621,00 por mês?',
    );
    expect(result.questions).toEqual(questions);
    expect(events.at(-1)).toMatchObject({ type: 'end', status: 'awaiting_confirmation' });
  });

  it('start, sample and summary', async () => {
    const { events } = await heroAnswered();
    expect(events[0]).toMatchObject({
      type: 'start',
      origin: 'demo',
      persona: 'dev-exportador',
      accounts: { pf: 1, pj: 2 },
      startedAt: '2026-11-12T15:00:00.000Z',
    });
    const sample = events.find((e) => e.type === 'transaction_sample');
    if (sample?.type !== 'transaction_sample') throw new Error('sample');
    expect(sample.items).toHaveLength(8);
    expect(JSON.stringify(sample.items)).not.toMatch(/\d{3}\.\d{3}/); // masked
    expect(events.find((e) => e.type === 'classification_summary')).toEqual({
      type: 'classification_summary',
      total: 174,
      byOrigin: { rule: 98, llm: 0, user: 76 },
      pending: 0,
      unclassified: 0,
    });
  });

  it('a live run says origin live and omits the persona', async () => {
    const { events } = await run(heroInput({ analysisId: 'live:1', persona: undefined as never }));
    expect(events[0]).toMatchObject({ type: 'start', origin: 'live' });
  });

  it('is deterministic (same events, same result)', async () => {
    const a = await heroAnswered();
    const b = await heroAnswered();
    expect(JSON.stringify(b.events)).toBe(JSON.stringify(a.events));
    expect(b.result.engineResult?.inputsHash).toBe(a.result.engineResult?.inputsHash);
  });
});

describe('A5 policy and the LlmPort (TESTS §3.4)', () => {
  const answering = (
    pick: (i: LlmClassificationInput) => Partial<LlmClassificationOutput> | unknown,
  ) =>
    templatePort({
      classify: async (batch) =>
        batch.map((i) => ({
          transactionId: i.transactionId,
          reason: 'r',
          ...(pick(i) as object),
        })) as LlmClassificationOutput[],
    });

  it('only leftovers go to the model, redacted and with the allowed categories', async () => {
    const seen: LlmClassificationInput[] = [];
    await run(
      withUnknowns(),
      deps({
        llm: templatePort({
          classify: async (b) => {
            seen.push(...b);
            return [];
          },
        }),
      }),
    );
    expect(seen.map((s) => s.redactedDescription)).toEqual([
      'PAGAMENTO FORNECEDOR NUVEM',
      'PAGAMENTO CONTABILIDADE',
      'COMPRA DIVERSA',
      'CREDITO DIVERSO',
    ]);
    expect(seen[3]?.allowedCategories).toEqual([
      'service_revenue',
      'sales_revenue',
      'export_revenue',
      'financial_income',
      'unclassified',
    ]);
    expect(seen[0]?.allowedCategories).not.toContain('pro_labore');
  });

  it('an LLM category that feeds a finding is never applied: it becomes a card', async () => {
    const llm = answering((i) =>
      i.direction === 'inflow'
        ? { category: 'service_revenue', confidence: 0.99 }
        : i.amountCents === 35000
          ? { category: 'operating_expense', confidence: 0.97 }
          : i.amountCents === 12000
            ? { category: 'operating_expense', confidence: 0.8 }
            : { category: 'operating_expense', confidence: 0.4 },
    );
    const { result, events } = await run(withUnknowns(F2_ANSWERS), deps({ llm }));
    const llmOnes = result.classifications.filter((c) => c.origin === 'llm');
    expect(llmOnes.map((c) => [c.category, c.status])).toEqual([
      ['operating_expense', 'applied'],
      ['operating_expense', 'pending_confirmation'],
      ['unclassified', 'unclassified'],
      ['service_revenue', 'pending_confirmation'],
    ]);
    const policyBreach = result.classifications.filter(
      (c) =>
        c.origin === 'llm' &&
        c.status === 'applied' &&
        ['service_revenue', 'export_revenue', 'pro_labore', 'salary'].includes(c.category),
    );
    expect(policyBreach).toEqual([]);
    const questions = events.flatMap((e) => (e.type === 'question' ? [e.question.id] : []));
    expect(questions.filter((q) => q.startsWith('llm:'))).toHaveLength(2);
    // An unconfirmed guess moves no fact: the hero's total is unchanged.
    expect(result.engineResult?.total.savings12m).toBe(6231892);
  });

  it('answering the LLM card confirms it; a disallowed or out-of-range answer is dropped', async () => {
    const llm = answering((i) =>
      i.direction === 'inflow'
        ? { category: 'service_revenue', confidence: 0.99 }
        : i.amountCents === 35000
          ? { category: 'pro_labore', confidence: 0.99 }
          : { category: 'operating_expense', confidence: 7 },
    );
    const first = await run(withUnknowns(), deps({ llm }));
    const card = first.result.questions.find((q) => q.id.startsWith('llm:'));
    expect(card?.text).toMatch(/são receita de serviço\?$/);
    const second = await run(
      withUnknowns([{ questionId: card?.id ?? '', value: 'yes' }]),
      deps({ llm }),
    );
    const confirmed = second.result.classifications.find(
      (c) => c.transactionId === card?.transactionIds[0],
    );
    expect(confirmed).toMatchObject({
      category: 'service_revenue',
      status: 'confirmed',
      origin: 'user',
    });
    expect(second.result.classifications.filter((c) => c.status === 'unclassified')).toHaveLength(
      3,
    );
  });

  it.each([
    [
      'throws',
      templatePort({
        classify: () => Promise.reject(new Error('boom')),
        explain: () => Promise.reject(new Error('boom')),
      }),
    ],
    [
      'stalls',
      templatePort({ classify: () => new Promise(() => {}), explain: () => new Promise(() => {}) }),
    ],
    [
      'returns garbage',
      templatePort({
        classify: async () => 'nope' as never,
        explain: async () => ({ text: 3 }) as never,
      }),
    ],
    [
      'returns junk items',
      templatePort({
        classify: async () =>
          [null, 7, { transactionId: 'unknown', category: 'bank_fee', confidence: 1 }] as never,
      }),
    ],
  ])(
    'an LlmPort that %s: the analysis completes, explanations fall back to the template',
    async (_name, llm) => {
      const { events, result } = await run(
        withUnknowns(F2_ANSWERS),
        deps({ llm, llmTimeoutMs: 5 }),
      );
      expect(events.at(-1)?.type).toBe('end');
      expect(result.engineResult?.total.savings12m).toBe(6231892);
      expect(result.metrics.byOrigin.unclassified).toBe(4);
      const explanations = events.flatMap((e) => (e.type === 'explanation' ? [e.origin] : []));
      expect(explanations).toHaveLength(4);
    },
  );
});

describe('errors (ARCHITECTURE §4.6: what was sent stays)', () => {
  it('an engine error becomes an error event and the run still ends', async () => {
    const input = heroInput({
      userAssumptions: { nope: { value: 1, origin: 'user', editable: true, source: 'test' } },
    });
    const { events, result } = await run(input);
    const tags = events.map(tag);
    expect(tags.slice(-3)).toEqual(['stage:rules:started', 'error', 'end']);
    expect(events.at(-2)).toMatchObject({
      type: 'error',
      code: 'UNKNOWN_ASSUMPTION',
      stage: 'rules',
    });
    expect(result.engineResult).toBeNull();
    expect(result.facts).not.toBeNull();
  });

  it('a CNAE outside E.4 stops before the engine (CNAE_OUT_OF_SCOPE), never guessing an anexo', async () => {
    const data = persona();
    data.company.primaryCnae = { code: '4520-0/01', description: 'Oficina' };
    const { events, result } = await run(heroInput({}, data));
    expect(events.at(-2)).toMatchObject({
      type: 'error',
      code: 'CNAE_OUT_OF_SCOPE',
      recoverable: false,
      stage: 'facts',
    });
    expect(result.facts).toBeNull();
  });

  it('an unexpected failure after the findings keeps them and ends with a recoverable error', async () => {
    const { events } = await heroAnswered(
      deps({
        article: () => {
          throw new Error('corpus down');
        },
      }),
    );
    const tags = events.map(tag);
    expect(tags).toContain('total');
    expect(tags.slice(-3)).toEqual(['stage:explanation:started', 'error', 'end']);
    expect(events.at(-2)).toMatchObject({ code: 'PIPELINE_FAILED', recoverable: true });
  });
});

describe('input as pages and pacing', () => {
  it('reads an async iterable, reports progress every 200 and skips what cannot be normalized', async () => {
    const all = heroInput().transactions as SourceTransaction[];
    const broken = Array.from(
      { length: 30 },
      (_, i) =>
        ({ ...unknowns()[0], sourceId: `b-${i}`, accountSourceId: 'unknown' }) as SourceTransaction,
    );
    async function* pages() {
      for (let i = 0; i < all.length; i += 50) yield all.slice(i, i + 50);
      yield broken;
      yield all.slice(0, 10); // a repeated page is not counted twice
    }
    const { events, result } = await run(heroInput({ transactions: pages(), answers: F2_ANSWERS }));
    const progress = events.filter(
      (e) => e.type === 'stage' && e.progress !== undefined && e.status === 'started',
    );
    expect(progress).toHaveLength(1);
    expect(result.metrics.transactions).toBe(174);
    expect(result.engineResult?.total.savings12m).toBe(6231892);
  });

  it('pace only changes the waits: scripted ≈ 8 s, fast shorter, instant none', async () => {
    const answers = F2_ANSWERS;
    const waited = async (pace: 'instant' | 'fast' | 'scripted') => {
      const waits: number[] = [];
      const { result } = await drain(
        runAnalysis(
          heroInput({ answers }),
          deps({ pace, wait: async (ms) => void waits.push(ms) }),
        ),
      );
      return {
        total: waits.reduce((a, b) => a + b, 0),
        count: waits.length,
        savings: result.engineResult?.total.savings12m,
      };
    };
    const scripted = await waited('scripted');
    const fast = await waited('fast');
    const instant = await waited('instant');
    expect(scripted.total).toBeGreaterThanOrEqual(7000);
    expect(scripted.total).toBeLessThanOrEqual(9000);
    expect(fast.total).toBeLessThan(scripted.total);
    expect(instant.count).toBe(0);
    expect(new Set([scripted.savings, fast.savings, instant.savings])).toEqual(new Set([6231892]));
  });

  it('the default wait is a real timer (used by the route handler)', async () => {
    const { defaultWait } = await import('../src/pace.ts');
    await expect(defaultWait(1)).resolves.toBeUndefined();
  });
});

describe('SSE wire (ARCHITECTURE §4.6)', () => {
  it('frames carry id, event and the JSON of the event', () => {
    expect(toSseFrame({ type: 'ping' }, 17)).toBe('id: 17\nevent: ping\ndata: {"type":"ping"}\n\n');
  });
});
