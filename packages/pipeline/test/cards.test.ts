// Cards (E.1–E.3): text, options, ordering, and what each answer does to the classification and the facts.
import { describe, expect, it } from 'vitest';
import {
  type AnswerValue,
  applyRules,
  applyUserInput,
  CARD,
  type Classified,
  initial,
} from '../src/classify/index.ts';
import { verdictOf } from '../src/classify/llm.ts';
import { buildFacts } from '../src/facts.ts';
import { buildQuestions, CATEGORY_LABEL } from '../src/questions.ts';
import type { NormalizedTransaction } from '../src/types.ts';
import { COMPANY_CNPJ, identity, monthly, ruleContext, tx } from './build.ts';
import { persona } from './helpers.ts';

function classify(
  txs: NormalizedTransaction[],
  answers: Record<string, AnswerValue> = {},
  ctx = ruleContext(),
): Classified[] {
  const hits = applyRules(txs, ctx);
  const list = txs.map((t) => initial(t, hits.get(t.id), undefined, false));
  applyUserInput(list, new Map(Object.entries(answers)), []);
  return list;
}

const cardOf = (list: Classified[], prefix: string) =>
  list.find((c) => c.cardId?.startsWith(prefix))?.cardId ?? '';

const questions = (list: Classified[], answers: Record<string, AnswerValue> = {}) =>
  buildQuestions(list, { regime: 'SIMPLES', answers: new Map(Object.entries(answers)) });

const facts = (list: Classified[], answers: Record<string, AnswerValue> = {}) => {
  const r = buildFacts({
    classified: list,
    answers: new Map(Object.entries(answers)),
    company: persona().company,
    referenceMonth: '2026-10',
    analysisDate: '2026-11-12',
    userAssumptions: {},
  });
  if (!r.ok) throw new Error(r.error.code);
  return r.value;
};

const holderPix = (amountCents: number, count = 4) =>
  monthly(count, '2026-10', {
    description: 'PIX ENVIADO [pessoa]',
    cpf: '***.711.985-**',
    hmac: 'h',
    amountCents,
  });
const holderCtx = ruleContext({ identity: identity({ cpfHmac: 'h' }) });

describe('pró-labore and distribution cards', () => {
  it('a gross the estimate cannot give (IR > 0) asks for the value', () => {
    const list = classify(holderPix(900_000), {}, holderCtx);
    const q = questions(list).find((x) => x.id === CARD.proLaboreGross);
    expect(q?.text).toMatch(
      /^Qual é o seu pró-labore bruto por mês\? Você recebe R\$ 9\.000,00 líquido\.$/,
    );
    expect(q?.options.map((o) => o.value)).toEqual(['other', 'payslip']);
    // Without the answer the net is the only number: a visible assumption.
    expect(facts(list).partner.grossProLabore.provenance.origin).toBe('default_assumption');
  });

  it('a typed gross confirms the card and becomes the series', () => {
    const list = classify(holderPix(900_000), { [CARD.proLaboreGross]: 1_100_000 }, holderCtx);
    expect(questions(list, { [CARD.proLaboreGross]: 1_100_000 }).map((q) => q.id)).not.toContain(
      CARD.proLaboreGross,
    );
    const f = facts(list, { [CARD.proLaboreGross]: 1_100_000 });
    expect(f.partner.grossProLabore.value['2026-10']).toBe(1_100_000);
    expect(f.partner.grossProLabore.provenance.origin).toBe('user');
  });

  it('"no" to pró-labore and to distribution rejects them; an unknown value leaves the card open', () => {
    const pix = [...holderPix(144_269), ...holderPix(1_800_000)];
    const no = classify(pix, { [CARD.proLaboreGross]: 'no', [CARD.distribution]: 'no' }, holderCtx);
    expect(no.every((c) => c.classification.status === 'rejected')).toBe(true);
    const odd = classify(
      pix,
      { [CARD.proLaboreGross]: 'maybe', [CARD.distribution]: 'maybe' },
      holderCtx,
    );
    expect(odd.every((c) => c.classification.status === 'pending_confirmation')).toBe(true);
  });

  it('holder transfer card (no identity, no PF account): distribution, pró-labore or no', () => {
    const ctx = ruleContext({ identity: identity({ pfConnected: false }) });
    const one = [
      tx({ description: 'PIX ENVIADO [pessoa]', cpf: '***.555.666-**', amountCents: 500_000 }),
    ];
    const id = cardOf(classify(one, {}, ctx), 'partner-transfer:');
    expect(questions(classify(one, {}, ctx))[0]?.options.map((o) => o.value)).toEqual([
      'distribution',
      'pro_labore',
      'no',
    ]);
    expect(classify(one, { [id]: 'distribution' }, ctx)[0]?.classification.category).toBe(
      'profit_distribution',
    );
    expect(classify(one, { [id]: 'pro_labore' }, ctx)[0]?.classification.category).toBe(
      'pro_labore',
    );
    expect(classify(one, { [id]: 'no' }, ctx)[0]?.classification).toMatchObject({
      category: 'operating_expense',
      status: 'rejected',
    });
    expect(classify(one, { [id]: 42 }, ctx)[0]?.classification.status).toBe('pending_confirmation');
  });

  it('T02-13: distribution gross = net + DARF 1841 of the accrual month', () => {
    const list = classify(
      [
        ...holderPix(144_269),
        tx({
          description: 'PIX ENVIADO [pessoa]',
          cpf: '***.711.985-**',
          hmac: 'h',
          amountCents: 8_100_000,
          date: '2026-07-20',
        }),
        tx({
          description: 'PAGAMENTO DARF 1841 - IRRF LUCROS PA 07/2026',
          method: 'BOLETO',
          amountCents: 900_000,
          date: '2026-08-20',
        }),
      ],
      { [CARD.distribution]: 'yes' },
      holderCtx,
    );
    expect(facts(list).partner.distributions.value).toEqual([
      {
        month: '2026-07',
        payerCnpj: COMPANY_CNPJ,
        grossAmount: 9_000_000,
        irrfWithheld: 900_000,
        profitThrough2025Approved: false,
      },
    ]);
  });

  it('T02-11: interest on equity never enters the distributions', () => {
    const list = classify(
      [tx({ description: 'PIX JCP', cpf: '***.711.985-**', hmac: 'h', amountCents: 9_000_000 })],
      {},
      holderCtx,
    );
    expect(facts(list).partner.distributions.value).toEqual([]);
  });
});

describe('payroll, export, revenue and contribution cards', () => {
  const salaries = () =>
    monthly(4, '2026-10', {
      description: 'PIX ENVIADO [pessoa]',
      cpf: '***.493.103-**',
      amountCents: 454_868,
    });

  it('employee "no" turns the payments into an operating expense; the payroll card asks while salaries exist', () => {
    const list = classify(salaries());
    const id = cardOf(list, 'clt-employee:');
    // By estimated impact: the payroll and the employee move the same money (id breaks the tie); no amount last.
    expect(questions(list).map((q) => q.id)).toEqual([id, CARD.payrollGross, CARD.worksInCompany]);
    const no = classify(salaries(), { [id]: 'no' });
    expect(no.every((c) => c.classification.category === 'operating_expense')).toBe(true);
    expect(questions(no).map((q) => q.id)).toEqual([CARD.worksInCompany]);
    expect(
      classify(salaries(), { [id]: 'x' }).every(
        (c) => c.classification.status === 'pending_confirmation',
      ),
    ).toBe(true);
  });

  it('the gross payroll is a per-month Series; a single number or junk months are not an answer (H2)', () => {
    const list = classify(salaries(), {});
    const single = facts(list, { [CARD.payrollGross]: 1_020_000 });
    expect(single.cltPayroll.grossPay.provenance.origin).toBe('default_assumption');
    // D22: no FGTS paid in this synthetic case → no default payroll (the net is never payroll, E.2).
    expect(single.cltPayroll.grossPay.value['2026-10']).toBe(0);
    const junk = facts(list, { [CARD.payrollGross]: { '2026-13': 1, x: 2, '2026-10': -5 } });
    expect(junk.cltPayroll.grossPay.provenance.origin).toBe('default_assumption');
    const series = facts(list, {
      [CARD.payrollGross]: { '2026-10': 1_020_000, '2026-07': 2_210_000 },
    });
    expect(series.cltPayroll.grossPay.value['2026-10']).toBe(1_020_000);
    expect(series.cltPayroll.grossPay.value['2026-07']).toBe(2_210_000);
    expect(series.cltPayroll.grossPay.value['2026-06']).toBe(0);
    expect(series.cltPayroll.grossPay.provenance.origin).toBe('user');
  });

  it('export "no": still revenue, domestic market, qualification false', () => {
    const fx = monthly(3, '2026-10', {
      direction: 'inflow',
      description: 'CAMBIO',
      method: 'FX',
      amountCents: 5_000_000,
    });
    const list = classify(fx, { [CARD.export]: 'no' });
    const f = facts(list, { [CARD.export]: 'no' });
    expect(f.revenueByMarket.domestic.value['2026-10']).toBe(5_000_000);
    expect(f.revenueByMarket.export.value['2026-10']).toBe(0);
    expect(f.qualifications.exportResultAbroad?.value).toBe(false);
    expect(classify(fx, { [CARD.export]: 3 })[0]?.classification.status).toBe(
      'pending_confirmation',
    );
  });

  it('a large domestic receipt: yes keeps it as revenue, no takes it out', () => {
    const big = [
      tx({
        direction: 'inflow',
        description: 'PIX RECEBIDO',
        cnpj: 'RFCLI001000100',
        amountCents: 900_000,
      }),
    ];
    const id = cardOf(classify(big), 'revenue:');
    expect(questions(classify(big))[0]?.text).toMatch(/são receita da empresa\?$/);
    expect(classify(big, { [id]: 'yes' })[0]?.classification).toMatchObject({
      category: 'service_revenue',
      status: 'confirmed',
    });
    expect(classify(big, { [id]: false })[0]?.classification.category).toBe('unclassified');
    expect(classify(big, { [id]: 'talvez' })[0]?.classification.status).toBe(
      'pending_confirmation',
    );
  });

  it('contribution: yes stays outside revenue, no is revenue', () => {
    const pj = tx({
      direction: 'inflow',
      description: 'PIX RECEBIDO',
      cpf: '***.711.985-**',
      hmac: 'h',
      amountCents: 500_000,
    });
    const id = cardOf(classify([pj], {}, holderCtx), 'contribution:');
    expect(questions(classify([pj], {}, holderCtx))[0]?.text).toMatch(
      /aporte ou empréstimo seu\?$/,
    );
    expect(classify([pj], { [id]: 'sim' }, holderCtx)[0]?.classification.category).toBe(
      'same_holder_transfer',
    );
    expect(classify([pj], { [id]: 'nao' }, holderCtx)[0]?.classification.category).toBe(
      'service_revenue',
    );
    expect(classify([pj], { [id]: 1 }, holderCtx)[0]?.classification.status).toBe(
      'pending_confirmation',
    );
  });
});

describe('PF cards (E.3, E.6)', () => {
  const psychologist = () =>
    monthly(4, '2026-10', {
      holder: 'PF',
      description: 'PIX ENVIADO [pessoa]',
      cpf: '***.111.222-**',
      amountCents: 80_000,
    });

  it('health: holder + profession deducts; "other" stays out of the deduction; "no" rejects; junk stays open', () => {
    const id = cardOf(classify(psychologist()), 'health:');
    const yes = classify(psychologist(), {
      [id]: { beneficiary: 'holder', profession: 'psychologist' },
    });
    expect(facts(yes).pfDetails.value.healthExpenses).toEqual([
      { amount: 320_000, cnaeOrProfession: 'psychologist', beneficiary: 'holder' },
    ]);
    const other = classify(psychologist(), { [id]: 'other' });
    expect(facts(other).pf.value.medicalExpenses).toBe(0);
    expect(facts(other).pfDetails.value.healthExpenses[0]).toMatchObject({
      beneficiary: 'other',
      cnaeOrProfession: 'unknown',
    });
    expect(classify(psychologist(), { [id]: 'no' })[0]?.classification.status).toBe('rejected');
    expect(
      classify(psychologist(), { [id]: { beneficiary: 'cousin' } })[0]?.classification.status,
    ).toBe('pending_confirmation');
  });

  it('education: the person answered caps per person; unanswered counts for the holder', () => {
    const school = () =>
      monthly(2, '2026-10', {
        holder: 'PF',
        description: 'BOLETO ESCOLA',
        method: 'BOLETO',
        cnpj: 'RFESC001000100',
        cnae: '8513-9/00',
        amountCents: 150_000,
      });
    const id = cardOf(classify(school()), 'education:');
    expect(questions(classify(school()))[0]?.options.map((o) => o.value)).toEqual([
      'holder',
      'dependent',
    ]);
    expect(facts(classify(school())).pfDetails.value.educationExpenses).toEqual([
      { person: 'holder', amount: 300_000 },
    ]);
    expect(
      facts(classify(school(), { [id]: 'dependent' })).pfDetails.value.educationExpenses,
    ).toEqual([{ person: 'dependent', amount: 300_000 }]);
    expect(classify(school(), { [id]: 'no' })[0]?.classification.status).toBe(
      'pending_confirmation',
    );
  });

  it('PGBL counts only when answered PGBL, in the analysis year; VGBL is rejected', () => {
    const pgbl = () => [
      tx({
        holder: 'PF',
        description: 'APORTE PGBL',
        method: 'BOLETO',
        amountCents: 200_000,
        date: '2026-03-10',
      }),
      tx({
        holder: 'PF',
        description: 'APORTE PGBL',
        method: 'BOLETO',
        amountCents: 100_000,
        date: '2025-12-10',
      }),
    ];
    const id = cardOf(classify(pgbl()), 'pgbl:');
    expect(questions(classify(pgbl()))[0]?.text).toMatch(/é PGBL ou VGBL\?$/);
    expect(facts(classify(pgbl())).pfDetails.value.pgblContributedThisYear).toBe(0);
    expect(facts(classify(pgbl(), { [id]: 'pgbl' })).pfDetails.value.pgblContributedThisYear).toBe(
      200_000,
    );
    expect(classify(pgbl(), { [id]: 'vgbl' })[0]?.classification.status).toBe('rejected');
    expect(classify(pgbl(), { [id]: 'x' })[0]?.classification.status).toBe('pending_confirmation');
  });
});

describe('confirmations, assumption cards and the LLM verdict', () => {
  it('a per-transaction confirmation wins over the card and closes it', () => {
    const fx = monthly(2, '2026-10', {
      direction: 'inflow',
      description: 'CAMBIO',
      method: 'FX',
      amountCents: 100,
    });
    const hits = applyRules(fx, ruleContext());
    const list = fx.map((t) => initial(t, hits.get(t.id), undefined, false));
    applyUserInput(
      list,
      new Map(),
      fx.map((t) => ({ transactionId: t.id, category: 'financial_income' as const })),
    );
    expect(
      list.every(
        (c) =>
          c.classification.status === 'confirmed' &&
          c.classification.category === 'financial_income',
      ),
    ).toBe(true);
    expect(questions(list).map((q) => q.id)).toEqual([CARD.worksInCompany]);
  });

  it('works-in-company is asked for Simples/Presumido only; bookkeeping only with distributions', () => {
    const none = buildQuestions([], { regime: 'MEI', answers: new Map() });
    expect(none).toEqual([]);
    const presumido = buildQuestions([], { regime: 'PRESUMIDO', answers: new Map() });
    expect(presumido.map((q) => q.id)).toEqual([CARD.worksInCompany]);
    const list = classify(
      [...holderPix(144_269), ...holderPix(1_800_000)],
      { [CARD.distribution]: 'yes' },
      holderCtx,
    );
    expect(questions(list).map((q) => q.id)).toContain(CARD.bookkeeping);
    const f = facts(list, { [CARD.bookkeeping]: 'yes', [CARD.worksInCompany]: 'no' });
    expect(f.companyDetails.value.hasFullBookkeeping).toBe(true);
    expect(f.partner.worksInCompany).toEqual({
      value: false,
      provenance: { origin: 'user', source: `question:${CARD.worksInCompany}` },
    });
  });

  it('every category reads in Portuguese on an LLM card', () => {
    const t = tx({ direction: 'inflow', description: 'X' });
    const c = initial(
      t,
      undefined,
      { category: 'financial_income', confidence: 0.9, reason: '', status: 'pending_confirmation' },
      true,
    );
    expect(c.cardId).toMatch(/^llm:financial_income:/);
    expect(questions([c])[0]?.text).toBe(
      `Estes 1 lançamentos (R$ 100,00 no total) são ${CATEGORY_LABEL.financial_income}?`,
    );
    expect(initial(t, undefined, undefined, true).classification).toMatchObject({
      origin: 'llm',
      status: 'unclassified',
    });
  });

  it('verdict: below 0.6 or "unclassified" is discarded; bad confidence or category is dropped', () => {
    const input = {
      transactionId: 't',
      redactedDescription: '',
      amountCents: 1,
      direction: 'outflow' as const,
      holder: 'PJ' as const,
      method: 'PIX',
      counterpartyType: null,
      counterpartyCnae: null,
      allowedCategories: ['operating_expense' as const, 'unclassified' as const],
    };
    expect(
      verdictOf(
        { transactionId: 't', category: 'operating_expense', confidence: 0.5, reason: 'x' },
        input,
      )?.status,
    ).toBe('unclassified');
    expect(
      verdictOf(
        { transactionId: 't', category: 'unclassified', confidence: 0.99, reason: 'x' },
        input,
      )?.status,
    ).toBe('unclassified');
    expect(
      verdictOf(
        { transactionId: 't', category: 'operating_expense', confidence: Number.NaN, reason: 'x' },
        input,
      ),
    ).toBeNull();
    expect(
      verdictOf({ transactionId: 't', category: 'salary', confidence: 0.99, reason: 'x' }, input),
    ).toBeNull();
    expect(
      verdictOf(
        { transactionId: 't', category: 'operating_expense', confidence: 0.99, reason: 7 as never },
        input,
      )?.reason,
    ).toBe('');
  });
});
