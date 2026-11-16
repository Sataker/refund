// TESTS §3.5 "recordings complete" (blocking) and ARCHITECTURE §7.4: for each persona, replaying the pipeline finds
// a recording for every explanation, shows exactly it, and the file holds nothing stale.
import { ENGINE_VERSION, type Finding, PARAMETERS_VERSION } from '@refund/engine';
import type { ExplanationInput } from '@refund/pipeline';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createLlmPort,
  EXPLAIN_PROMPT_VERSION,
  emptyRecordings,
  parseRecordings,
  RECORDINGS,
  type RecordingItem,
  type Recordings,
  recordingKey,
  recordingsFor,
  stableStringify,
  TEMPLATE_VERSION,
  templateExplanation,
} from '../src/index.ts';
import { explanationInputs, findingsOf, type HeroRuns, heroRuns } from './hero.ts';

const hero = recordingsFor('dev-exportador');
let replayed: HeroRuns;
let inputs: ExplanationInput[];
beforeAll(async () => {
  replayed = await heroRuns(createLlmPort({ mode: 'recording', recordings: hero }));
  inputs = [...explanationInputs(replayed.unanswered), ...explanationInputs(replayed.answered)];
}, 60_000);

describe('recordings-complete (dev-exportador)', () => {
  it('the bundled file is valid and stamped with the current engine and parameters', () => {
    expect(RECORDINGS['dev-exportador']).toBe(hero);
    expect(Object.keys(hero.items).length).toBeGreaterThan(0);
    expect(hero.engineVersion).toBe(ENGINE_VERSION);
    expect(hero.parametersVersion).toBe(PARAMETERS_VERSION);
  });

  it('zero missing recordings: every explanation /demo asks for is recorded', () => {
    const missing = inputs
      .filter((i) => hero.items[recordingKey('explain', i)] === undefined)
      .map((i) => i.finding.ruleId);
    expect(missing, 'run `pnpm ai:record` (or `pnpm ai:record --template`)').toEqual([]);
  });

  it('zero stale recordings: every recorded key is still asked for', () => {
    const asked = new Set(inputs.map((i) => recordingKey('explain', i)));
    expect(Object.keys(hero.items).filter((k) => !asked.has(k))).toEqual([]);
  });

  it('the replay shows exactly the recording (never a fallback when one exists)', () => {
    for (const r of [replayed.unanswered, replayed.answered]) {
      for (const f of findingsOf(r)) {
        const input = explanationInputs(r).find((i) => i.finding.ruleId === f.ruleId);
        const item = hero.items[recordingKey('explain', input as ExplanationInput)];
        if (item?.task !== 'explain') throw new Error(`no explain item for ${f.ruleId}`);
        const shown = r.explanations[f.ruleId];
        expect(shown?.text).toBe(item.output.text);
        expect(shown?.origin).toBe(item.origin === 'gateway' ? 'recording' : 'template');
        expect(shown?.promptVersion).toBe(item.promptVersion);
      }
    }
  });

  it('every recorded text passes both guards; template items are the template itself', () => {
    for (const input of inputs) {
      const item = hero.items[recordingKey('explain', input)] as RecordingItem;
      if (item.task !== 'explain') throw new Error('not explain');
      expect(item.guards).toEqual({ numeric: 'ok', citation: 'ok' });
      if (item.origin === 'template') {
        expect(item.promptVersion).toBe(TEMPLATE_VERSION);
        expect(item.output.text).toBe(templateExplanation(input.finding, input.audience));
      } else {
        expect(item.promptVersion).toBe(EXPLAIN_PROMPT_VERSION);
      }
    }
  });

  it('the hero numbers appear only as the engine has them (6.231.892 total; R01 + R05 marginals)', () => {
    const answered = findingsOf(replayed.answered);
    const sum = answered.filter((f) => f.countsInTotal).reduce((a, f) => a + f.marginalValue12m, 0);
    expect(sum).toBe(6_231_892);
    expect(replayed.answered.engineResult?.total.annualRegimeSavings).toBe(7_400_628);
    const r02 = answered.find((f) => f.ruleId === 'R02') as Finding;
    expect(replayed.answered.explanations.R02?.text).toContain('R$ 1.111,70');
    expect(r02.marginalValue12m).toBe(111_170);
    const rec = replayed.answered.explanations['R05-REC']?.text;
    expect(rec).toContain('R$ 39.787,68');
    expect(rec).toContain('R$ 198.938,40');
  });
});

describe('a stale number misses the recording (ARCHITECTURE §5.4)', () => {
  it('an engine change in one cent changes the key and the replay falls back to the template', async () => {
    const input = inputs.find((i) => i.finding.ruleId === 'R01') as ExplanationInput;
    const moved: ExplanationInput = {
      ...input,
      finding: {
        ...input.finding,
        marginalValue12m: (input.finding.marginalValue12m + 1) as never,
      },
    };
    expect(recordingKey('explain', moved)).not.toBe(recordingKey('explain', input));
    const out = await createLlmPort({ mode: 'recording', recordings: hero }).explain(moved);
    expect(out).toMatchObject({ origin: 'template', text: templateExplanation(moved.finding) });
  });
});

describe('recording port', () => {
  const r01 = () => inputs.find((i) => i.finding.ruleId === 'R01') as ExplanationInput;
  const withItem = (key: string, item: RecordingItem): Recordings => ({
    ...emptyRecordings('x'),
    items: { [key]: item },
  });

  it('a hand-edited recording with a number outside the trace is not shown', async () => {
    const input = r01();
    const recordings = withItem(recordingKey('explain', input), {
      task: 'explain',
      ruleId: 'R01',
      origin: 'gateway',
      promptVersion: EXPLAIN_PROMPT_VERSION,
      model: 'anthropic/claude-sonnet-5.5',
      recordedAt: '2026-11-15T12:00:00-03:00',
      // The rendered text looks fine; the slotted source (what replay trusts) holds a number of its own.
      output: { text: 'Você economiza R$ 28.316,52.', source: 'Você economiza R$ 99.999,00.' },
      guards: { numeric: 'ok', citation: 'ok' },
    });
    const out = await createLlmPort({ mode: 'recording', recordings }).explain(input);
    expect(out).toMatchObject({ origin: 'template', guards: { numeric: 'failed' } });
  });

  it('a gateway recording replays with origin "recording" and its model', async () => {
    const input = r01();
    // The lead is ours; the recording holds only the model's continuation.
    const source = 'Para isso, o pró-labore sobe para {{proLaboreTarget}} por mês.';
    const text =
      'Você pode pagar R$ 28.316,52 a menos nos próximos 12 meses, dentro da lei, subindo seu pró-labore para R$ 2.260,00 por mês. ' +
      'Para isso, o pró-labore sobe para R$ 2.260,00 por mês.';
    const recordings = withItem(recordingKey('explain', input), {
      task: 'explain',
      ruleId: 'R01',
      origin: 'gateway',
      promptVersion: EXPLAIN_PROMPT_VERSION,
      model: 'anthropic/claude-sonnet-5.5',
      recordedAt: '2026-11-15T12:00:00-03:00',
      output: { text: 'stale text', source },
      guards: { numeric: 'ok', citation: 'ok' },
    });
    expect(await createLlmPort({ mode: 'recording', recordings }).explain(input)).toEqual({
      text,
      origin: 'recording',
      guards: { numeric: 'ok', citation: 'ok' },
      model: 'anthropic/claude-sonnet-5.5',
      promptVersion: EXPLAIN_PROMPT_VERSION,
    });
  });

  it('classification: replayed only while its category is still allowed; never throws', async () => {
    const t = {
      transactionId: 't1',
      redactedDescription: 'X',
      amountCents: 100,
      direction: 'outflow' as const,
      holder: 'PJ' as const,
      method: 'PIX',
      counterpartyType: null,
      counterpartyCnae: null,
      allowedCategories: ['operating_expense' as const, 'unclassified' as const],
    };
    const recordings = withItem(recordingKey('classify', t), {
      task: 'classify',
      origin: 'gateway',
      promptVersion: 'classify@1',
      recordedAt: '2026-11-15T12:00:00-03:00',
      output: { category: 'operating_expense', confidence: 0.97, reason: 'Material.' },
    });
    const port = createLlmPort({ mode: 'recording', recordings });
    expect(await port.classify([t, { ...t, transactionId: 't2' }])).toEqual([
      { transactionId: 't1', category: 'operating_expense', confidence: 0.97, reason: 'Material.' },
    ]);
    const narrowed = { ...t, allowedCategories: ['unclassified' as const] };
    expect(await port.classify([narrowed])).toEqual([]);
    expect(await port.classify(null as never)).toEqual([]);
    expect(
      (await port.explain({ finding: null, articles: [], audience: 'owner' } as never)).origin,
    ).toBe('template');
  });

  it('an invalid file is read as empty; an unknown persona has no recordings', () => {
    expect(parseRecordings({ items: 3 }, 'p')).toEqual(emptyRecordings('p'));
    expect(recordingsFor('nobody')).toEqual(emptyRecordings('nobody'));
  });

  it('stableStringify ignores key order and undefined', () => {
    expect(stableStringify({ b: 1, a: [undefined, { d: undefined, c: 'x' }] })).toBe(
      stableStringify({ a: [null, { c: 'x' }], b: 1 }),
    );
  });
});
