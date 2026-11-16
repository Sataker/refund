import { type Finding, formatBrl } from '@refund/engine';
import { beforeAll, describe, expect, it } from 'vitest';
import { createLlmPort, TEMPLATE_VERSION, templateExplanation } from '../src/index.ts';
import { civilDateBr, monthName } from '../src/templates.ts';
import { explanationInputs, findingsOf, type HeroRuns, heroRuns } from './hero.ts';

let hero: HeroRuns;
let all: Finding[];
beforeAll(async () => {
  hero = await heroRuns(createLlmPort({ mode: 'template' }));
  all = [...findingsOf(hero.unanswered), ...findingsOf(hero.answered)];
}, 60_000);

const byRule = (ruleId: string) => {
  const f = findingsOf(hero.answered).find((x) => x.ruleId === ruleId);
  if (f === undefined) throw new Error(`missing ${ruleId}`);
  return f;
};

/** Every cents value the finding and its trace hold (the template may only show these). */
function knownCents(f: Finding): Set<string> {
  const out = new Set<number>([f.marginalValue12m, ...(f.range ?? [])]);
  if (f.annualRegimeValue !== undefined) out.add(f.annualRegimeValue);
  for (const s of f.trace) {
    if (s.result.unit === 'cents' && typeof s.result.value === 'number') out.add(s.result.value);
    for (const i of Object.values(s.inputs))
      if (i.unit === 'cents' && typeof i.value === 'number') out.add(i.value);
  }
  return new Set([...out].map((c) => formatBrl(Math.abs(c))));
}

describe('templateExplanation (hero, ENGINE-SPEC F.3)', () => {
  it('R01: number first, "pagar a menos", the steady-state line and the cost drop from the trace', () => {
    expect(templateExplanation(byRule('R01'))).toBe(
      'Você pode pagar R$ 28.316,52 a menos nos próximos 12 meses, dentro da lei. ' +
        'Depois, são R$ 42.896,52 a menos por ano a partir de abril de 2027. ' +
        'Somando os impostos da empresa e os do sócio, o custo dos próximos 12 meses cai de R$ 109.239,72 para R$ 80.923,20. ' +
        'O valor usa só dados do banco, da Receita e o que foi confirmado. ' +
        'Cada passo da conta e o artigo da lei estão em “Ver cálculo”. ' +
        'Valide com seu contador antes de agir.',
    );
  });

  it('R05: export savings with the tradeoff the engine wrote', () => {
    const text = templateExplanation(byRule('R05'));
    expect(text).toContain('Você pode pagar R$ 34.002,40 a menos nos próximos 12 meses');
    expect(text).toContain('R$ 31.109,76 a menos por ano');
    expect(text).toContain('Contrapartida: ao retificar, o município pode questionar o ISS.');
  });

  it('R05-REC: the recovery range, outside the total, with the deadline', () => {
    const text = templateExplanation(byRule('R05-REC'));
    expect(text).toContain(
      'Você pode ter pago de R$ 39.787,68 a R$ 198.938,40 a mais, para recuperar (estimativa).',
    );
    expect(text).toContain('não entra no total de economia');
    expect(text).toContain('até 23/11/2026');
    expect(text).not.toContain('É uma estimativa'); // "(estimativa)" is already beside the range
  });

  it('R02: an alert outside the total with its trace value', () => {
    const text = templateExplanation(byRule('R02'));
    expect(text).toContain('Isto é um alerta e não entra no total de economia.');
    expect(text).toContain('Custo financeiro das retenções: R$ 1.111,70.');
    expect(text).not.toContain('R$ 600 mil'); // the tradeoff with a number stays out of the template
  });

  it('unanswered R01 (estimated) says it is an estimate', () => {
    const r01 = findingsOf(hero.unanswered).find((f) => f.ruleId === 'R01');
    expect(r01?.confidence).toBe('estimated');
    expect(templateExplanation(r01 as Finding)).toContain('É uma estimativa');
  });

  it('accountant audience: legal basis from the finding refs, no "você"', () => {
    const r01 = byRule('R01');
    const text = templateExplanation(r01, 'accountant');
    expect(text).toContain('A empresa pode pagar R$ 28.316,52 a menos');
    expect(text).toContain('Base legal: LC 123/2006, art. 18, § 1º-A;');
    expect(text).toContain('LC 123/2006, art. 18, § 5º-J');
    expect(text).not.toMatch(/\bvocê\b/i);
  });

  it('every amount shown is a finding field or a trace value (rule 1)', () => {
    for (const f of all) {
      for (const audience of ['owner', 'accountant'] as const) {
        const known = knownCents(f);
        const shown = [...templateExplanation(f, audience).matchAll(/R\$ ([\d.]+,\d{2})/g)].map(
          (m) => m[1],
        );
        expect(shown.filter((s) => !known.has(s as string))).toEqual([]);
      }
    }
  });

  it('tone: no promise words (IDENTITY-AND-UI §2.3–2.4), no exclamation on money', () => {
    for (const f of all) {
      const text = templateExplanation(f);
      expect(text).not.toMatch(/garantid|você vai economizar|!/i);
    }
  });

  it('risk findings warn and do not count money', () => {
    const risk: Finding = {
      ...byRule('R02'),
      ruleId: 'A01',
      type: 'risk',
      doNot: ['Use 3 cartões', 'Não pague despesa pessoal com o cartão da empresa.'],
    };
    expect(templateExplanation(risk)).toBe(
      'Isso parece economia, mas é risco. Não recomendamos. Não pague despesa pessoal com o cartão da empresa. ' +
        'Cada passo da conta e o artigo da lei estão em “Ver cálculo”. Valide com seu contador antes de agir.',
    );
  });

  it('edge wording: zero marginal, depends on regulation, single-value range', () => {
    const r01 = byRule('R01');
    const zero: Finding = { ...r01, marginalValue12m: 0 as Finding['marginalValue12m'], trace: [] };
    expect(templateExplanation(zero)).toContain('Este achado não muda o total');
    const reg: Finding = { ...r01, confidence: 'depends_on_regulation' };
    expect(templateExplanation(reg)).toContain('Depende de norma que ainda não saiu');
    const rec = byRule('R05-REC');
    const single: Finding = { ...rec, range: [rec.range?.[1] ?? 0, rec.range?.[1] ?? 0] as never };
    expect(templateExplanation(single)).toContain('Você pode ter pago R$ 198.938,40 a mais');
    const ranged: Finding = { ...r01, confidence: 'estimated', range: [100, 200] as never };
    expect(templateExplanation(ranged)).toContain('de R$ 1,00 a R$ 2,00 a menos');
  });

  it('formats months and dates in pt-BR', () => {
    expect(monthName('2027-04')).toBe('abril de 2027');
    expect(monthName('2027-12')).toBe('dezembro de 2027');
    expect(civilDateBr('2026-11-23')).toBe('23/11/2026');
  });
});

describe("createLlmPort({ mode: 'template' })", () => {
  it('works with no key and no network, classifies nothing, explains with the template', async () => {
    const port = createLlmPort({ mode: 'template' });
    expect(port.mode).toBe('template');
    expect(await port.classify([])).toEqual([]);
    const [input] = explanationInputs(hero.answered);
    const out = await port.explain(input as never);
    expect(out).toEqual({
      text: templateExplanation(input?.finding as Finding),
      origin: 'template',
      guards: { numeric: 'not_applied', citation: 'not_applied' },
      promptVersion: TEMPLATE_VERSION,
    });
  });

  it('the hero analysis ends with a template explanation for every finding', () => {
    for (const r of [hero.unanswered, hero.answered]) {
      const ids = findingsOf(r).map((f) => f.ruleId);
      expect(Object.keys(r.explanations).sort()).toEqual([...ids].sort());
      for (const f of findingsOf(r)) {
        expect(r.explanations[f.ruleId]?.origin).toBe('template');
        expect(r.explanations[f.ruleId]?.text).toBe(templateExplanation(f));
      }
    }
  });

  it('hero total is untouched by the port (6.231.892 cents, F.3)', () => {
    expect(hero.answered.engineResult?.total.savings12m).toBe(6231892);
    expect(hero.answered.engineResult?.total.annualRegimeSavings).toBe(7400628);
    expect(hero.answered.engineResult?.total.recoveryRange).toEqual([3978768, 19893840]);
  });
});
