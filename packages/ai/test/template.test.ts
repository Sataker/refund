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

const CLOSING = 'A conta e a lei estão em “Ver cálculo”.';

describe('templateExplanation (hero, ENGINE-SPEC F.3; product review 16/11)', () => {
  it('R01 (M4): number → why → action, steady state, cost drop, "não faça", one closing line', () => {
    expect(templateExplanation(byRule('R01'))).toBe(
      'Você pode pagar R$ 28.316,52 a menos nos próximos 12 meses, dentro da lei, subindo seu pró-labore para R$ 2.260,00 por mês. ' +
        'Com a folha maior, a empresa passa para uma tabela mais barata do Simples (Anexo III) a partir de abril de 2027; depois, são R$ 42.896,52 a menos por ano. ' +
        'Somando os impostos da empresa e os do sócio, o custo dos próximos 12 meses cai de R$ 109.239,72 para R$ 80.923,20. ' +
        'Valor confirmado: usa só dados do banco, da Receita e o que você confirmou. ' +
        'Não registre pró-labore só no papel: ele precisa ser pago e informado no eSocial/DCTFWeb, com o INSS recolhido. ' +
        CLOSING,
    );
  });

  it('R05 stacked on R01 (H2, M7): its own regime line and the cost it starts from', () => {
    const text = templateExplanation(byRule('R05'));
    expect(text).toContain(
      'Você pode pagar R$ 34.002,40 a menos nos próximos 12 meses, dentro da lei, declarando a receita do exterior como exportação no PGDAS-D.',
    );
    expect(text).toContain(
      'Com a empresa já no Anexo III, esta mudança vale R$ 31.109,76 por ano.',
    );
    expect(text).toContain(
      'Somada aos ajustes acima, esta mudança leva o custo dos próximos 12 meses de R$ 80.923,20 para R$ 46.920,80.',
    );
    // R05 is about the months ahead: no "ao retificar" (E10 UX review, M6).
    expect(text).toContain(
      'Contrapartida: a prefeitura pode questionar o ISS dessa receita. Guarde os documentos que fundamentaram a apuração e confirme com o contador quais provam a exportação (por exemplo, contrato com o cliente, fatura e comprovante de recebimento).',
    );
    expect(text).not.toContain('invoices');
    expect(text).toContain('Não peça a restituição sem antes retificar o PGDAS-D.');
  });

  it('R05-REC (H3): measured, then the 48-month assumption, who pays back, deadline; "a empresa"', () => {
    const text = templateExplanation(byRule('R05-REC'));
    expect(text).toContain(
      'Nos 12 meses do extrato, a empresa pagou R$ 39.787,68 a mais. ' +
        'Se o mesmo padrão valeu nos 48 meses anteriores, chega a R$ 198.938,40 (estimativa, sem a correção pela Selic). ' +
        'A parte federal volta da Receita; o ISS, da Prefeitura.',
    );
    expect(text).toContain('não entra no total de economia');
    expect(text).toContain(
      'só pode ser pedido até 23/11/2026; depois dessa data, esse mês não pode mais ser pedido.',
    );
    expect(text).not.toMatch(/\bvocê\b|Estimativa:/i);
  });

  it('R02 (H1): the withholding, the months it waits, its cost, outside the total; typographic quotes', () => {
    const text = templateExplanation(byRule('R02'));
    expect(text).toContain(
      'Os R$ 9.000,00 de IR retidos na distribuição de R$ 90.000,00 de julho de 2026 só voltam na declaração de 2027: ' +
        'são 10 meses de dinheiro parado, que custam R$ 1.111,70 com a Selic de 15% ao ano. ' +
        'É um alerta e não entra no total de economia.',
    );
    expect(text).toContain('só para “usar” o limite');
    expect(text).not.toContain('R$ 600 mil'); // the IRPFM tradeoff amount is not in R02's trace
  });

  it('unanswered R01 (estimated) says it is an estimate', () => {
    const r01 = findingsOf(hero.unanswered).find((f) => f.ruleId === 'R01');
    expect(r01?.confidence).toBe('estimated');
    expect(templateExplanation(r01 as Finding)).toContain('Estimativa: depende de premissas');
  });

  it('accountant audience: legal basis from the finding refs, no "você"', () => {
    const text = templateExplanation(byRule('R01'), 'accountant');
    expect(text).toContain('A empresa pode pagar R$ 28.316,52 a menos');
    expect(text).toContain('subindo o pró-labore do sócio');
    expect(text).toContain('o que o cliente confirmou');
    expect(text).toContain('Base legal: LC 123/2006, art. 18, § 5º-J;');
    expect(text).toContain('LC 123/2006, art. 18, § 1º-A');
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

  it('tone: no promise words, no exclamation, one closing line', () => {
    for (const f of all) {
      const text = templateExplanation(f);
      expect(text).not.toMatch(/garantid|você vai economizar|!|Valide com seu contador/i);
      expect(text.split('Ver cálculo').length - 1).toBe(1);
    }
  });

  it('risk findings (L12): warn, outside the total, the first "não faça" without numbers', () => {
    const risk: Finding = {
      ...byRule('R02'),
      ruleId: 'A01',
      type: 'risk',
      doNot: ['Use 3 cartões', 'Não pague despesa pessoal com o cartão da empresa.'],
    };
    expect(templateExplanation(risk)).toBe(
      'Isso parece economia, mas é risco e não entra no total. Não recomendamos. ' +
        'Não pague despesa pessoal com o cartão da empresa. Veja por quê em “Ver cálculo”.',
    );
  });

  it('generic wording when a rule has no specific trace steps', () => {
    const r01 = byRule('R01');
    const zero: Finding = { ...r01, marginalValue12m: 0 as Finding['marginalValue12m'], trace: [] };
    expect(templateExplanation(zero)).toContain('Este achado não muda o total');
    const other: Finding = { ...r01, ruleId: 'R04', trace: [], order: 4, regimeFrom: '2027-01' };
    expect(templateExplanation(other)).toContain(
      'Depois, são R$ 42.896,52 a menos por ano a partir de janeiro de 2027.',
    );
    const reg: Finding = { ...r01, confidence: 'depends_on_regulation' };
    expect(templateExplanation(reg)).toContain('Depende de norma que ainda não saiu');
    const ranged: Finding = { ...r01, confidence: 'estimated', range: [100, 200] as never };
    expect(templateExplanation(ranged)).toContain('de R$ 1,00 a R$ 2,00 a menos');
    const rec = byRule('R05-REC');
    const plainRec: Finding = { ...rec, trace: [], byDestination: undefined as never };
    expect(templateExplanation(plainRec)).toContain(
      'A empresa pode ter pago de R$ 39.787,68 a R$ 198.938,40 a mais, para recuperar (estimativa).',
    );
    const single: Finding = { ...plainRec, range: [5, 5] as never };
    expect(templateExplanation(single)).toContain('A empresa pode ter pago R$ 0,05 a mais');
    const r02 = byRule('R02');
    const twoRetentions: Finding = { ...r02, trace: [...r02.trace, ...r02.trace] };
    expect(templateExplanation(twoRetentions)).toContain(
      'Isto é um alerta e não entra no total de economia. O efeito calculado é de R$ 1.111,70.',
    );
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
