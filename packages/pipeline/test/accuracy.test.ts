// ENGINE-SPEC E.8 / TESTS §3.4 (blocking): accuracy against the hero's answer key, with the local fake LlmPort.
// (a) ≥ 98% on the transactions that go straight in; (b) 0 errors on transactions that move > R$ 1.000 of a
// finding (those go through a card, so they are measured after the F.2 answers).
import { describe, expect, it } from 'vitest';
import { FEEDS_FINDING } from '../src/index.ts';
import type { Classification } from '../src/types.ts';
import { answerKey, heroAnswered, idMap, run } from './helpers.ts';

const key = answerKey();
const ids = idMap();

function compare(classifications: Classification[]) {
  const byId = new Map(classifications.map((c) => [c.transactionId, c]));
  return key.transactions.map((k) => {
    const c = byId.get(ids.get(k.sourceId) ?? '');
    const labelOk = k.label === null || c?.ruleId === k.label;
    // `category: null` = no contract category fits (EXECUTION §9, E3/E9: the gym); then only the label counts.
    const categoryOk = k.category === null || c?.category === k.category;
    return { k, c, ok: c !== undefined && labelOk && categoryOk };
  });
}

describe('accuracy against the hero answer key (E.8)', () => {
  it('every persona transaction is classified, none by the LLM', async () => {
    const { result } = await run();
    expect(result.classifications).toHaveLength(key.transactions.length);
    expect(result.metrics.byOrigin).toEqual({ rule: 174, llm: 0, user: 0, unclassified: 0 });
  });

  it('(a) confirmation "no": ≥ 98% applied directly with the right label and category (measured: 100%)', async () => {
    const { result } = await run();
    const direct = compare(result.classifications).filter((r) => r.k.cardId === null);
    const correct = direct.filter((r) => r.ok && r.c?.status === 'applied');
    expect(direct.length).toBe(98);
    expect(correct.length / direct.length).toBeGreaterThanOrEqual(0.98);
    expect(correct.length).toBe(direct.length);
  });

  it('card transactions are suggested right and never applied before the answer', async () => {
    const { result } = await run();
    const carded = compare(result.classifications).filter((r) => r.k.cardId !== null);
    expect(carded.length).toBe(76); // 12 FX + 12 pró-labore + 12 distributions + 28 salary + 12 psychologist
    expect(carded.every((r) => r.c?.status === 'pending_confirmation')).toBe(true);
    expect(carded.filter((r) => !r.ok)).toEqual([]);
  });

  it('(b) after the F.2 answers: 0 errors on transactions above R$ 1.000 that feed a finding', async () => {
    const { result } = await heroAnswered();
    const rows = compare(result.classifications);
    const feeding = rows.filter(
      (r) =>
        r.k.amountCents !== 0 &&
        Math.abs(r.k.amountCents) > 100_000 &&
        r.k.category !== null &&
        FEEDS_FINDING.has(r.k.category),
    );
    expect(feeding.length).toBeGreaterThan(0);
    expect(feeding.filter((r) => !r.ok)).toEqual([]);
    expect(rows.filter((r) => !r.ok)).toEqual([]);
    const confirmed = rows.filter((r) => r.k.cardId !== null);
    expect(confirmed.every((r) => r.c?.status === 'confirmed' && r.c.origin === 'user')).toBe(true);
  });

  it('PF leg of a same-holder transfer: same_holder_transfer, so Σ by category counts the PJ leg only (§9, E3/E9)', async () => {
    const { result } = await heroAnswered();
    const byId = new Map(result.classifications.map((c) => [c.transactionId, c]));
    const sumOf = (category: string) =>
      key.transactions
        .filter((k) => byId.get(ids.get(k.sourceId) ?? '')?.category === category)
        .reduce((a, k) => a + Math.abs(k.amountCents), 0);
    expect(sumOf('profit_distribution')).toBe(27_900_000); // net PJ legs: 11 × 18.000 + 81.000
    expect(sumOf('pro_labore')).toBe(12 * 144_269);
    expect(sumOf('same_holder_transfer')).toBe(27_900_000 + 12 * 144_269); // the PF legs, outside every fact
  });
});
