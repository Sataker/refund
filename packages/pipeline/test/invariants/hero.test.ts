// Pipeline invariants (golden project, blocking; TESTS §2.3 and §3.4): the hero's numbers through the whole
// pipeline (gate G1), Σ marginals == total, the counter climbs exactly to the total, alerts and recovery outside it.
import { describe, expect, it } from 'vitest';
import type { AnalysisEvent, FindingDto, TotalDto } from '../../src/index.ts';
import { answerKey, heroAnswered } from '../helpers.ts';

const key = answerKey();
const { events, result } = await heroAnswered();
const findingEvents = events.filter(
  (e): e is Extract<AnalysisEvent, { type: 'finding' }> => e.type === 'finding',
);
const alertEvents = events.filter(
  (e): e is Extract<AnalysisEvent, { type: 'alert' }> => e.type === 'alert',
);
const totalEvent = events.find(
  (e): e is Extract<AnalysisEvent, { type: 'total' }> => e.type === 'total',
);
const sent: FindingDto[] = [
  ...findingEvents.map((e) => e.finding),
  ...alertEvents.map((e) => e.finding),
];

describe('hero through the pipeline (ENGINE-SPEC F.4; G1)', () => {
  it('the four locked numbers', () => {
    const total = totalEvent?.total as TotalDto;
    expect(total.savings12m).toBe(6231892);
    expect(total.annualRegimeSavings).toBe(7400628);
    expect(total.recoveryRange).toEqual([3978768, 19893840]);
    expect(sent.find((f) => f.ruleId === 'R02')?.marginalValue12m).toBe(111170);
    expect(total).toEqual(key.total);
  });

  it('each finding matches the answer key', () => {
    for (const want of key.expectedFindings) {
      const got = sent.find((f) => f.ruleId === want.ruleId);
      // A02/R03/R06 are engine rules of E8 that do not fire for the hero; A01 is checked like the others.
      if (!want.fires || ['A02', 'R03', 'R06'].includes(want.ruleId)) {
        if (!want.fires) expect(got, want.ruleId).toBeUndefined();
        continue;
      }
      expect(got, want.ruleId).toBeDefined();
      expect(got?.type).toBe(want.type);
      expect(got?.confidence).toBe(want.confidence);
      expect(got?.countsInTotal).toBe(want.countsInTotal);
      if (want.marginalValue12m !== null) expect(got?.marginalValue12m).toBe(want.marginalValue12m);
      if (want.annualRegimeValue !== null)
        expect(got?.annualRegimeValue).toBe(want.annualRegimeValue);
      if (want.range !== null) expect(got?.range).toEqual(want.range);
    }
  });
});

describe('invariants', () => {
  it('INV-1: Σ marginals of what counts == total.savings12m, to the cent', () => {
    const sum = sent.filter((f) => f.countsInTotal).reduce((a, f) => a + f.marginalValue12m, 0);
    expect(sum).toBe(totalEvent?.total.savings12m);
    const regime = sent
      .filter((f) => f.countsInTotal)
      .reduce((a, f) => a + (f.annualRegimeValue ?? 0), 0);
    expect(regime).toBe(totalEvent?.total.annualRegimeSavings);
  });

  it('the counter is monotonic and equals the total at the last finding', () => {
    const partials = findingEvents.map((e) => e.partialTotal.savings12m);
    expect(partials).toEqual([...partials].sort((a, b) => a - b));
    expect(findingEvents.at(-1)?.partialTotal).toEqual(totalEvent?.total);
  });

  it('INV-2/3: alerts, risks and recovery are outside the total; recovery is never confirmed and has a range', () => {
    for (const f of alertEvents.map((e) => e.finding)) {
      expect(['alert', 'risk']).toContain(f.type);
      expect(f.countsInTotal).toBe(false);
    }
    for (const f of sent.filter((x) => x.type === 'recovery')) {
      expect(f.countsInTotal).toBe(false);
      expect(f.confidence).not.toBe('confirmed');
      expect(f.range).toBeDefined();
    }
  });

  it('INV-4: each finding’s trace closes on its marginal value; the trace is sent unlocked', () => {
    for (const f of sent.filter((x) => x.type === 'savings')) {
      expect(f.traceLocked).toBe(false);
      expect(f.trace?.at(-1)?.result.value).toBe(f.marginalValue12m);
    }
  });

  it('the engine ran once and the events follow its order', () => {
    expect(result.engineResult?.findings.map((f) => f.ruleId)).toEqual(sent.map((f) => f.ruleId));
    const orders = findingEvents.map((e) => e.finding.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    const types = events.map((e) => e.type);
    expect(types.lastIndexOf('finding')).toBeLessThan(types.indexOf('alert'));
    expect(types.lastIndexOf('alert')).toBeLessThan(types.indexOf('total'));
    expect(types.indexOf('total')).toBeLessThan(types.indexOf('explanation'));
  });

  it('INV-6: determinism through the pipeline', async () => {
    const again = await heroAnswered();
    expect(again.result.engineResult?.inputsHash).toBe(result.engineResult?.inputsHash);
    expect(JSON.stringify(again.events)).toBe(JSON.stringify(events));
  });
});
