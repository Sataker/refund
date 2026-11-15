// Enzo's decisions on the open E9 points (PLAN §18, 15/11): D21 refund credits ask, D22 unanswered payroll =
// FGTS ÷ 8%, D23 cards ordered by their effect on the total.
import { describe, expect, it } from 'vitest';
import { applyRules, CARD, initial } from '../src/classify/index.ts';
import { plausibleAnswers, rankByEffect } from '../src/impact.ts';
import { buildQuestions } from '../src/questions.ts';
import { ruleContext, tx } from './build.ts';
import { heroAnswered, heroInput, run, sumSeries } from './helpers.ts';

describe('D21: a refund or redemption credit asks "Isso foi receita da empresa?"', () => {
  it('card text', () => {
    const t = tx({
      direction: 'inflow',
      description: 'RESGATE CDB',
      method: 'TED',
      cnpj: 'RFBANK01000100',
    });
    const hits = applyRules([t], ruleContext());
    const q = buildQuestions([initial(t, hits.get(t.id), undefined, false)], {
      regime: 'MEI',
      answers: new Map(),
    });
    expect(q[0]?.id).toMatch(/^reversal:/);
    expect(q[0]?.text).toBe('Isso foi receita da empresa?');
    expect(q[0]?.options.map((o) => o.value)).toEqual(['yes', 'no']);
  });
});

describe('D22: while the payroll card is unanswered, gross payroll = FGTS paid ÷ 0,08', () => {
  it('the hero without answers: 136.000,00 over 12 months, a visible assumption, R01 estimated', async () => {
    const { result } = await run(heroInput());
    const pay = result.facts?.cltPayroll.grossPay;
    expect(sumSeries(pay?.value ?? {})).toBe(13_600_000);
    expect(pay?.provenance.origin).toBe('default_assumption');
    expect(pay?.provenance.source).toMatch(/FGTS/);
    expect(pay?.value['2025-11']).toBe(1_020_000);
    expect(result.engineResult?.findings.find((f) => f.ruleId === 'R01')?.confidence).toBe(
      'estimated',
    );
  });

  it('the answered hero keeps the four numbers', async () => {
    const { result } = await heroAnswered();
    expect(result.engineResult?.total).toMatchObject({
      savings12m: 6231892,
      annualRegimeSavings: 7400628,
      recoveryRange: [3978768, 19893840],
    });
  });
});

describe('D23: cards ordered by their effect on the total', () => {
  it('the hero: payroll and pró-labore before the distribution, which moves nothing', async () => {
    const { result } = await run(heroInput());
    const ids = result.questions.map((q) => q.id);
    const at = (id: string) => ids.indexOf(id);
    expect(at(CARD.payrollGross)).toBeGreaterThanOrEqual(0);
    expect(at(CARD.payrollGross)).toBeLessThan(at(CARD.distribution));
    expect(at(CARD.proLaboreGross)).toBeLessThan(at(CARD.distribution));
    expect(result.questions.find((q) => q.id === CARD.distribution)?.estimatedImpact).toBe(0);
    // estimatedImpact = |Δ savings12m| of the card's most different plausible answer; desc order.
    const impacts = result.questions.map((q) => q.estimatedImpact ?? -1);
    expect(impacts).toEqual([...impacts].sort((a, b) => b - a));
    expect(result.questions.find((q) => q.id === CARD.export)?.estimatedImpact).toBeGreaterThan(0);
  });
});

describe('D23 fallback and plausible answers', () => {
  const q = (id: string, transactionIds: string[] = [], options = ['yes', 'no']) => ({
    id,
    type: 'transaction' as const,
    text: '',
    transactionIds,
    options: options.map((value) => ({ value, label: value })),
    estimatedImpact: null,
  });
  const cards = [
    q(CARD.distribution),
    q('health:k'),
    q(CARD.proLaboreGross),
    q('pgbl:k', [], ['pgbl', 'vgbl']),
  ];

  it('without a computable effect (null or a throw), the fixed priority decides', () => {
    const throwing = () => {
      throw new Error('x');
    };
    for (const totalWith of [() => null, throwing]) {
      const out = rankByEffect(cards, [], new Map(), totalWith);
      expect(out.map((c) => c.id)).toEqual([
        CARD.proLaboreGross,
        CARD.distribution,
        'health:k',
        'pgbl:k',
      ]);
      expect(out.every((c) => c.estimatedImpact === null)).toBe(true);
    }
  });

  it('ties on the effect break by money moved, then id', () => {
    const t1 = tx({ amountCents: 500 });
    const t2 = tx({ amountCents: 900 });
    const list = [t1, t2].map((t) => initial(t, undefined, undefined, false));
    const out = rankByEffect(
      [q('b:1', [t1.id]), q('a:1', [t2.id]), q('c:1', [t1.id])],
      list,
      new Map(),
      () => 7,
    );
    expect(out.map((c) => c.id)).toEqual(['a:1', 'b:1', 'c:1']);
    expect(out.map((c) => c.estimatedImpact)).toEqual([0, 0, 0]);
  });

  it('plausible answers per card kind', () => {
    expect(plausibleAnswers(q(CARD.proLaboreGross), [])).toEqual(['yes', 'no']);
    expect(plausibleAnswers(q(CARD.payrollGross), [])).toEqual([]);
    const s = tx({ amountCents: 454868, date: '2026-10-07' });
    expect(
      plausibleAnswers(q(CARD.payrollGross, [s.id]), [initial(s, undefined, undefined, false)]),
    ).toEqual([{ '2026-10': 454868 }]);
    expect(plausibleAnswers(q('health:k'), [])).toEqual([
      { beneficiary: 'holder', profession: 'physician' },
      'no',
    ]);
    expect(plausibleAnswers(q('education:k'), [])).toEqual(['holder', 'dependent']);
    expect(plausibleAnswers(q('das:2026-08', [], ['t1', 't2', 'all']), [])).toEqual([
      't1',
      't2',
      'all',
    ]);
  });
});
