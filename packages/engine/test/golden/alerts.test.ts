// ENGINE-SPEC D.7 (A01) and D.8 (A02). The classification cases (TA1-01…TA1-11: MCC and regex of E.7; TA2-09: pró-labore
// identified by DARF 0588/DCTFWeb; TA2-10: two partners) belong to @refund/pipeline, which builds the facts read here.
import { describe, expect, it } from 'vitest';
import { analyze } from '../../src/analyze.ts';
import { brl } from '../../src/money.ts';
import type {
  Cents,
  Distribution,
  EngineResult,
  Facts,
  Finding,
  Series,
  YearMonth,
} from '../../src/types.ts';
import { constant, fact, heroFacts, OBSERVED, syntheticFacts } from './fixtures/facts.ts';

function run(f: Facts): EngineResult {
  const r = analyze(f);
  if (!r.ok) throw new Error(r.error.code);
  return r.value;
}
const find = (r: EngineResult, id: string) =>
  r.findings.find((f) => f.ruleId === id) as Finding | undefined;

const base = () => syntheticFacts({ domestic: constant(brl('50.000,00')) });

describe('ENGINE-SPEC D.7 — A01, personal expense paid by the PJ', () => {
  it('no personal expense fact (or an empty one) → no A01', () => {
    expect(find(run(base()), 'A01')).toBeUndefined();
    const f = base();
    f.personalExpensesInPj = fact([]);
    expect(find(run(f), 'A01')).toBeUndefined();
  });

  it('TA1-12: the same personal merchant 12 times → 1 finding with 12 transactions', () => {
    const f = base();
    f.personalExpensesInPj = fact(
      OBSERVED.map((month) => ({
        transactionId: `t-${month}`,
        month,
        amount: brl('129,90'),
        merchant: 'SMART FIT',
      })),
    );
    const r = run(f);
    const a01 = r.findings.filter((x) => x.ruleId === 'A01');
    expect(a01).toHaveLength(1);
    const group = a01[0]?.trace.find((s) => s.id === 'A01.MERCHANT.1');
    expect(group?.inputs.count?.value).toBe(12);
    expect(String(group?.inputs.transactionIds?.value).split(',')).toHaveLength(12);
    expect(group?.result.value).toBe(12 * brl('129,90'));
  });

  it('D.7 output: risk, no R$, outside the total, with the D.7 text', () => {
    const r = run(heroFacts());
    const a01 = find(r, 'A01');
    expect(a01).toMatchObject({ type: 'risk', marginalValue12m: 0, countsInTotal: false });
    expect(a01?.title).toBe(
      'No Simples, despesa da empresa não reduz imposto. Pagar gasto pessoal pela PJ pode virar distribuição disfarçada de lucro e confusão patrimonial. Reembolse ou registre como distribuição de lucro.',
    );
    expect(a01?.refs.map((x) => x.id)).toEqual([
      'lc123-2006/art29/viii',
      'lc123-2006/art29/ix',
      'lei10406-2002/art50',
      'dl1598-1977/art60',
      'lei9249-1995/art13',
    ]);
    // The four hero numbers do not move (G1).
    expect(r.total.savings12m).toBe(6231892);
    expect(r.total.annualRegimeSavings).toBe(7400628);
  });

  it('expenses outside the 12 observed months do not count; a Lucro Presumido company gets no A01', () => {
    const f = base();
    f.personalExpensesInPj = fact([
      { transactionId: 'old', month: '2025-01', amount: 5590 as Cents, merchant: 'NETFLIX' },
    ]);
    expect(find(run(f), 'A01')).toBeUndefined();
    const p = syntheticFacts({ regime: 'PRESUMIDO' });
    p.personalExpensesInPj = fact([
      { transactionId: 't', month: '2026-05', amount: 5590 as Cents, merchant: 'NETFLIX' },
    ]);
    expect(find(run(p), 'A01')).toBeUndefined();
  });
});

const series = (values: number[]): Series =>
  Object.fromEntries(OBSERVED.map((m, i) => [m, values[i] as Cents])) as Series;
const last3 = (a: number, b: number, c: number) =>
  series([162100, 162100, 162100, 162100, 162100, 162100, 162100, 162100, 162100, a, b, c]);
const dist = (month: YearMonth, amount: number): Distribution => ({
  month,
  payerCnpj: 'RFTEST00000100',
  grossAmount: amount as Cents,
  irrfWithheld: 0 as Cents,
  profitThrough2025Approved: false,
});
const monthlyDistributions = (amount: number) =>
  (['2026-08', '2026-09', '2026-10'] as YearMonth[]).map((m) => dist(m, amount));

function a02Facts(o: {
  proLabore: Series;
  works?: boolean | 'no_answer';
  distributions?: Distribution[];
  regime?: Facts['company']['value']['regime'];
}): Facts {
  const f = syntheticFacts({
    domestic: constant(brl('50.000,00')),
    proLabore: o.proLabore,
    worksInCompany: o.works !== false,
    distributions: o.distributions ?? [],
    ...(o.regime === undefined ? {} : { regime: o.regime }),
  });
  if (o.works === 'no_answer') {
    f.partner.worksInCompany = { value: true, provenance: { origin: 'default_assumption' } };
  }
  return f;
}

describe('ENGINE-SPEC D.8 — A02, zero or below-minimum pró-labore with a partner who works', () => {
  it('TA2-01: P0 = 0 for 3 months, distributions 20.000/month, works = yes → alert', () => {
    const r = run(
      a02Facts({ proLabore: last3(0, 0, 0), distributions: monthlyDistributions(2000000) }),
    );
    const a02 = find(r, 'A02');
    expect(a02).toMatchObject({ type: 'risk', countsInTotal: false, marginalValue12m: 0 });
    expect(a02?.trace.filter((s) => s.id.startsWith('A02.PRO_LABORE.'))).toHaveLength(3);
    expect(a02?.title).toBe(
      'O sócio que trabalha na empresa e recebe remuneração por isso é segurado obrigatório do INSS (Lei 8.212, art. 12, V, f). O salário-de-contribuição mínimo é de um salário mínimo (R$ 1.621,00; Lei 8.212, art. 28, § 3º). Se você trabalha na empresa e não tem pró-labore, confirme com o contador.',
    );
  });

  it('TA2-02: P0 = 0, works = no (investor partner) → no alert', () => {
    const f = a02Facts({
      proLabore: last3(0, 0, 0),
      works: false,
      distributions: monthlyDistributions(2000000),
    });
    expect(find(run(f), 'A02')).toBeUndefined();
  });

  it('TA2-03: P0 = 1.000 < 1.621, works = yes → alert', () => {
    expect(find(run(a02Facts({ proLabore: last3(100000, 100000, 100000) })), 'A02')).toBeDefined();
  });

  it('TA2-04: P0 = 1.621,00 → no alert', () => {
    expect(
      find(run(a02Facts({ proLabore: last3(162100, 162100, 162100) })), 'A02'),
    ).toBeUndefined();
  });

  it('TA2-05: MEI → does not apply', () => {
    const f = a02Facts({
      proLabore: last3(0, 0, 0),
      regime: 'MEI',
      distributions: monthlyDistributions(100000),
    });
    expect(find(run(f), 'A02')).toBeUndefined();
  });

  it('TA2-06: P0 = 0 for 2 months and 1.621 in the 3rd → alert (months without pró-labore)', () => {
    const a02 = find(run(a02Facts({ proLabore: last3(0, 0, 162100) })), 'A02');
    expect(
      a02?.trace.filter((s) => s.id.startsWith('A02.PRO_LABORE.')).map((s) => s.month),
    ).toEqual(['2026-08', '2026-09']);
  });

  it('TA2-07: works = no answer → no alert (the question card comes first)', () => {
    const f = a02Facts({
      proLabore: last3(0, 0, 0),
      works: 'no_answer',
      distributions: monthlyDistributions(2000000),
    });
    expect(find(run(f), 'A02')).toBeUndefined();
  });

  it('TA2-08: P0 = 0 and no distributions → no alert (company with no withdrawals)', () => {
    expect(find(run(a02Facts({ proLabore: last3(0, 0, 0) })), 'A02')).toBeUndefined();
  });

  it('TA2-11: A02 fires and R01 starts from the regularized S0 (P0′ = SM; T01-10)', () => {
    const r = run(
      a02Facts({ proLabore: last3(0, 0, 0), distributions: monthlyDistributions(2000000) }),
    );
    expect(find(r, 'A02')).toBeDefined();
    const r01 = find(r, 'R01');
    expect(r01?.trace.find((s) => s.id === 'R01.P_STAR')?.inputs.currentProLabore?.value).toBe(
      162100,
    );
  });

  it('TA2-12: Lucro Presumido, P0 = 0, works = yes → alert (20% CPP also becomes due)', () => {
    const f = a02Facts({
      proLabore: last3(0, 0, 0),
      regime: 'PRESUMIDO',
      distributions: monthlyDistributions(2000000),
    });
    expect(find(run(f), 'A02')).toBeDefined();
  });
});
