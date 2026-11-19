import { describe, expect, it } from 'vitest';
import { amountClusters, isRecurring, pairSameHolder } from '../src/classify/identity.ts';
import { applyRules, CARD } from '../src/classify/rules.ts';
import { normalizeTransaction } from '../src/normalize.ts';
import type { NormalizedTransaction } from '../src/types.ts';
import { COMPANY_CNPJ, identity, monthly, ruleContext, tx } from './build.ts';
import { answerKey, idMap, persona } from './helpers.ts';

const labelOf = (
  t: ReturnType<typeof tx>,
  ctx = ruleContext(),
  extra: ReturnType<typeof tx>[] = [],
) => applyRules([t, ...extra], ctx).get(t.id);

describe('A01 personal expense in the PJ (ENGINE-SPEC D.7 / E.7)', () => {
  const card = (description: string, mcc: string | null) =>
    tx({ description, mcc, method: 'CARD', name: description });
  it.each([
    ['TA1-01', card('NETFLIX.COM', '4899'), true],
    ['TA1-02', card('SUPERMERCADO X', '5411'), true],
    ['TA1-03', card('AMAZON WEB SERVICES', '7372'), false],
    ['TA1-04', card('RESTAURANTE BOM PRATO', '5812'), false],
    // ENGINE-SPEC TA1-05 is a "PJ debit" purchase: Pluggy gives it no paymentMethod and no card metadata (OTHER).
    ['TA1-05', tx({ description: 'SMART FIT', method: 'OTHER' }), true],
    [
      'TA1-06',
      tx({
        description: 'BOLETO ESCOLA',
        method: 'BOLETO',
        cnpj: 'RFESC001000100',
        cnae: '8513-9/00',
      }),
      true,
    ],
    ['TA1-08', card('DROGARIA CENTRAL', '5912'), true],
    ['TA1-10', card('SPOTIFY', '5815'), true],
    ['TA1-11', card('LATAM AIRLINES', '4511'), false],
  ])('%s', (_id, t, personal) => {
    expect(labelOf(t)?.label === 'personal_in_pj').toBe(personal);
  });

  // D34 (ENGINE-SPEC E.7): the text patterns only on card and debit purchases; on Pix, TED and boletos the
  // description names a person or a supplier. The MCC and the school-CNAE paths are unchanged.
  it.each([
    ['Pix to a person', tx({ description: 'PIX ENVIADO MAX PEREIRA', method: 'PIX' })],
    ['supplier boleto', tx({ description: 'DISTRIBUIDORA SUPERMERCADISTA', method: 'BOLETO' })],
    ['boleto to ATACADAO', tx({ description: 'ATACADAO', method: 'BOLETO' })],
    ['TED', tx({ description: 'TED NETFLIX', method: 'TED' })],
    ['DOC', tx({ description: 'DOC SMART FIT', method: 'DOC' })],
    ['Pix SMART FIT', tx({ description: 'SMART FIT', method: 'PIX' })],
  ])('D34: the E.7 regex does not fire on %s', (_name, t) => {
    expect(labelOf(t)?.label).not.toBe('personal_in_pj');
  });

  it('D34: a card purchase "NETFLIX.COM" still fires, by the regex alone (no MCC)', () => {
    expect(labelOf(card('NETFLIX.COM', null))?.label).toBe('personal_in_pj');
  });

  it('D34: the MCC path ignores the method; a Pix to a school CNPJ still fires', () => {
    expect(labelOf(tx({ description: 'X', mcc: '5411', method: 'OTHER' }))?.label).toBe(
      'personal_in_pj',
    );
    expect(
      labelOf(
        tx({ description: 'PIX ESCOLA', method: 'PIX', cnpj: 'RFESC001000100', cnae: '8513-9/00' }),
      )?.label,
    ).toBe('personal_in_pj');
  });

  it('TA1-07: pharmacy at a health company (CNAE 86xx) is not personal', () => {
    const t = card('DROGARIA CENTRAL', '5912');
    expect(labelOf(t, ruleContext({ primaryCnae: '8630-5/04' }))?.label).not.toBe('personal_in_pj');
  });

  it('TA1-09: Netflix on the PF card is the right account', () => {
    expect(
      labelOf(tx({ holder: 'PF', description: 'NETFLIX.COM', mcc: '4899', method: 'CARD' }))?.label,
    ).toBeUndefined();
  });

  it('TA1-12: the same merchant 12 times → 12 classified, applied directly (one A01 finding is the engine’s)', () => {
    const list = monthly(12, '2026-10', {
      description: 'NETFLIX.COM',
      mcc: '4899',
      method: 'CARD',
    });
    const hits = applyRules(list, ruleContext());
    expect(list.every((t) => hits.get(t.id)?.category === 'personal_expense_in_pj')).toBe(true);
    expect(list.every((t) => hits.get(t.id)?.cardId === null)).toBe(true);
  });
});

describe('tax payments (E.3)', () => {
  it.each([
    ['PAGAMENTO DAS - SIMPLES NACIONAL PA 10/2025', 'das_simples', 'das_tax'],
    ['PAGAMENTO DAS MEI', 'das_mei', 'das_tax'],
    ['PAGAMENTO DARF 1841 - IRRF', 'darf_irrf_dividends', 'darf_tax'],
    ['DARF 0588 PRO LABORE', 'darf_irrf_employment', 'darf_tax'],
    ['PAGAMENTO DARF NUMERADO - DCTFWEB PA 01/2026', 'dctfweb', 'darf_tax'],
    ['PAGAMENTO GUIA FGTS DIGITAL - GFD COMP 10/2025', 'fgts', 'fgts_charge'],
    ['GPS 2003 INSS', 'gps_inss', 'inss_charge'],
  ])('%s → %s', (description, label, category) => {
    const h = labelOf(tx({ description, method: 'BOLETO' }));
    expect(h).toMatchObject({ label, category, cardId: null });
  });

  it('carnê-leão only in the PF; GPS never on a card payment', () => {
    expect(
      labelOf(tx({ holder: 'PF', description: 'DARF 0190 CARNE LEAO', method: 'BOLETO' }))?.label,
    ).toBe('carne_leao');
    expect(
      labelOf(tx({ description: 'GPS TRACKER LTDA', method: 'CARD', mcc: '5732' }))?.label,
    ).toBeUndefined();
  });
});

describe('inflows (E.3)', () => {
  it('FX by description, method or platform name → export, with the group card', () => {
    for (const t of [
      tx({ direction: 'inflow', description: 'CAMBIO - ORDEM DE PAGAMENTO DO EXTERIOR' }),
      tx({ direction: 'inflow', description: 'CREDITO', method: 'FX' }),
      tx({ direction: 'inflow', description: 'TED RECEBIDA', name: 'PAYONEER INC', method: 'TED' }),
    ]) {
      expect(labelOf(t)).toMatchObject({ label: 'export_revenue', cardId: CARD.export });
    }
  });

  it('loans stay out of revenue; domestic receipts are revenue, with a card above 20% of the month', () => {
    expect(labelOf(tx({ direction: 'inflow', description: 'CREDITO PRONAMPE' }))?.label).toBe(
      'loan_received',
    );
    const small = tx({
      direction: 'inflow',
      description: 'PIX RECEBIDO',
      cnpj: 'RFCLI001000100',
      amountCents: 100,
    });
    const big = tx({
      direction: 'inflow',
      description: 'PIX RECEBIDO',
      cnpj: 'RFCLI002000100',
      amountCents: 900,
    });
    const hits = applyRules([small, big], ruleContext({ revenueCategory: 'sales_revenue' }));
    expect(hits.get(small.id)).toMatchObject({
      label: 'domestic_revenue',
      category: 'sales_revenue',
      cardId: null,
    });
    expect(hits.get(big.id)?.cardId).toMatch(/^revenue:/);
  });

  it('a credit without document or pattern is left for the LLM', () => {
    expect(labelOf(tx({ direction: 'inflow', description: 'CREDITO DIVERSO' }))).toBeUndefined();
  });

  it('a credit from the holder (mirror of rule 3) is a contribution card; its PF leg is a same-holder transfer', () => {
    const pj = tx({
      direction: 'inflow',
      description: 'PIX RECEBIDO [pessoa]',
      cpf: '***.711.985-**',
      amountCents: 500000,
    });
    const pf = tx({
      holder: 'PF',
      direction: 'outflow',
      description: 'PIX ENVIADO MARINA DEV',
      cnpj: COMPANY_CNPJ,
      amountCents: 500000,
      date: '2026-10-11',
    });
    const hits = applyRules([pj, pf], ruleContext());
    expect(hits.get(pj.id)).toMatchObject({
      label: 'partner_contribution',
      category: 'same_holder_transfer',
    });
    expect(hits.get(pj.id)?.cardId).toMatch(/^contribution:/);
    expect(hits.get(pf.id)).toMatchObject({
      label: 'same_holder',
      category: 'same_holder_transfer',
    });
  });
});

describe('PF deductions (E.6)', () => {
  const pf = (cnae: string) =>
    tx({ holder: 'PF', description: 'BOLETO', method: 'BOLETO', cnpj: 'RFPRO001000100', cnae });
  it.each([
    ['6550-2/00', 'deductible_health', null],
    ['8630-5/99', 'health_to_confirm', 'health:'],
    ['8513-9/00', 'deductible_education', 'education:'],
    ['9313-1/00', 'non_deductible', null],
    ['8593-7/00', 'non_deductible', null],
    ['4771-7/01', 'non_deductible', null],
  ])('%s → %s', (cnae, label, card) => {
    const h = labelOf(pf(cnae));
    expect(h?.label).toBe(label);
    if (card === null) expect(h?.cardId).toBeNull();
    else expect(h?.cardId?.startsWith(card)).toBe(true);
  });

  it('PGBL is a card (PGBL or VGBL?) and a fee is a fee', () => {
    expect(
      labelOf(tx({ holder: 'PF', description: 'APORTE PGBL', method: 'BOLETO' }))?.cardId,
    ).toMatch(/^pgbl:/);
    expect(labelOf(tx({ holder: 'PF', description: 'TARIFA PACOTE', method: 'FEE' }))?.label).toBe(
      'bank_fee',
    );
  });

  it('a recurring Pix to a CPF from the PF is health to confirm; a one-off one is left for the LLM', () => {
    const recurring = monthly(4, '2026-10', {
      holder: 'PF',
      description: 'PIX ENVIADO [pessoa]',
      cpf: '***.111.222-**',
      amountCents: 80000,
    });
    const once = tx({ holder: 'PF', description: 'PIX ENVIADO [pessoa]', cpf: '***.333.444-**' });
    const hits = applyRules([...recurring, once], ruleContext());
    expect(recurring.every((t) => hits.get(t.id)?.label === 'health_to_confirm')).toBe(true);
    expect(hits.get(once.id)).toBeUndefined();
  });
});

describe('same holder, pró-labore × distribution and CLT salary (E.2)', () => {
  it('the hero: every one of the 24 answer-key pairs matches by rule 3 (EXECUTION §9, 12/11 E9 row)', () => {
    const key = answerKey();
    const data = persona();
    const ids = idMap(data);
    const txs = data.items.flatMap((i) => i.accounts.flatMap((a) => a.transactions));
    const accounts = new Map(
      data.items.flatMap((i) => i.accounts.map((a) => [a.account.sourceId, a.account])),
    );
    const normalized = txs.flatMap((t) => {
      const n = normalizeTransaction(t, accounts);
      return n.ok ? [n.value] : [];
    });
    const pairs = pairSameHolder(normalized, identity(), 'outflow');
    expect(pairs.size).toBe(24);
    for (const p of key.sameHolderPairs) {
      expect(pairs.get(ids.get(p.pjTransactionId) ?? '')).toBe(ids.get(p.pfTransactionId));
    }
  });

  it('rule 1: the payee’s CPF HMAC equal to the holder’s identifies the holder without the PF account', () => {
    const list = monthly(4, '2026-10', {
      description: 'PIX ENVIADO [pessoa]',
      cpf: '***.711.985-**',
      hmac: 'h-holder',
      amountCents: 144269,
    });
    const hits = applyRules(
      list,
      ruleContext({ identity: identity({ cpfHmac: 'h-holder', pfConnected: false }) }),
    );
    expect(list.every((t) => hits.get(t.id)?.label === 'pro_labore')).toBe(true);
  });

  it('two recurring clusters: the one with payroll DARF wins, then the smaller amount; the rest is distribution', () => {
    const holder = {
      description: 'PIX ENVIADO [pessoa]',
      cpf: '***.711.985-**',
      hmac: 'h',
      amountCents: 0,
    };
    const pl = monthly(4, '2026-10', { ...holder, amountCents: 144269 });
    const dist = monthly(4, '2026-10', { ...holder, amountCents: 1800000 });
    const july = tx({ ...holder, amountCents: 8100000, date: '2026-07-20' });
    const ctx = ruleContext({ identity: identity({ cpfHmac: 'h', pfConnected: false }) });
    const hits = applyRules([...pl, ...dist, july], ctx);
    expect(pl.every((t) => hits.get(t.id)?.cardId === CARD.proLaboreGross)).toBe(true);
    expect([...dist, july].every((t) => hits.get(t.id)?.cardId === CARD.distribution)).toBe(true);

    // The larger cluster wins when only it has a payroll DARF in the same or the next month.
    const big = monthly(3, '2026-09', { ...holder, amountCents: 1800000 });
    const small = monthly(3, '2026-10', { ...holder, amountCents: 144269 });
    const darf = tx({
      description: 'DARF 0588',
      method: 'BOLETO',
      amountCents: 5000,
      date: '2026-07-20',
    });
    const byDarf = applyRules([...big, ...small, darf], ctx);
    expect(big.every((t) => byDarf.get(t.id)?.label === 'pro_labore')).toBe(true);
    expect(small.every((t) => byDarf.get(t.id)?.label === 'distribution')).toBe(true);
  });

  it('T02-11: interest on equity to the holder is neither pró-labore nor distribution', () => {
    const jcp = tx({
      description: 'PIX JCP 2026',
      cpf: '***.711.985-**',
      hmac: 'h',
      amountCents: 300000,
    });
    const hits = applyRules([jcp], ruleContext({ identity: identity({ cpfHmac: 'h' }) }));
    expect(hits.get(jcp.id)).toMatchObject({
      label: 'jcp',
      category: 'same_holder_transfer',
      cardId: null,
    });
  });

  it('T02-11 also when only the PF leg says JCP', () => {
    const pj = tx({
      description: 'PIX ENVIADO [pessoa]',
      cpf: '***.711.985-**',
      amountCents: 300000,
    });
    const pf = tx({
      holder: 'PF',
      direction: 'inflow',
      description: 'JCP RECEBIDO MARINA DEV',
      cnpj: COMPANY_CNPJ,
      amountCents: 300000,
    });
    const hits = applyRules([pj, pf], ruleContext());
    expect(hits.get(pj.id)?.label).toBe('jcp');
    expect(hits.get(pf.id)?.label).toBe('jcp');
  });

  it('CLT salary: recurring Pix to a third-party CPF (±10%) joins 13º and vacation in one card per person', () => {
    const salary = monthly(4, '2026-10', {
      description: 'PIX ENVIADO [pessoa]',
      cpf: '***.493.103-**',
      amountCents: 454868,
    });
    const vacation = tx({
      description: 'PIX ENVIADO [pessoa] FERIAS',
      cpf: '***.493.103-**',
      amountCents: 81699,
      date: '2026-06-01',
    });
    const hits = applyRules([...salary, vacation], ruleContext());
    const cards = new Set([...salary, vacation].map((t) => hits.get(t.id)?.cardId));
    expect(cards.size).toBe(1);
    expect([...cards][0]).toMatch(/^clt-employee:/);
  });

  it('without identity and without the PF account, a one-off Pix to a CPF asks "foi para você?"', () => {
    const t = tx({ description: 'PIX ENVIADO [pessoa]', cpf: '***.555.666-**' });
    const h = labelOf(t, ruleContext({ identity: identity({ pfConnected: false }) }));
    expect(h?.cardId).toMatch(/^partner-transfer:/);
    expect(labelOf(t)).toBeUndefined();
  });

  it('recurrence and clusters', () => {
    const list = monthly(3, '2026-10', { amountCents: 100000 });
    expect(isRecurring(list, '2026-10', 0.02)).toBe(true);
    expect(isRecurring(list.slice(0, 2), '2026-10', 0.02)).toBe(false);
    expect(isRecurring([], '2026-10', null)).toBe(false);
    const [a, b, c] = list as [NormalizedTransaction, NormalizedTransaction, NormalizedTransaction];
    const varied = [a, b, { ...c, amountCents: 150000 }];
    expect(isRecurring(varied, '2026-10', 0.1)).toBe(false);
    expect(isRecurring(varied, '2026-10', null)).toBe(true);
    expect(
      amountClusters(
        [tx({ amountCents: 100 }), tx({ amountCents: 101 }), tx({ amountCents: 200 })],
        0.02,
      ).map((c) => c.length),
    ).toEqual([2, 1]);
  });
});
