import type { Finding, LegalRef, Trace } from '@refund/engine';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  citationGuard,
  findingNumericGuard,
  guardExplanation,
  guardTemplate,
  numericGuard,
  secondCheck,
  slotGuard,
} from '../src/guards/index.ts';
import { mentions } from '../src/guards/numeric.ts';
import { asInteger, atPrecision, parseMachine, parsePtBr, shift } from '../src/guards/ptbr.ts';
import { createLlmPort, renderSlots, templateExplanation, templateSource } from '../src/index.ts';
import { ACCEPTED, POISONED, REAL_EXPLANATIONS } from './fixtures/explanations.ts';
import { findingsOf, heroRuns } from './hero.ts';

let answered: Finding[];
let all: Finding[];
beforeAll(async () => {
  const runs = await heroRuns(createLlmPort({ mode: 'template' }));
  answered = findingsOf(runs.answered);
  all = [...findingsOf(runs.unanswered), ...answered];
}, 60_000);

const finding = (ruleId: string): Finding => {
  const f = answered.find((x) => x.ruleId === ruleId);
  if (f === undefined) throw new Error(`missing ${ruleId}`);
  return f;
};

const ref = (id: string, label: string): LegalRef => ({
  id,
  label,
  url: 'https://www.planalto.gov.br/',
  verifiedAt: '2026-11-12',
});

const step = (over: Partial<Trace[number]> = {}): Trace[number] => ({
  id: 'X.STEP',
  label: 'passo',
  formula: 'a − b',
  inputs: {},
  result: { value: 0, unit: 'cents' },
  rounding: 'NONE',
  ...over,
});

describe('PT-BR normalization (TESTS §3.5)', () => {
  const one = (text: string) => {
    const [m] = mentions(text);
    if (m === undefined) throw new Error(`no mention in ${text}`);
    if (m.kind === 'invalid' || m.value === null) throw new Error(`unreadable ${text}`);
    const v = m.value.mantissa / 10 ** m.value.scale;
    if (m.kind === 'percent') return { pct: v };
    return { cents: Math.round(v * 10 ** ((m.kind === 'money' ? m.exp : 0) + 2)) };
  };

  it.each([
    ['R$ 41.600,00', { cents: 4_160_000 }],
    ['41,6 mil', { cents: 4_160_000 }],
    ['R$ 41,6 mil', { cents: 4_160_000 }],
    ['41,6 mil reais', { cents: 4_160_000 }],
    ['R$ 1,2 mi', { cents: 120_000_000 }],
    ['1,5 milhão', { cents: 150_000_000 }],
    ['2 milhões de reais', { cents: 200_000_000 }],
    ['R$ 3 bi', { cents: 300_000_000_000 }],
    ['1.500 reais', { cents: 150_000 }],
    ['R$2.260', { cents: 226_000 }],
    ['9.000,00', { cents: 900_000 }],
    ['28%', { pct: 28 }],
    ['11,25 %', { pct: 11.25 }],
    ['28 por cento', { pct: 28 }],
    ['1 p.p.', { pct: 1 }],
  ])('%s', (text, expected) => {
    expect(one(text)).toEqual(expected);
  });

  it('ignores articles, paragraphs, years, dates, CNAE and counts', () => {
    expect(
      mentions(
        'LC 123/2006, art. 18, § 5º-J; Lei 9.250/1995; em 2026; PA 04/2027; até 23/11/2026; ' +
          'CNAE 6201-5/01; 12 meses; 3 funcionários; 1.243 transações; 2 × R$ 45.000,00',
      ).map((m) => m.raw),
    ).toEqual(['R$ 45.000,00']);
  });

  it('exact helpers', () => {
    expect(parsePtBr('x')).toBeNull();
    expect(parsePtBr('99999999999999999999')).toBeNull();
    expect(parseMachine('abc')).toBeNull();
    expect(parseMachine('99999999999999999999')).toBeNull();
    expect(asInteger({ mantissa: 1230, scale: 1 })).toBe(123);
    expect(asInteger({ mantissa: 1231, scale: 1 })).toBeNull();
    expect(numericGuard('R$ 1,230', [], [123]).ok).toBe(true);
    expect(numericGuard('R$ 0,005', [], [0, 1]).ok).toBe(false);
    expect(parseMachine(0.15)).toEqual({ mantissa: 15, scale: 2 });
    expect(parseMachine('-12.5')).toEqual({ mantissa: 125, scale: 1 });
    expect(shift({ mantissa: 416, scale: 1 }, 5)).toEqual({ mantissa: 4_160_000, scale: 0 });
    expect(shift({ mantissa: 1234, scale: 4 }, 2)).toEqual({ mantissa: 1234, scale: 2 });
    expect(atPrecision({ mantissa: 27_725, scale: 3 }, 1)).toEqual({ trunc: 277, round: 277 });
    expect(atPrecision({ mantissa: 27_750, scale: 3 }, 1)).toEqual({ trunc: 277, round: 278 });
    expect(atPrecision({ mantissa: 2772, scale: 2 }, 3)).toEqual({ trunc: 27_720, round: 27_720 });
  });
});

describe('numericGuard', () => {
  const trace: Trace = [
    step({ result: { value: 4_163_217, unit: 'cents' } }),
    step({ inputs: { r: { value: '0.2772', unit: 'rate' } } }),
  ];

  it('"R$ 41,6 mil" for 4.163.217 cents passes (display rounding < 0,5%)', () => {
    expect(numericGuard('São R$ 41,6 mil.', trace)).toEqual({ ok: true, outsideTrace: [] });
    expect(numericGuard('São cerca de R$ 41.600.', trace).ok).toBe(true);
    expect(numericGuard('São R$ 41.632.', trace).ok).toBe(true);
    expect(numericGuard('São R$ 41.632,17.', trace).ok).toBe(true);
  });

  it('display rounding has limits', () => {
    expect(numericGuard('São R$ 41.600,00.', trace)).toEqual({
      ok: false,
      outsideTrace: ['R$ 41.600,00'],
    });
    expect(numericGuard('São R$ 41 mil.', trace).ok).toBe(false); // 1,5% off
    expect(numericGuard('São R$ 41.630.', trace).ok).toBe(false); // whole reais must round or truncate
  });

  it('percentages: the trace rate truncated or rounded at the precision the text uses', () => {
    for (const ok of ['27,72%', '27,7%', '28%', '27%', 'cerca de 28 %'])
      expect(numericGuard(`Fator R de ${ok}.`, trace).ok, ok).toBe(true);
    for (const bad of ['27,8%', '29%', '27,73%'])
      expect(numericGuard(`Fator R de ${bad}.`, trace).ok, bad).toBe(false);
  });

  it('extras, rates written in labels/formulas and numeric text values count as the trace', () => {
    const t: Trace = [
      step({
        label: 'Custo com pró-labore de R$ 2.260,00',
        formula: '(0,28 + folga) × RBT12; casa se ≤ max(R$ 1,00; 0,1%)',
        inputs: { fatorR: { value: '0.27', unit: 'text' }, note: { value: 'texto', unit: 'text' } },
        result: { value: 'Peça ao contador: R$ 5,00', unit: 'text' },
        projectedNote: 'usado o de 2026 (11,5%)',
      }),
    ];
    const text =
      'Pró-labore de R$ 2.260,00; meta de 28%; Fator R hoje 27%; tolerância de 0,1% ou R$ 1,00; ' +
      'R$ 5,00; 11,5%; R$ 7,00.';
    expect(numericGuard(text, t)).toEqual({ ok: false, outsideTrace: ['R$ 7,00'] });
    expect(numericGuard(text, t, [700]).ok).toBe(true);
  });

  it('a number too long to read exactly never passes (no bypass by overflow)', () => {
    const huge = '99.999.999.999.999.999.999';
    expect(numericGuard(`R$ ${huge}`, trace).ok).toBe(false);
    expect(numericGuard(`${huge}%`, trace).ok).toBe(false);
    const t: Trace = [step({ label: `R$ ${huge}; ${huge}%; 99999999999999999999,5` })];
    expect(numericGuard('R$ 1,00', t).ok).toBe(false);
    const r: Trace = [step({ inputs: { x: { value: 1e-7, unit: 'rate' } } })];
    expect(numericGuard('0%', r).ok).toBe(false);
  });

  it('a text without money or percentages passes', () => {
    expect(numericGuard('Em 2027, nos 12 meses seguintes, o art. 18 vale.', [])).toEqual({
      ok: true,
      outsideTrace: [],
    });
  });
});

describe('citationGuard', () => {
  const refs = [
    ref('lc123-2006/art18/p5-j', 'LC 123/2006, art. 18, § 5º-J'),
    ref('lc123-2006/art18/p5-m', 'LC 123/2006, art. 18, § 5º-M'),
    ref('lei9250-1995/art16-a/p6', 'Lei 9.250/1995, art. 16-A, § 6º'),
    ref(
      'res-cgsn190-2026/art1/res140-art26',
      'Res. CGSN 190/2026, art. 1º (art. 26 da Res. CGSN 140/2018)',
    ),
    ref('lei5172-1966/art168', 'CTN, art. 168'),
    ref('dec12797-2025/art2', 'Decreto 12.797/2025, art. 2º'),
    ref('port-mps-mf13-2026/art1', 'Portaria Interministerial MPS/MF 13/2026, art. 1º'),
    ref('manual-pgdas', 'Manual do PGDAS-D, item 3'),
  ];

  it.each([
    'LC 123/2006, art. 18, § 5º-J',
    'art. 18, §§ 5º-J e 5º-M da LC 123',
    'Lei Complementar nº 123, de 2006, artigo 18, parágrafo 5º-J',
    'o § 5º-M do art. 18',
    'Lei 9.250/1995, art. 16-A, § 6º',
    'art. 26 da Res. CGSN 140',
    'Resolução CGSN nº 190',
    'CTN, art. 168',
    'Lei 5.172/1966, art. 168',
    'Código Tributário Nacional',
    'Decreto 12.797, art. 2º',
    'Portaria Interministerial MPS/MF 13',
    'Simples Nacional (LC 123)',
  ])('allows %s', (text) => {
    expect(citationGuard(text, refs)).toEqual({ ok: true, outsideRefs: [] });
  });

  it.each([
    ['art. 999', 'art. 999'],
    ['parágrafo único', 'parágrafo único'],
    ['Lei 12.345', 'Lei 12.345'],
    ['LC 123/2006, art. 3º, § 14', 'LC 123/2006, art. 3º, § 14'],
    ['art. 18, § 5º-K', 'art. 18, § 5º-K'],
    ['Lei 9.250/1995, art. 16-A, § 5º', 'Lei 9.250/1995, art. 16-A, § 5º'],
    ['art. 26 da LC 123', 'art. 26 da LC 123'],
    ['arts. 18 e 19 da LC 123', 'arts. 18 e 19 da LC 123'],
    ['IN RFB 2.110', 'IN RFB 2.110'],
    ['Decreto 3.000/1999', 'Decreto 3.000'],
  ])('rejects %s', (text, outside) => {
    expect(citationGuard(`Veja ${text}.`, refs)).toEqual({ ok: false, outsideRefs: [outside] });
  });

  it('a sentence break splits citations; refs that are not cited are fine', () => {
    expect(citationGuard('Vale a LC 123. O art. 168 também.', refs).ok).toBe(true);
    expect(citationGuard('Nada citado aqui.', []).ok).toBe(true);
  });
});

describe('slot guard (ADR-016)', () => {
  const allowed = new Set(['marginalValue12m', 'horizon', 'ref:0']);
  const ok = (t: string) => slotGuard(t, allowed);

  it('accepts plain Portuguese with known placeholders and the fixed "lei" phrases', () => {
    for (const t of [
      'Você pode pagar {{marginalValue12m}} a menos nos próximos {{horizon}}, dentro da lei.',
      'Declare no PGDAS-D, a declaração mensal do Simples ({{ref:0}}). A conta e a lei estão em “Ver cálculo”.',
      'O INSS, o IR, a CBS e o IBS ficam dentro da lei',
    ])
      expect(ok(t), t).toEqual({ ok: true, numeric: false, citation: false, problems: [] });
  });

  it.each([
    ['digit', 'Em 12 meses.', { numeric: true, citation: false }],
    ['currency', 'Custa US$ mais.', { numeric: true, citation: false }],
    ['percent sign', 'Cai pela metade %.', { numeric: true, citation: false }],
    ['§', 'Veja o § certo.', { numeric: false, citation: true }],
    ['roman', 'Fica no Anexo IV.', { numeric: true, citation: true }],
    ['zero-width', 'Você​ paga.', { numeric: true, citation: true }],
    ['soft hyphen', 'Eco­nomia.', { numeric: true, citation: true }],
    ['control', 'Linha\u0007.', { numeric: true, citation: true }],
    ['Greek', 'Vοcê paga.', { numeric: true, citation: true }],
    ['ordinal', 'O nº certo.', { numeric: true, citation: true }],
    ['unknown placeholder', 'Paga {{x}}.', { numeric: true, citation: true }],
    ['stray brace', 'Paga } menos.', { numeric: true, citation: true }],
    ['percent phrase', 'Paga dez por cento.', { numeric: true, citation: false }],
    ['legal phrase', 'Veja a medida provisória.', { numeric: false, citation: true }],
    ['lei with a name', 'Dentro da lei Kandir.', { numeric: false, citation: true }],
  ])('rejects %s', (_label, text, flags) => {
    expect(ok(text)).toMatchObject({ ok: false, ...flags });
  });
});

describe('guards on the hero (TESTS §3.5)', () => {
  it('20 real explanations (slotted) pass and render with the trace values', () => {
    expect(REAL_EXPLANATIONS).toHaveLength(20);
    for (const { ruleId, text } of REAL_EXPLANATIONS) {
      const v = guardExplanation(text, finding(ruleId));
      expect({ text, ok: v.ok, guards: v.guards, problems: v.problems }).toEqual({
        text,
        ok: true,
        guards: { numeric: 'ok', citation: 'ok' },
        problems: [],
      });
      expect(v.rendered).not.toMatch(/\{\{|\}\}/);
    }
    const first = guardExplanation(REAL_EXPLANATIONS[0]?.text as string, finding('R01'));
    expect(first.rendered).toContain('Você pode pagar R$ 28.316,52 a menos nos próximos 12 meses');
    expect(first.rendered).toContain('de R$ 1.621,00 para R$ 2.260,00 por mês');
    expect(first.rendered).toContain('(LC 123/2006, art. 18, § 5º-J)');
  });

  it.each(POISONED)('poisoned $guard: $text', ({ ruleId, text, guard }) => {
    const v = guardExplanation(text, finding(ruleId));
    expect(v.ok).toBe(false);
    expect(v.rendered).toBeNull();
    expect(v.guards[guard]).toBe('failed');
  });

  it('the template source passes the slot guard and renders to the template, for every finding and audience', () => {
    for (const f of all)
      for (const audience of ['owner', 'accountant'] as const) {
        const { source } = templateSource(f, audience);
        const v = guardTemplate(source, f);
        expect(v.ok, `${f.ruleId} ${audience} ${v.problems.join(', ')}`).toBe(true);
        expect(v.rendered).toBe(templateExplanation(f, audience));
      }
  });

  it.each(POISONED.filter((p) => !p.slotOnly))(
    'second check (pattern guards) still refuses $guard: $text',
    ({ ruleId, text, guard }) => {
      const f = finding(ruleId);
      const ok =
        guard === 'numeric' ? findingNumericGuard(text, f).ok : citationGuard(text, f.refs).ok;
      expect(ok).toBe(false);
    },
  );

  it.each(ACCEPTED)('accepted (fuzz3): $text', ({ ruleId, text }) => {
    expect(guardExplanation(text, finding(ruleId)).ok).toBe(true);
  });

  it('a model text follows the lead our code writes (accountant voice too)', () => {
    const r01 = finding('R01');
    const v = guardExplanation('Valor confirmado, dentro da lei.', r01, 'accountant');
    expect(v.rendered).toBe(
      'A empresa pode pagar R$ 28.316,52 a menos nos próximos 12 meses, dentro da lei, subindo o pró-labore do sócio para R$ 2.260,00 por mês. Valor confirmado, dentro da lei.',
    );
    const rec = guardExplanation('O prazo vai até {{deadline}}.', finding('R05-REC'));
    expect(rec.rendered).toMatch(
      /^Nos 12 meses do extrato, a empresa pagou R\$ 39\.787,68 a mais\./,
    );
  });

  it('the second check refuses a rendered text with a number outside the trace', () => {
    const r01 = finding('R01');
    expect(secondCheck('Você paga R$ 1,00.', r01)).toEqual({
      ok: false,
      guards: { numeric: 'failed', citation: 'ok' },
      problems: ['R$ 1,00'],
      rendered: null,
    });
    expect(secondCheck('Conforme a Lei 1.234.', r01)).toMatchObject({
      ok: false,
      guards: { numeric: 'ok', citation: 'failed' },
    });
    expect(secondCheck('Você paga R$ 28.316,52.', r01).ok).toBe(true);
  });

  it('renderSlots refuses a name it has no value for', () => {
    expect(renderSlots('{{nope}}', {})).toBeNull();
    expect(renderSlots('{{ a }}', { a: 'x' })).toBe('x');
  });

  it('the hero numbers pass only as the trace has them', () => {
    const r01 = finding('R01');
    expect(findingNumericGuard('R$ 28.316,52', r01).ok).toBe(true);
    expect(findingNumericGuard('R$ 28.316,53', r01).ok).toBe(false);
    // The big number 62.318,92 is the total (R01 + R05), not in any single finding's trace.
    expect(findingNumericGuard('R$ 62.318,92', r01).ok).toBe(false);
    expect(findingNumericGuard('R$ 39.787,68 a R$ 198.938,40', finding('R05-REC')).ok).toBe(true);
    expect(findingNumericGuard('R$ 1.111,70', finding('R02')).ok).toBe(true);
    expect(findingNumericGuard('R$ 50 mil por mês', finding('R02')).ok).toBe(true); // headline amount
    expect(findingNumericGuard('R$ 50 mil por mês', r01).ok).toBe(false);
  });
});
