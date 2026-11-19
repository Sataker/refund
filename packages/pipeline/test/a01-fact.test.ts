// A01 input (ENGINE-SPEC D.7 / E.7; ARCHITECTURE §4.2 `Facts.personalExpensesInPj`, §6 whitelist): which PJ
// outflows reach the engine, under which label, and that the hero's other numbers do not move.
import type { YearMonth } from '@refund/engine';
import { describe, expect, it } from 'vitest';
import type { Classified } from '../src/classify/index.ts';
import { PERSONAL_MCC, PHARMACY_MCC } from '../src/classify/regex.ts';
import {
  ALLOWED_MERCHANT_LABELS,
  keywordLabel,
  OTHER_PERSONAL_LABEL,
  PERSON_PAYEE_LABEL,
  personalExpensesFact,
  personalMerchant,
} from '../src/personal-expenses.ts';
import type { Classification, NormalizedTransaction } from '../src/types.ts';
import { answerKey, heroAnswered, heroInput, idMap, persona, run } from './helpers.ts';

const key = answerKey();
const ids = idMap();

function tx(over: Partial<NormalizedTransaction> = {}): NormalizedTransaction {
  return {
    id: 't-1',
    accountId: 'pj',
    holder: 'PJ',
    date: '2026-05-12',
    month: '2026-05' as YearMonth,
    amountCents: 5590,
    direction: 'outflow',
    description: 'NETFLIX.COM',
    method: 'CARD',
    counterparty: null,
    sourceCategory: null,
    mcc: '4899',
    installment: null,
    ...over,
  };
}

function classified(t: NormalizedTransaction, over: Partial<Classification> = {}): Classified {
  return {
    tx: t,
    label: 'personal_in_pj',
    cardId: null,
    detail: {},
    classification: {
      transactionId: t.id,
      category: 'personal_expense_in_pj',
      confidence: 0.9,
      origin: 'rule',
      reason: 'Gasto pessoal pago pela empresa',
      status: 'applied',
      ...over,
    },
  };
}

const WINDOW = new Set<YearMonth>(['2026-05' as YearMonth]);

describe('A01 fact: which classifications count (D.7, E.7, E.9.2)', () => {
  it('a rule hit (applied) and a user confirmation count', () => {
    const fact = personalExpensesFact(
      [
        classified(tx()),
        classified(tx({ id: 't-2', description: 'COMPRA LOJA X', mcc: null }), {
          origin: 'user',
          status: 'confirmed',
        }),
      ],
      'SIMPLES',
      WINDOW,
    );
    expect(fact?.value.map((e) => e.transactionId)).toEqual(['t-1', 't-2']);
    expect(fact?.provenance).toMatchObject({
      origin: 'open_finance',
      transactionIds: ['t-1', 't-2'],
    });
  });

  it('an LLM guess never counts, applied or pending (E.1.3: personal_expense_in_pj feeds a finding)', () => {
    for (const status of ['applied', 'pending_confirmation'] as const) {
      expect(
        personalExpensesFact(
          [classified(tx(), { origin: 'llm', status, confidence: 0.99 })],
          'SIMPLES',
          WINDOW,
        ),
      ).toBeUndefined();
    }
  });

  it('a rejected, other-category, PF, inflow or out-of-window transaction does not count', () => {
    const none = [
      classified(tx(), { origin: 'user', status: 'rejected' }),
      classified(tx(), { category: 'operating_expense' }),
      classified(tx({ holder: 'PF' })),
      classified(tx({ direction: 'inflow' })),
      classified(tx({ month: '2026-04' as YearMonth })),
    ];
    for (const c of none) expect(personalExpensesFact([c], 'SIMPLES', WINDOW)).toBeUndefined();
  });

  it('only SIMPLES and MEI (D.7 text: "No Simples, despesa da empresa não reduz imposto")', () => {
    const list = [classified(tx())];
    expect(personalExpensesFact(list, 'SIMPLES', WINDOW)?.value).toHaveLength(1);
    expect(personalExpensesFact(list, 'MEI', WINDOW)?.value).toHaveLength(1);
    for (const regime of ['PRESUMIDO', 'REAL', 'OTHER'] as const)
      expect(personalExpensesFact(list, regime, WINDOW)).toBeUndefined();
  });
});

describe('A01 merchant allowlist (ARCHITECTURE §6.1)', () => {
  it('every label the module can return is in the allowlist', () => {
    // Each E.7 regex alternative as the regex captures it, plus the SUPERMERC\w* forms.
    const keywords = [
      'NETFLIX',
      'SPOTIFY',
      'DISNEY',
      'HBO',
      'MAX',
      'PRIME VIDEO',
      'GLOBOPLAY',
      'DEEZER',
      'YOUTUBE PREMIUM',
      'APPLE.COM/BILL',
      'SMART FIT',
      'SMARTFIT',
      'BLUEFIT',
      'SUPERMERC',
      'SUPERMERCADO',
      'ATACADAO',
      'ASSAI',
      'CARREFOUR',
      'PAO DE ACUCAR',
      'HORTIFRUTI',
    ];
    const seen = new Set<string>();
    for (const k of keywords) {
      const fired = personalMerchant(tx({ description: `COMPRA ${k} 123`, mcc: null }));
      expect(fired, k).not.toBe(OTHER_PERSONAL_LABEL);
      seen.add(fired);
    }
    for (const mcc of [...PERSONAL_MCC, PHARMACY_MCC])
      seen.add(personalMerchant(tx({ description: 'COMPRA LOJA', mcc })));
    seen.add(
      personalMerchant(
        tx({
          description: 'BOLETO COLEGIO ABC',
          method: 'BOLETO',
          mcc: null,
          counterparty: {
            document: { type: 'CNPJ', hmac: null, publicValue: 'RFESCOLA0001', mask: 'x' },
            name: null,
            cnae: '8513-9/00',
          },
        }),
      ),
    );
    seen.add(personalMerchant(tx({ description: 'COMPRA LOJA', mcc: null })));
    seen.add(
      personalMerchant(
        tx({
          counterparty: {
            document: { type: 'CPF', hmac: null, publicValue: null, mask: '***.456.789-**' },
            name: null,
            cnae: null,
          },
        }),
      ),
    );
    for (const label of seen) expect(ALLOWED_MERCHANT_LABELS.has(label), label).toBe(true);
    expect(seen).toContain('ESCOLA');
    expect(seen).toContain(OTHER_PERSONAL_LABEL);
    expect(seen).toContain(PERSON_PAYEE_LABEL);
  });

  it('an unknown keyword (a widened regex) falls back to the generic label, never the text', () => {
    expect(keywordLabel('JOAO DA SILVA')).toBe(OTHER_PERSONAL_LABEL);
    expect(keywordLabel('PADARIA DO ZE')).toBe(OTHER_PERSONAL_LABEL);
    expect(keywordLabel('NETFLIX')).toBe('NETFLIX');
  });
});

describe('A01 merchant label: closed vocabulary, never the statement text (ARCHITECTURE §6; CLAUDE.md rule 4)', () => {
  it('the E.7 keyword that fired, normalized', () => {
    expect(personalMerchant(tx())).toBe('NETFLIX');
    expect(personalMerchant(tx({ description: 'SUPERMERC VILA SERENA', mcc: '5411' }))).toBe(
      'SUPERMERCADO',
    );
    expect(personalMerchant(tx({ description: 'SUPERMERCADO BOA COMPRA LTDA', mcc: null }))).toBe(
      'SUPERMERCADO',
    );
    expect(personalMerchant(tx({ description: 'SMARTFIT UNIDADE 12', mcc: null }))).toBe(
      'SMART FIT',
    );
  });

  it('by MCC when no keyword fired; the rest of the description never leaks', () => {
    expect(personalMerchant(tx({ description: 'MERCADINHO JOSE DA SILVA', mcc: '5411' }))).toBe(
      'SUPERMERCADO',
    );
    expect(personalMerchant(tx({ description: 'ACADEMIA MARIA SOUZA', mcc: '7997' }))).toBe(
      'CLUBE OU ACADEMIA',
    );
    expect(personalMerchant(tx({ description: 'DROGARIA X', mcc: '5912' }))).toBe('FARMÁCIA');
  });

  it('a school by CNAE; anything else gets the generic label', () => {
    const school = tx({
      description: 'BOLETO COLEGIO ABC',
      method: 'BOLETO',
      mcc: null,
      counterparty: {
        document: { type: 'CNPJ', hmac: null, publicValue: 'RFESCOLA0001', mask: 'x' },
        name: 'COLEGIO ABC LTDA',
        cnae: '8513-9/00',
      },
    });
    expect(personalMerchant(school)).toBe('ESCOLA');
    expect(personalMerchant(tx({ description: 'COMPRA LOJA FULANO', mcc: null }))).toBe(
      OTHER_PERSONAL_LABEL,
    );
  });

  it('a payment to a CPF never shows the name, even when a keyword fired ("PIX ENVIADO MAX PEREIRA")', () => {
    const pix = tx({
      description: 'PIX ENVIADO MAX PEREIRA',
      method: 'PIX',
      mcc: null,
      counterparty: {
        document: { type: 'CPF', hmac: null, publicValue: null, mask: '***.456.789-**' },
        name: null,
        cnae: null,
      },
    });
    expect(personalMerchant(pix)).toBe(PERSON_PAYEE_LABEL);
  });
});

const { result, events } = await heroAnswered();
const fact = result.facts?.personalExpensesInPj;

describe('A01 on the hero (F.2 "Personal PJ card"; F.4)', () => {
  it('Netflix 12× + supermarket 1× = R$ 1.483,20, the answer key transactions', () => {
    const want = key.transactions.filter((t) => t.label === 'personal_in_pj');
    expect(fact?.value).toHaveLength(13);
    expect(fact?.value.reduce((a, e) => a + e.amount, 0)).toBe(148320);
    expect(fact?.value.reduce((a, e) => a + e.amount, 0)).toBe(
      key.expectedFacts.totals12m.personalOnPjCard,
    );
    expect([...(fact?.value.map((e) => e.transactionId) ?? [])].sort()).toEqual(
      want.map((t) => ids.get(t.sourceId) ?? t.sourceId).sort(),
    );
    const count = (m: string) => fact?.value.filter((e) => e.merchant === m).length;
    expect(count('NETFLIX')).toBe(12);
    expect(count('SUPERMERCADO')).toBe(1);
    expect(fact?.value.find((e) => e.merchant === 'SUPERMERCADO')).toMatchObject({
      month: '2026-03',
      amount: 81240,
    });
  });

  it('A01 fires as a risk outside the total; savings12m and every other number stay', () => {
    const a01 = result.engineResult?.findings.find((f) => f.ruleId === 'A01');
    expect(a01).toMatchObject({ type: 'risk', countsInTotal: false, marginalValue12m: 0 });
    expect(a01?.confidence).toBe('confirmed');
    expect(result.engineResult?.total).toEqual(key.total);
    const alert = events.find((e) => e.type === 'alert' && e.finding.ruleId === 'A01');
    expect(alert).toBeDefined();
  });

  it('every merchant label in the persona run is from the closed vocabulary (no person, no legal name)', () => {
    const allowed = /^[A-ZÀ-Ú./ ]+$/u;
    for (const e of fact?.value ?? []) {
      expect(e.merchant).toMatch(allowed);
      expect(e.merchant).not.toBe(persona().company.displayLegalName);
    }
  });

  it('PJ accounts only (the /demo "só PJ" switch) still fires A01 on the hero', async () => {
    const data = persona();
    const pjOnly = data.items.filter((i) => i.holder === 'PJ');
    const { result: r } = await run(heroInput({}, { ...data, items: pjOnly }));
    expect(r.facts?.personalExpensesInPj?.value).toHaveLength(13);
  });
});
