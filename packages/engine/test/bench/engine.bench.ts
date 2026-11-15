// TESTS §2.5 (non-blocking report): recalculate() for the hero, p95 ≤ 16 ms (ARCHITECTURE §11.1, the slider in the
// browser); estimateByProfile() for the hero's answers and for the 45-scenario worst case, p95 ≤ 1,5 s (C.11.8).
// Vitest 5 benchmarks run through the test context (`bench().run()`); the projects get a " (bench)" suffix:
//   pnpm vitest bench --run --project 'unit (bench)' packages/engine
import { test } from 'vitest';
import { recalculate } from '../../src/analyze.ts';
import { estimateByProfile } from '../../src/profile.ts';
import type { Facts } from '../../src/types.ts';
import { HERO_ASSUMPTIONS, heroFacts } from '../golden/fixtures/facts.ts';
import { HERO_ANSWERS, HERO_PROFILE } from '../golden/fixtures/profile.ts';

const facts = heroFacts();
const slider: Facts['assumptions'] = {
  ...HERO_ASSUMPTIONS,
  fatorRMargin: { value: '0.02', origin: 'user', editable: true, source: 'slider' },
};
const WORST_CASE = {
  monthlyRevenueBracket: 'from_150k_to_300k',
  hasEmployees: 'dont_know',
  receivesFromAbroad: 'dont_know',
} as const;

test('recalculate(): hero, default assumptions and the margin slider (target p95 ≤ 16 ms)', async ({
  bench,
}) => {
  await bench.compare(
    bench('recalculate hero, defaults', () => {
      recalculate(facts, HERO_ASSUMPTIONS);
    }),
    bench('recalculate hero, margin 2 p.p.', () => {
      recalculate(facts, slider);
    }),
  );
});

test('estimateByProfile(): hero answers (27 scenarios) and the 45-scenario worst case (target p95 ≤ 1,5 s)', async ({
  bench,
}) => {
  await bench.compare(
    bench('estimateByProfile hero', () => {
      estimateByProfile(HERO_PROFILE, HERO_ANSWERS, { analysisDate: '2026-11-12' });
    }),
    bench('estimateByProfile worst case', () => {
      estimateByProfile(HERO_PROFILE, WORST_CASE, { analysisDate: '2026-11-12' });
    }),
    { iterations: 10, time: 0 },
  );
}, 120_000);
