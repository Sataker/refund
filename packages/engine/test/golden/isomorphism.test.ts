// @vitest-environment happy-dom
// TESTS §2.3, INV-7 (isomorphism): the engine runs in the browser. The sliders call recalculate() in a `.client.tsx`
// (ARCHITECTURE §7.3), so the hero, a recalculation and the profile-based estimate must give the same numbers under a
// DOM environment as under Node (hero.test.ts, profile.test.ts).
import { describe, expect, it } from 'vitest';
import { analyze, recalculate } from '../../src/analyze.ts';
import { estimateByProfile } from '../../src/profile.ts';
import { HERO_ASSUMPTIONS, heroFacts } from './fixtures/facts.ts';
import { HERO_ANSWERS, HERO_PROFILE } from './fixtures/profile.ts';

describe('INV-7: the engine under happy-dom', () => {
  it('runs in a browser-like environment (window and document exist)', () => {
    const g = globalThis as { window?: unknown; document?: unknown };
    expect(g.window).toBeDefined();
    expect(g.document).toBeDefined();
  });

  it('hero: 62.318,92 / 74.006,28 / [39.787,68; 198.938,40] / 1.111,70 (G1)', () => {
    const r = analyze(heroFacts());
    if (!r.ok) throw new Error(r.error.code);
    expect(r.value.total.savings12m).toBe(6231892);
    expect(r.value.total.annualRegimeSavings).toBe(7400628);
    expect(r.value.total.recoveryRange).toEqual([3978768, 19893840]);
    expect(r.value.findings.find((f) => f.ruleId === 'R02')?.marginalValue12m).toBe(111170);
  });

  it('recalculate() with the default assumptions equals analyze(), byte for byte', () => {
    const a = analyze(heroFacts());
    const b = recalculate(heroFacts(), HERO_ASSUMPTIONS);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('profile-based estimate: the hero minimum 12.463,38 and the same grid as under Node', () => {
    const r = estimateByProfile(HERO_PROFILE, HERO_ANSWERS, { analysisDate: '2026-11-12' });
    if (!r.ok) throw new Error(r.error.code);
    expect(r.value.type).toBe('range');
    if (r.value.type === 'range') expect(r.value.total[0]).toBe(1246338);
    expect(r.value.scenarios).toHaveLength(27);
  });
});
