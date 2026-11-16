import { describe, expect, it } from 'vitest';
import { percentToRate, runDemoAnalysis } from './analysis.ts';
import { answersKey, effectiveAnswers, fromQuery, toQuery } from './answers.ts';
import { DEMO_PERSONAS, demoPersona, transactionCount } from './catalog.ts';
import { estimateTable, profileQuestions } from './estimates.ts';

// E12 (EXECUTION): the /demo data path. Numbers from ENGINE-SPEC F.4 and C.11 (T11-02, T11-09).

const hero = demoPersona('dev-exportador');
if (!hero) throw new Error('hero persona missing from the catalog');

describe('catalog', () => {
  it('has exactly one hero, the dev-exportador (ARCHITECTURE §7.5)', () => {
    expect(DEMO_PERSONAS.filter((p) => p.hero).map((p) => p.id)).toEqual(['dev-exportador']);
    expect(demoPersona('nope')).toBeUndefined();
  });

  it('counts the persona transactions per holder', () => {
    expect(transactionCount(hero)).toBe(174);
    expect(transactionCount(hero, 'PJ') + transactionCount(hero, 'PF')).toBe(174);
  });
});

describe('demo analysis (real pipeline, template port, persona answers)', () => {
  it('ends at the video number with every card answered and no error event', async () => {
    const { events, result } = await runDemoAnalysis(hero);
    expect(result.engineResult?.total.savings12m).toBe(6231892);
    expect(result.engineResult?.total.annualRegimeSavings).toBe(7400628);
    expect(result.engineResult?.total.recoveryRange).toEqual([3978768, 19893840]);
    expect(events.some((e) => e.type === 'error')).toBe(false);
    expect(events[0]?.type).toBe('start');
    expect(events.at(-1)).toMatchObject({ type: 'end', status: 'completed' });
    const partials = events.flatMap((e) =>
      e.type === 'finding' ? [e.partialTotal.savings12m] : [],
    );
    expect(partials.at(-1)).toBe(6231892);
    expect(partials).toEqual([...partials].sort((a, b) => a - b));
  });

  it('runs with the PJ accounts only, without failing', async () => {
    const { events, result } = await runDemoAnalysis(hero, 'pj');
    expect(events.at(-1)?.type).toBe('end');
    expect(result.metrics.transactions).toBe(transactionCount(hero, 'PJ'));
  });

  it('reads the Selic of the SGS fixture as a decimal rate', () => {
    expect(percentToRate('15.00')).toBe('0.15');
    expect(percentToRate('5.5')).toBe('0.055');
    expect(percentToRate('100')).toBe('1');
    expect(percentToRate('x')).toBeNull();
  });
});

describe('profile estimate table (computed at build)', () => {
  const table = estimateTable(hero);
  if (!table.ok) throw new Error(table.error.message);
  const variant = (a: Parameters<typeof answersKey>[0]) =>
    table.value.variants.find((v) => v.id === table.value.index[answersKey(a)])?.estimate;

  it('covers the 96 answer combinations', () => {
    expect(Object.keys(table.value.index)).toHaveLength(96);
  });

  it('hero pre-selected answers: [12.463,38; 90.779,28] (T11-09)', () => {
    const e = variant(hero.profileAnswers);
    expect(e?.type).toBe('range');
    if (e?.type === 'range') expect(e.total).toEqual([1246338, 9077928]);
  });

  it('R$ 15 a 30 mil: no total, MINIMUM_BELOW_FLOOR (T11-02)', () => {
    const e = variant({ ...hero.profileAnswers, monthlyRevenueBracket: 'from_15k_to_30k' });
    expect(e).toMatchObject({ type: 'no_range', reason: 'MINIMUM_BELOW_FLOOR' });
  });

  it('asks both optional questions for the hero CNAE', () => {
    expect(profileQuestions(hero.data.company)).toEqual({ employees: true, abroad: true });
  });
});

describe('track answers in the URL', () => {
  const base = { answers: hero.profileAnswers, pfSkipped: false };

  it('round-trips through the query string', () => {
    const changed = {
      answers: { ...hero.profileAnswers, monthlyRevenueBracket: 'from_15k_to_30k' as const },
      pfSkipped: true,
    };
    expect(fromQuery(toQuery(changed), base)).toEqual(changed);
  });

  it('ignores unknown values and keeps the persona answer', () => {
    expect(fromQuery('revenue=lots&abroad=no', base).answers).toEqual({
      ...hero.profileAnswers,
      receivesFromAbroad: 'no',
    });
  });

  it('answers a question that is not asked with dont_know (C.11.1)', () => {
    expect(effectiveAnswers(hero.profileAnswers, { employees: false, abroad: true })).toEqual({
      ...hero.profileAnswers,
      hasEmployees: 'dont_know',
    });
  });
});
