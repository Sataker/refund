import { describe, expect, it } from 'vitest';
import { runDemoAnalysis } from '@/demo/analysis.ts';
import { demoPersona } from '@/demo/catalog.ts';
import { INITIAL_VIEW, reduceAnalysis } from './analysis-state.ts';

// Screen 4 folded from the hero's real /demo events: the A01 risk goes to the alerts area, never into the counter.
const hero = demoPersona('dev-exportador');
if (!hero) throw new Error('hero persona missing from the catalog');

describe('Screen 4 state with the A01 risk (ENGINE-SPEC D.7; IDENTITY-AND-UI §4.9)', () => {
  it('A01 is the last alert card, outside the total; the counter ends at the total', async () => {
    const { events } = await runDemoAnalysis(hero);
    const view = events.reduce((v, e, i) => reduceAnalysis(v, e, i + 1), INITIAL_VIEW);
    expect(view.cards.map((c) => `${c.kind}:${c.finding.ruleId}`)).toEqual([
      'finding:R01',
      'finding:R05',
      'finding:R05-REC',
      'alert:R02',
      'alert:A01',
    ]);
    const a01 = view.cards.find((c) => c.finding.ruleId === 'A01')?.finding;
    expect(a01).toMatchObject({ type: 'risk', countsInTotal: false, marginalValue12m: 0 });
    expect(a01?.refs[0]?.id).toBeDefined();
    expect(view.target).toBe(6231892);
    expect(view.total?.savings12m).toBe(6231892);
    expect(view.explanations.A01).toBeDefined();
    expect(view.status).toBe('done');
  });

  it('the A01 alert event alone moves no counter', () => {
    const before = { ...INITIAL_VIEW, target: 123 };
    const finding = { ruleId: 'A01', type: 'risk', countsInTotal: false } as never;
    const after = reduceAnalysis(before, { type: 'alert', finding }, 1);
    expect(after.target).toBe(123);
    expect(after.cards).toEqual([{ finding, kind: 'alert' }]);
  });

  it('H2: an estimated finding never enters the counter, only the confirmed cents do', () => {
    const t = (confirmed: number, estimated: number) => ({
      savings12m: confirmed + estimated,
      annualRegimeSavings: null,
      byConfidence: { confirmed, estimated, depends_on_regulation: 0 },
      recoveryRange: null,
    });
    const finding = { ruleId: 'R01', type: 'savings', countsInTotal: true } as never;
    const mid = reduceAnalysis(
      INITIAL_VIEW,
      { type: 'finding', finding, partialTotal: t(0, 2831652) } as never,
      1,
    );
    expect(mid.target).toBe(0);
    const end = reduceAnalysis(mid, { type: 'total', total: t(500, 2831652) } as never, 2);
    expect(end.target).toBe(500);
  });
});
