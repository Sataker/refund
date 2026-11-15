// E9 review findings (engine review H1–H3, M1, M2; code review #1, #3, #4), each one a reviewer probe turned into
// a test. The hero's four numbers must not move.
import { addMonths, type CivilDate, monthRange, type YearMonth } from '@refund/engine';
import type { PersonaData } from '@refund/personas';
import type { SourceTransaction } from '@refund/sources';
import { describe, expect, it } from 'vitest';
import { applyRules, applyUserInput, CARD, initial } from '../src/classify/index.ts';
import { buildFacts } from '../src/facts.ts';
import { type AnalysisEvent, runAnalysis, transactionId } from '../src/index.ts';
import { buildQuestions } from '../src/questions.ts';
import { COMPANY_CNPJ, ruleContext, tx } from './build.ts';
import {
  answersFromKey,
  deps,
  drain,
  fixedClock,
  heroAnswered,
  heroInput,
  persona,
  run,
  sumSeries,
  templatePort,
} from './helpers.ts';

const F2 = (await heroAnswered()).answers;
const HERO = {
  savings12m: 6231892,
  annualRegimeSavings: 7400628,
  recoveryRange: [3978768, 19893840],
};

const label = (t: ReturnType<typeof tx>) => applyRules([t], ruleContext()).get(t.id);

const pjAccount = (d: PersonaData) => {
  const pj = d.items.find((i) => i.holder === 'PJ');
  const a = pj?.accounts[0];
  if (a === undefined) throw new Error('no PJ account');
  return a;
};
const cardAccount = (d: PersonaData) => {
  const a = d.items.find((i) => i.holder === 'PJ')?.accounts[1];
  if (a === undefined) throw new Error('no PJ card');
  return a;
};
const extra = (
  accountSourceId: string,
  o: Partial<SourceTransaction> &
    Pick<SourceTransaction, 'sourceId' | 'date' | 'amountCents' | 'description'>,
): SourceTransaction => ({
  accountSourceId,
  pluggyType: o.amountCents > 0 ? 'CREDIT' : 'DEBIT',
  method: 'PIX',
  sourceCategory: null,
  counterparty: null,
  mcc: null,
  installment: null,
  ...o,
});

/** Runs the hero with a mutation, answering the F.2 cards (+ `more`), as probe2 does. */
async function mutatedHero(mutate: (d: PersonaData) => void, more: Record<string, unknown> = {}) {
  const data = persona();
  mutate(data);
  const first = await run(heroInput({}, data), deps());
  const answers = [
    ...answersFromKey(first.result.questions),
    ...Object.entries(more).map(([questionId, value]) => ({ questionId, value: value as never })),
  ];
  const second = await run(heroInput({ answers }, data), deps());
  return { first, second };
}

const companyDoc = { type: 'CNPJ' as const, hmac: null, publicValue: COMPANY_CNPJ, mask: 'x' };

describe('H1a: a credit from the company’s own CNPJ (another bank) is never revenue', () => {
  it('rule: own-account transfer, same holder, applied', () => {
    const t = tx({
      direction: 'inflow',
      description: 'TED RECEBIDA MARINA DEV LTDA',
      method: 'TED',
      cnpj: COMPANY_CNPJ,
      amountCents: 500000,
    });
    expect(label(t)).toMatchObject({
      label: 'own_account',
      category: 'same_holder_transfer',
      cardId: null,
    });
    const out = tx({
      description: 'TED ENVIADA MARINA DEV LTDA',
      method: 'TED',
      cnpj: COMPANY_CNPJ,
    });
    expect(label(out)?.label).toBe('own_account');
  });

  it('hero + own-account TED 5.000: revenue and the four numbers unchanged', async () => {
    const { second } = await mutatedHero((d) => {
      const a = pjAccount(d);
      a.transactions.push(
        extra(a.account.sourceId, {
          sourceId: 'probe-own',
          date: '2026-05-15',
          amountCents: 500000,
          description: 'TED RECEBIDA MARINA DEV LTDA',
          method: 'TED',
          counterparty: { document: companyDoc, name: 'MARINA DEV LTDA', cnae: null },
        }),
      );
    });
    expect(sumSeries(second.result.facts?.monthlyRevenue.value ?? {})).toBe(60_000_000);
    expect(second.result.engineResult?.total).toMatchObject(HERO);
  });
});

describe('H1b: refunds and redemptions are not revenue until confirmed', () => {
  it.each([
    'PIX RECEBIDO ESTORNO FORNECEDOR',
    'DEVOLUCAO PIX',
    'RESGATE CDB',
    'REEMBOLSO DESPESA',
    'RENDIMENTO APLICACAO',
  ])('%s → reversal card, category undecided', (description) => {
    const h = label(
      tx({
        direction: 'inflow',
        description,
        method: 'PIX',
        cnpj: 'RFFORN01000100',
        amountCents: 30000,
      }),
    );
    expect(h?.label).toBe('reversal_credit');
    expect(h?.category).toBe('unclassified');
    expect(h?.cardId).toMatch(/^reversal:/);
  });

  it('hero + supplier refund 3.000: revenue unchanged, a card asks; "yes" makes it revenue', async () => {
    const add = (d: PersonaData) => {
      const a = pjAccount(d);
      a.transactions.push(
        extra(a.account.sourceId, {
          sourceId: 'probe-est',
          date: '2026-05-15',
          amountCents: 300000,
          description: 'PIX RECEBIDO ESTORNO - FORNECEDOR XYZ LTDA',
          counterparty: {
            document: { type: 'CNPJ', hmac: null, publicValue: 'RFFORN01000100', mask: 'x' },
            name: 'FORNECEDOR XYZ LTDA',
            cnae: null,
          },
        }),
      );
    };
    const { second } = await mutatedHero(add);
    expect(sumSeries(second.result.facts?.monthlyRevenue.value ?? {})).toBe(60_000_000);
    const card = second.result.questions.find((q) => q.id.startsWith('reversal:'));
    expect(card?.text).toMatch(/receita/);
    expect(second.result.engineResult?.total).toMatchObject(HERO);
    const yes = await mutatedHero(add, { [card?.id ?? '']: 'yes' });
    expect(sumSeries(yes.second.result.facts?.monthlyRevenue.value ?? {})).toBe(60_300_000);
  });
});

describe('H2: the gross payroll card takes a per-month Series, never a single number', () => {
  it('a single number does not confirm: the payroll stays a visible assumption and the card stays open', async () => {
    const single = F2.map((a) =>
      a.questionId === CARD.payrollGross ? { ...a, value: 1020000 } : a,
    );
    const { result } = await run(heroInput({ answers: single }));
    expect(result.facts?.cltPayroll.grossPay.provenance.origin).toBe('default_assumption');
    const q = result.questions.find((x) => x.id === CARD.payrollGross);
    expect(q?.text).toBe('Qual foi a folha bruta paga em cada mês (com 13º e férias)?');
  });

  it('the Series answer is cash basis, 13º and vacation included (F.2)', async () => {
    const { result } = await run(heroInput({ answers: F2 }));
    expect(result.facts?.cltPayroll.grossPay.provenance.origin).toBe('user');
    expect(result.facts?.cltPayroll.grossPay.value['2025-12']).toBe(2210000);
  });
});

describe('H3: DAS only from a tax payment, and two DAS for one PA are flagged', () => {
  it.each([
    [{ description: 'PIX ENVIADO MARIA DAS GRACAS SOUZA', cpf: '***.111.222-**' }],
    [{ description: 'COMPRA CARTAO REI DAS COXINHAS', method: 'CARD' as const, mcc: '5812' }],
    [
      {
        description: 'TED ENVIADA LOJA DAS TINTAS',
        method: 'TED' as const,
        cnpj: 'RFLOJA01000100',
      },
    ],
  ])('%o is not das_simples', (p) => {
    expect(label(tx(p))?.label).not.toBe('das_simples');
  });

  it('a DAS boleto still is', () => {
    expect(label(tx({ description: 'SIMPLES NACIONAL DAS', method: 'BOLETO' }))?.label).toBe(
      'das_simples',
    );
  });

  it('hero + 3× card "REI DAS COXINHAS": still 12 DAS and the four numbers', async () => {
    const { second } = await mutatedHero((d) => {
      const a = cardAccount(d);
      for (const m of ['2026-03', '2026-06', '2026-09']) {
        a.transactions.push(
          extra(a.account.sourceId, {
            sourceId: `probe-das${m}`,
            date: `${m}-25` as CivilDate,
            amountCents: -4500,
            description: 'REI DAS COXINHAS',
            method: 'CARD',
            mcc: '5812',
            counterparty: { document: null, name: 'REI DAS COXINHAS', cnae: null },
          }),
        );
      }
    });
    expect(second.result.facts?.dasPaid.value).toHaveLength(12);
    expect(second.result.engineResult?.total).toMatchObject(HERO);
  });

  it('hero + boleto "CASA DAS TINTAS" in sep/26: the payment with the DAS marker wins, no card (re-review #2)', async () => {
    const { second } = await mutatedHero((d) => {
      const a = pjAccount(d);
      a.transactions.push(
        extra(a.account.sourceId, {
          sourceId: 'probe-das2',
          date: '2026-09-28',
          amountCents: -120000,
          description: 'PAGAMENTO BOLETO CASA DAS TINTAS LTDA',
          method: 'BOLETO',
          counterparty: {
            document: { type: 'CNPJ', hmac: null, publicValue: 'RFCASA01000100', mask: 'x' },
            name: 'CASA DAS TINTAS',
            cnae: null,
          },
        }),
      );
    });
    expect(second.result.questions.some((q) => q.id.startsWith('das:'))).toBe(false);
    expect(second.result.facts?.dasPaid.value).toHaveLength(12);
    expect(second.result.engineResult?.total).toMatchObject(HERO);
  });

  it('two marked DAS for one PA (DAS + complementary) stay ambiguous → a card, never an overwrite', async () => {
    let complementId = '';
    const add = (d: PersonaData) => {
      const a = pjAccount(d);
      a.transactions.push(
        extra(a.account.sourceId, {
          sourceId: 'probe-das3',
          date: '2026-09-28',
          amountCents: -120000,
          description: 'PAGAMENTO DAS - SIMPLES NACIONAL PA 08/2026',
          method: 'BOLETO',
        }),
      );
      complementId = transactionId(a.account.sourceId, 'probe-das3');
    };
    const { second } = await mutatedHero(add);
    const card = second.result.questions.find((q) => q.id === 'das:2026-08');
    expect(card?.transactionIds).toHaveLength(2);
    expect(card?.options.map((o) => o.value)).toContain('all');
    const pa = second.result.facts?.dasPaid.value.filter((d) => d.pa === '2026-08') ?? [];
    expect(pa).toHaveLength(0);
    const realDas = card?.transactionIds.find((id) => id !== complementId) ?? '';
    const answered = await mutatedHero(add, { 'das:2026-08': realDas });
    expect(answered.second.result.facts?.dasPaid.value).toHaveLength(12);
    expect(answered.second.result.engineResult?.total).toMatchObject(HERO);
    const both = await mutatedHero(add, { 'das:2026-08': 'all' });
    expect(both.second.result.facts?.dasPaid.value.find((d) => d.pa === '2026-08')?.amount).toBe(
      892500 + 120000,
    );
  });
});

describe('GPS needs a boleto (E.3)', () => {
  it('PIX "GPS TRACKER" is not INSS; a GPS boleto is', () => {
    expect(
      label(
        tx({ description: 'PIX ENVIADO DIAS GPS TRACKER', method: 'PIX', cnpj: 'RFGPST01000100' }),
      )?.label,
    ).not.toBe('gps_inss');
    expect(label(tx({ description: 'PAGAMENTO GPS INSS 2100', method: 'BOLETO' }))?.label).toBe(
      'gps_inss',
    );
  });
});

describe('M1: the January minimum-wage raise does not split the pró-labore', () => {
  it('pró-labore 1.351,02 in nov–dec/25 and 1.442,69 in 2026: all 12 are pró-labore, none a distribution', async () => {
    const data = persona();
    for (const it of data.items)
      for (const a of it.accounts)
        for (const t of a.transactions)
          if (Math.abs(t.amountCents) === 144269 && t.date < '2026-01-01')
            t.amountCents = Math.sign(t.amountCents) * 135102;
    const { result } = await run(heroInput({}, data));
    const pl = result.classifications.filter((c) => c.ruleId === 'pro_labore');
    expect(pl).toHaveLength(12);
    const answers = answersFromKey(result.questions);
    const second = await run(heroInput({ answers }, data));
    const dist = second.result.facts?.partner.distributions.value ?? [];
    expect(dist.reduce((a, d) => a + d.grossAmount, 0)).toBe(28_800_000);
  });
});

describe('M2: "no" on the pró-labore card routes the transfers to the distribution card', () => {
  const holder = { description: 'PIX ENVIADO [pessoa]', cpf: '***.711.985-**', hmac: 'h' };
  const ctx = ruleContext({ identity: { cpfHmac: 'h', cnpj: COMPANY_CNPJ, pfConnected: true } });
  const months = ['2026-07', '2026-08', '2026-09', '2026-10'];
  const txs = () => [
    ...months.map((m) => tx({ ...holder, amountCents: 144269, date: `${m}-07` as CivilDate })),
    ...months.map((m) => tx({ ...holder, amountCents: 1800000, date: `${m}-08` as CivilDate })),
  ];
  const classify = (answers: Record<string, unknown>) => {
    const list = txs();
    const hits = applyRules(list, ctx);
    const out = list.map((t) => initial(t, hits.get(t.id), undefined, false));
    applyUserInput(out, new Map(Object.entries(answers) as never), []);
    return out;
  };

  it('unanswered distribution: the former pró-labore waits in the distribution card', () => {
    const out = classify({ [CARD.proLaboreGross]: 'no' });
    expect(out.every((c) => c.cardId === CARD.distribution)).toBe(true);
    expect(out.every((c) => c.classification.status === 'pending_confirmation')).toBe(true);
    const q = buildQuestions(out, {
      regime: 'SIMPLES',
      answers: new Map([[CARD.proLaboreGross, 'no']]),
    });
    expect(q.find((x) => x.id === CARD.distribution)?.transactionIds).toHaveLength(8);
  });

  it('then "yes" on distribution confirms all of them as distributions', () => {
    const out = classify({ [CARD.proLaboreGross]: 'no', [CARD.distribution]: 'yes' });
    expect(
      out.every(
        (c) =>
          c.classification.category === 'profit_distribution' &&
          c.classification.status === 'confirmed',
      ),
    ).toBe(true);
    const f = buildFacts({
      classified: out,
      answers: new Map(),
      company: persona().company,
      referenceMonth: '2026-10',
      analysisDate: '2026-11-12',
      userAssumptions: {},
    });
    expect(f.ok && sumSeries(f.value.partner.grossProLabore.value)).toBe(0);
  });
});

describe('code review #1: a port that throws synchronously never aborts the analysis', () => {
  const syncThrow = () => {
    throw new Error('sync');
  };
  it('classify and explain throwing synchronously: findings survive, explanations fall back', async () => {
    const data = persona();
    const a = pjAccount(data);
    a.transactions.push(
      extra(a.account.sourceId, {
        sourceId: 'zz-1',
        date: '2026-10-10',
        amountCents: -3333,
        description: 'ALGO DESCONHECIDO',
        method: 'BOLETO',
      }),
    );
    const { events, result } = await run(
      heroInput({ answers: F2 }, data),
      deps({ llm: templatePort({ classify: syncThrow as never, explain: syncThrow as never }) }),
    );
    expect(events.some((e) => e.type === 'error')).toBe(false);
    expect(events.filter((e) => e.type === 'explanation')).toHaveLength(4);
    expect(result.engineResult?.total).toMatchObject(HERO);
  });
});

describe('code review #3/#4: the catch-all keeps the stage, the real status, and nothing throws', () => {
  it('an explanation-stage failure carries stage and the run’s real end status', async () => {
    const { events } = await run(
      heroInput(),
      deps({
        article: () => {
          throw new Error('corpus down');
        },
      }),
    );
    expect(events.at(-2)).toMatchObject({
      type: 'error',
      code: 'PIPELINE_FAILED',
      stage: 'explanation',
    });
    expect(events.at(-1)).toMatchObject({ type: 'end', status: 'awaiting_confirmation' });
  });

  it('a clock that throws or a malformed input never throws across the package', async () => {
    const bad = deps({
      clock: {
        today: fixedClock().today,
        now: () => {
          throw new Error('clock');
        },
      },
    });
    const a = await drain(runAnalysis(heroInput(), bad));
    expect(a.events.map((e: AnalysisEvent) => e.type)).toEqual(['error', 'end']);
    const b = await drain(runAnalysis({ ...heroInput(), accounts: undefined as never }, deps()));
    expect(b.events.map((e) => e.type)).toEqual(['error', 'end']);
  });
});

describe('re-review #1: the reference year early in the calendar keeps its pró-labore', () => {
  const holder = { description: 'PIX ENVIADO [pessoa]', cpf: '***.711.985-**', hmac: 'h' };
  const ctx = (referenceMonth: YearMonth) =>
    ruleContext({
      referenceMonth,
      identity: { cpfHmac: 'h', cnpj: COMPANY_CNPJ, pfConnected: true },
    });
  // Minimum-wage pró-labore: 1.442,69 net in 2026, 1.527,00 net from January 2027; distributions of 18.000,00.
  const scenario = (referenceMonth: YearMonth) => {
    const months = monthRange(addMonths(referenceMonth, -11), referenceMonth);
    return months.flatMap((m) => [
      tx({ ...holder, amountCents: m < '2027-01' ? 144269 : 152700, date: `${m}-07` as CivilDate }),
      tx({ ...holder, amountCents: 1800000, date: `${m}-08` as CivilDate }),
    ]);
  };
  it.each(['2027-01', '2027-02', '2027-03', '2026-10'] as YearMonth[])(
    'reference %s: every monthly 1.4–1.5 mil transfer is pró-labore, every 18.000 a distribution',
    (ref) => {
      const list = scenario(ref);
      const hits = applyRules(list, ctx(ref));
      for (const t of list) {
        expect(hits.get(t.id)?.label, `${t.date} ${t.amountCents}`).toBe(
          t.amountCents === 1800000 ? 'distribution' : 'pro_labore',
        );
      }
    },
  );
});
