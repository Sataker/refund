import { recalculate } from '@refund/engine';
import { describe, expect, it } from 'vitest';
import { answersFromChoices, DONT_KNOW, isPersonaDefault } from '@/features/findings/confirm';
import {
  MARGIN_STEPS,
  marginOf,
  proLaborePoint,
  stepsByActor,
  traceSources,
  urgencyOf,
  urgencyText,
} from '@/features/findings/model';
import { recalculateDemo } from './recalculate.ts';
import { demoSnapshot, lawExcerpt, refIdsOf } from './snapshot.ts';

// E13 (EXECUTION): Screens 5–8 read the engine through the /demo snapshot. Hero numbers from ENGINE-SPEC F.4 and
// C.12.4 (T12-01, T12-02); D8 (slider back to default = exact original number) and D9 (cards recalculate).

async function hero() {
  const s = await demoSnapshot('dev-exportador');
  if (!s.ok) throw new Error(s.reason);
  return s.value;
}

describe('Screen 5 dashboard model (ENGINE-SPEC C.9, F.4)', () => {
  it('big number = confirmed 12-month savings; steady state apart; recovery never summed', async () => {
    const { dashboard: d } = await hero();
    expect(d.total).toBe(6231892);
    expect(d.annual).toBe(7400628);
    expect(d.regimeFrom).toBe('2027-04');
    expect(d.estimated).toBe(0);
    expect(d.recoveryRange).toEqual([3978768, 19893840]);
    expect(d.byHolder).toEqual({ PJ: 6231892, PF: 0 });
  });

  it('orders savings by R$ (R05 34.002,40 before R01 28.316,52) and keeps alerts out of the total', async () => {
    const { dashboard: d } = await hero();
    expect(d.savings.map((f) => [f.ruleId, f.cents])).toEqual([
      ['R05', 3400240],
      ['R01', 2831652],
    ]);
    expect(d.recovery.map((f) => [f.ruleId, f.range])).toEqual([['R05-REC', [3978768, 19893840]]]);
    expect(d.alerts.every((f) => !f.countsInTotal)).toBe(true);
    expect(d.alerts.find((f) => f.ruleId === 'R02')?.cents).toBe(111170);
    expect(d.savings.find((f) => f.ruleId === 'R01')?.firstEffect).toBe('2027-04');
    expect(d.savings.find((f) => f.ruleId === 'R05')?.firstEffect).toBe('2026-12');
  });

  it('urgency from the engine daysLeft: "1 mês prescreve em 11 dias" (C.12.4)', async () => {
    const { result, dashboard } = await hero();
    expect(dashboard.urgency).toEqual({ count: 1, days: 11 });
    expect(dashboard.urgency && urgencyText(dashboard.urgency)).toBe('1 mês prescreve em 11 dias');
    expect(urgencyText({ count: 3, days: 1 })).toBe('3 meses prescrevem em 1 dia');
    expect(urgencyOf([])).toBeNull();
    const rec = result.findings.find((f) => f.ruleId === 'R05-REC');
    expect(rec?.recoveryItems).toHaveLength(60);
  });
});

describe('Screen 6 and 6b', () => {
  it('trace numbers point to the facts provenance (D7)', async () => {
    const { result, facts, rows } = await hero();
    const r01 = result.findings.find((f) => f.ruleId === 'R01');
    if (!r01) throw new Error('R01 missing');
    const sources = traceSources(r01.trace, facts);
    expect(sources['R01.RBT12_REGIME']).toHaveLength(12);
    expect(sources['R01.FS12_WITHOUT_PRO_LABORE']).toHaveLength(40);
    for (const ids of Object.values(sources))
      for (const id of ids) expect(rows[id], id).toBeDefined();
  });

  it('every cited ref resolves to a verbatim excerpt of @refund/law', async () => {
    const { result } = await hero();
    for (const f of result.findings)
      for (const id of refIdsOf(f)) {
        const e = lawExcerpt(id);
        expect(e, id).not.toBeNull();
        expect(e?.url, id).toMatch(/^https?:\/\//);
        expect(e?.text, id).not.toBe('');
      }
  });

  it('report groups every step by who does it, in the engine order', async () => {
    const { result } = await hero();
    const groups = stepsByActor(result.findings);
    const all = groups.flatMap((g) => g.steps);
    expect(all).toHaveLength(result.findings.reduce((n, f) => n + f.actionPlan.length, 0));
    expect(groups.map((g) => g.who)).toEqual(['you', 'accountant', 'you_or_accountant']);
  });
});

describe('D8: the pró-labore simulator recalculates through the engine', () => {
  it('margin 0 → P_28 1.760,00; default margin gives back the exact snapshot', async () => {
    const { result, facts } = await hero();
    expect(MARGIN_STEPS).toContain(marginOf(facts));
    const base = proLaborePoint(result);
    expect(base).toEqual({
      target: 226000,
      current: 162100,
      value: 2831652,
      annual: 4289652,
      total: 6231892,
    });
    const at = (margin: string) => {
      const r = recalculate(facts, {
        ...facts.assumptions,
        fatorRMargin: { value: margin, origin: 'user', editable: true, source: 'slider' },
      });
      if (!r.ok) throw new Error(r.error.code);
      return r.value;
    };
    expect(proLaborePoint(at('0'))?.target).toBe(176000);
    expect(proLaborePoint(at('0.03'))?.target).not.toBe(226000);
    expect(JSON.stringify(at(marginOf(facts)).total)).toBe(JSON.stringify(result.total));
    expect(proLaborePoint(at(marginOf(facts)))).toEqual(base);
  });
});

describe('D9: Screen 7 cards and the recalculation', () => {
  it('lists the pipeline cards answered as the persona, impact first (D23)', async () => {
    const { cards } = await hero();
    expect(cards).toHaveLength(9);
    expect(cards[0]?.id).toBe('export-qualification');
    expect(cards.map((c) => c.impact)).toEqual(
      [...cards.map((c) => c.impact)].sort((a, b) => b - a),
    );
    expect(cards.every((c) => c.personaChoice !== DONT_KNOW)).toBe(true);
    expect(isPersonaDefault(cards, {})).toBe(true);
  });

  it('the persona answers give back the video number; "não" to the export card drops R05', async () => {
    const same = await recalculateDemo('dev-exportador', {});
    if (!same.ok) throw new Error(same.error);
    expect(same.value.dashboard.total).toBe(6231892);
    expect(same.value.open).toBe(0);

    const noExport = await recalculateDemo('dev-exportador', { 'export-qualification': 'no' });
    if (!noExport.ok) throw new Error(noExport.error);
    expect(noExport.value.dashboard.savings.map((f) => f.ruleId)).not.toContain('R05');
    expect(noExport.value.dashboard.recovery).toHaveLength(0);
    expect(noExport.value.dashboard.total).toBe(2831652);

    const unsure = await recalculateDemo('dev-exportador', { 'export-qualification': DONT_KNOW });
    if (!unsure.ok) throw new Error(unsure.error);
    expect(unsure.value.open).toBe(1);
  });

  it('drops unknown cards and options from the browser', async () => {
    const { cards, personaAnswers } = await hero();
    const a = answersFromChoices(cards, personaAnswers, {
      nope: 'yes',
      'export-qualification': 'maybe',
    });
    expect(a.map((x) => x.questionId)).not.toContain('nope');
    expect(a.map((x) => x.questionId)).not.toContain('export-qualification');
  });
});
