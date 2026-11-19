import { recalculate } from '@refund/engine';
import { describe, expect, it } from 'vitest';
import {
  cleanEngineText,
  TRACE_INPUT_LABEL,
  traceTextValue,
} from '@/components/brand/trace-labels';
import {
  answersFromChoices,
  DONT_KNOW,
  isPersonaDefault,
  otherCents,
  parseReaisToCents,
} from '@/features/findings/confirm';
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
    expect(d.annualPending).toBe(false);
  });

  it('engine review H1: with an estimated part, no steady-state line under the confirmed-only number', async () => {
    const r = await recalculateDemo('dev-exportador', { 'pro-labore-gross': DONT_KNOW });
    if (!r.ok) throw new Error(r.error);
    const d = r.value.dashboard;
    expect(d.estimated).toBeGreaterThan(0);
    expect(d.annual).toBeNull();
    expect(d.annualPending).toBe(true);
    expect(d.savings.find((f) => f.ruleId === 'R01')?.confidence).toBe('estimated');
    // "a partir de" only from the single counted confirmed finding with a regimeFrom: R01 is no longer confirmed.
    expect(d.regimeFrom).toBeNull();
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
    // Engine review L2: only steps whose result is the sum of those transactions.
    expect(sources['R01.COST_12M_BEFORE']).toBeUndefined();
    expect(sources['R01.P_STAR']).toBeUndefined();
    const a01 = result.findings.find((f) => f.ruleId === 'A01');
    if (!a01) throw new Error('A01 missing');
    const perMerchant = traceSources(a01.trace, facts);
    expect(perMerchant['A01.MERCHANT.1']).toHaveLength(12);
    expect(perMerchant['A01.MERCHANT.2']).toHaveLength(1);
    expect(perMerchant['A01.MARGINAL_12M']).toBeUndefined();
    for (const ids of Object.values(perMerchant))
      for (const id of ids) expect(rows[id], id).toBeDefined();
  });

  it('every trace input key has a Portuguese label (UX review H2: never a raw variable name)', async () => {
    const { result } = await hero();
    const keys = new Set(
      result.findings.flatMap((f) => f.trace.flatMap((s) => Object.keys(s.inputs))),
    );
    const missing = [...keys].filter((k) => !(k in TRACE_INPUT_LABEL));
    expect(missing).toEqual([]);
    expect(traceTextValue('fatorR', '0.27')).toBe('27%');
    expect(cleanEngineText('a (ENGINE-SPEC C.1, item 4)')).toBe('a');
    expect(cleanEngineText('2 parâmetro(s) projetado(s)')).toBe('2 parâmetros projetados');
    expect(cleanEngineText('1 parâmetro(s) projetado(s)')).toBe('1 parâmetro projetado');
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
      regimeFrom: '2027-04',
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

describe('D32: the simulator steps, per year (steady state) and in 12 months', () => {
  // Recorded from the engine (PLAN §18 D32 verification): [margin, P*, annualRegimeValue, marginalValue12m].
  // The per-year value falls as the margin grows (P_target rises, so does the INSS), so the best per-year step is
  // margin 0 (P_28), not the D13 "recomendada" 1 p.p.; at margin 0 the 12-month value is negative (ramp to 2028-01).
  const STEPS: readonly [string, number, number, number][] = [
    ['0', 176000, 4355652, -18348],
    ['0.0025', 188500, 4339152, 1423152],
    ['0.005', 201000, 4322652, 2135652],
    ['0.0075', 213500, 4306152, 2483652],
    ['0.01', 226000, 4289652, 2831652],
    ['0.0125', 238500, 4273152, 2815152],
    ['0.015', 251000, 4256652, 3163152],
    ['0.0175', 263500, 4240152, 3146652],
    ['0.02', 276000, 4223652, 3130152],
    ['0.0225', 288500, 4207152, 3113652],
    ['0.025', 301000, 4190652, 3097152],
    ['0.0275', 313500, 4174152, 3080652],
    ['0.03', 326000, 4157652, 3064152],
    ['0.0325', 338500, 4141152, 3412152],
    ['0.035', 351000, 4124652, 3395652],
    ['0.0375', 363500, 4108152, 3379152],
    ['0.04', 376000, 4091652, 3362652],
    ['0.0425', 388500, 4075152, 3346152],
    ['0.045', 401000, 4058652, 3329652],
    ['0.0475', 413500, 4042152, 3313152],
    ['0.05', 426000, 4025652, 3296652],
  ];

  it('records P*, the per-year and the 12-month value at every slider step', async () => {
    const { facts } = await hero();
    expect(STEPS.map((s) => s[0])).toEqual(MARGIN_STEPS);
    const got = MARGIN_STEPS.map((margin) => {
      const r = recalculate(facts, {
        ...facts.assumptions,
        fatorRMargin: { value: margin, origin: 'user', editable: true, source: 'slider' },
      });
      if (!r.ok) throw new Error(r.error.code);
      const p = proLaborePoint(r.value);
      return [margin, p?.target, p?.annual, p?.value];
    });
    expect(got).toEqual(STEPS);
  });

  it('the recommended step is the minimum P that keeps the margin, not the best per year', async () => {
    const { facts } = await hero();
    const best = STEPS.reduce((a, b) => (b[2] > a[2] ? b : a));
    expect(best[0]).toBe('0');
    expect(best[0]).not.toBe(marginOf(facts));
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

  it('"Outro valor" on the pró-labore card sends the typed cents (ENGINE-SPEC E.2)', async () => {
    const { cards, personaAnswers } = await hero();
    expect(cards.find((c) => c.id === 'pro-labore-gross')?.options.map((o) => o.label)).toEqual([
      'Sim',
      'Outro valor',
      'Não sei',
    ]);
    expect(parseReaisToCents('2.500,00')).toBe(250000);
    expect(parseReaisToCents('R$ 1621')).toBe(162100);
    expect(parseReaisToCents('2500,5')).toBe(250050);
    expect(parseReaisToCents('abc')).toBeNull();
    expect(parseReaisToCents('0')).toBeNull();
    expect(otherCents('other:250000')).toBe(250000);
    expect(otherCents('other:-1')).toBeNull();
    const a = answersFromChoices(cards, personaAnswers, { 'pro-labore-gross': 'other:250000' });
    expect(a.find((x) => x.questionId === 'pro-labore-gross')?.value).toBe(250000);
    const bad = answersFromChoices(cards, personaAnswers, { 'export-qualification': 'other:5' });
    expect(bad.map((x) => x.questionId)).not.toContain('export-qualification');
  });
});
