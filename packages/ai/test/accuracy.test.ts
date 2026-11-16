// TESTS §3.4: classification accuracy against the hero answer key with the real port in `recording` mode (the
// pipeline's own accuracy test uses a local fake port; this one runs what /demo runs).
import { FEEDS_FINDING } from '@refund/pipeline';
import { describe, expect, it } from 'vitest';
import { answerKey, deps, heroAnswered, idMap, run } from '../../pipeline/test/helpers.ts';
import { createLlmPort, recordingsFor } from '../src/index.ts';

const key = answerKey();
const ids = idMap();
const llm = () => createLlmPort({ mode: 'recording', recordings: recordingsFor('dev-exportador') });

type Result = Awaited<ReturnType<typeof run>>['result'];

function compare(result: Result) {
  const byId = new Map(result.classifications.map((c) => [c.transactionId, c]));
  return key.transactions.map((k) => {
    const c = byId.get(ids.get(k.sourceId) ?? '');
    const ok =
      c !== undefined &&
      (k.label === null || c.ruleId === k.label) &&
      (k.category === null || c.category === k.category);
    return { k, c, ok };
  });
}

describe('accuracy with the recording port (dev-exportador)', () => {
  it('(a) ≥ 98% of the transactions that go straight in are right', async () => {
    const { result } = await run(undefined, deps({ llm: llm() }));
    const direct = compare(result).filter((r) => r.k.cardId === null);
    const correct = direct.filter((r) => r.ok && r.c?.status === 'applied');
    expect(correct.length / direct.length).toBeGreaterThanOrEqual(0.98);
  });

  it('(b) after the F.2 answers: 0 errors on transactions above R$ 1.000 that feed a finding', async () => {
    const { result } = await heroAnswered(deps({ llm: llm() }));
    const feeding = compare(result).filter(
      (r) =>
        Math.abs(r.k.amountCents) > 100_000 &&
        r.k.category !== null &&
        FEEDS_FINDING.has(r.k.category),
    );
    expect(feeding.length).toBeGreaterThan(0);
    expect(feeding.filter((r) => !r.ok)).toEqual([]);
  });

  it('A5 policy: nothing from the model that feeds a finding is applied without a card', async () => {
    const { result } = await run(undefined, deps({ llm: llm() }));
    expect(
      result.classifications.filter(
        (c) => c.origin === 'llm' && FEEDS_FINDING.has(c.category) && c.status === 'applied',
      ),
    ).toEqual([]);
  });
});
