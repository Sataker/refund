// D43 (Enzo, 20/11; PLAN §18): with the holder's credit-card account connected, the card-bill payment from the bank
// account leaves "Saiu" (the card purchases already count there). View only: the engine analysis is not re-run.
import type { SourceTransaction } from '@refund/sources';
import { describe, expect, it } from 'vitest';
import {
  buildFinancialView,
  type Classification,
  type FinancialView,
  type FinancialViewInput,
  financialViewOfRun,
  type HolderView,
  type NormalizedTransaction,
} from '../src/index.ts';
import { tx } from './build.ts';
import { heroAnswered, heroInput } from './helpers.ts';

const classified = (
  t: NormalizedTransaction,
  category: Classification['category'],
): Classification => ({
  transactionId: t.id,
  category,
  confidence: 0.95,
  origin: 'rule',
  reason: 'teste',
  status: 'applied',
});

function view(
  input: Partial<FinancialViewInput> & Pick<FinancialViewInput, 'transactions'>,
): FinancialView {
  const r = buildFinancialView({
    referenceMonth: '2026-10',
    regime: 'SIMPLES',
    classifications: [],
    findings: [],
    ...input,
  });
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}
const pjOf = (v: FinancialView) => v.pj as HolderView;

const checking = {
  id: 'conta',
  holder: 'PJ' as const,
  label: 'Conta Corrente PJ',
  type: 'BANK' as const,
};
const card = { id: 'cartao', holder: 'PJ' as const, label: 'Cartão PJ', type: 'CREDIT' as const };

describe('D43: the card-bill payment leaves "Saiu" when the card account is connected', () => {
  const sale = tx({
    accountId: 'conta',
    direction: 'inflow',
    amountCents: 500_000,
    date: '2026-10-01',
  });
  const purchase = tx({
    accountId: 'cartao',
    method: 'CARD',
    amountCents: 30_000,
    date: '2026-09-12',
  });
  const bill = tx({
    accountId: 'conta',
    method: 'BOLETO',
    amountCents: 30_000,
    date: '2026-10-05',
    description: 'PAGAMENTO FATURA CARTAO',
  });
  const billCredit = tx({
    accountId: 'cartao',
    direction: 'inflow',
    method: 'OTHER',
    amountCents: 30_000,
    date: '2026-10-05',
    description: 'PAGAMENTO RECEBIDO',
  });
  const supplier = tx({
    accountId: 'conta',
    amountCents: 10_000,
    date: '2026-10-08',
    description: 'FORNECEDOR',
  });
  const transactions = [sale, purchase, bill, billCredit, supplier];
  const classifications = [
    classified(sale, 'service_revenue'),
    classified(purchase, 'operating_expense'),
    classified(bill, 'unclassified'),
    classified(billCredit, 'unclassified'),
    classified(supplier, 'operating_expense'),
  ];

  it('out of the tiles, the groups, the months and the accounts; listed apart like own transfers', () => {
    const pj = pjOf(view({ transactions, classifications, accounts: [checking, card] }));
    expect([pj.inflow12m, pj.outflow12m]).toEqual([500_000, 40_000]);
    const ids = pj.groups.flatMap((g) => g.transactionIds);
    expect(ids).not.toContain(bill.id);
    expect(ids).not.toContain(billCredit.id);
    expect(pj.outflowChange.cents).toBe(10_000);
    expect(pj.accounts.reduce((a, x) => a + x.outflow12m, 0)).toBe(pj.outflow12m);
    expect(pj.accounts.reduce((a, x) => a + x.inflow12m, 0)).toBe(pj.inflow12m);
    expect(pj.biggestOutflows.flatMap((r) => r.transactionIds)).not.toContain(bill.id);
    expect(pj.cardBillPayments).toEqual({
      outflow: 30_000,
      inflow: 30_000,
      transactionIds: [bill.id, billCredit.id],
    });
  });

  it('other descriptions of the same payment and the Pluggy category are recognized', () => {
    for (const p of [
      { description: 'PAG FATURA CARTAO' },
      { description: 'PGTO FATURA 1234' },
      { description: 'PAGTO DA FATURA DO CARTAO' },
      { description: 'DEBITO AUTOMATICO', sourceCategory: 'Credit card payment' },
    ]) {
      const t = tx({ accountId: 'conta', amountCents: 20_000, date: '2026-10-05', ...p });
      const pj = pjOf(view({ transactions: [sale, t], accounts: [checking, card] }));
      expect(pj.outflow12m, p.description).toBe(0);
      expect(pj.cardBillPayments.outflow, p.description).toBe(20_000);
    }
  });

  it('conservative: without a connected card account, or a description that is not a bill payment, it stays', () => {
    const noCard = pjOf(view({ transactions: [sale, bill, supplier], accounts: [checking] }));
    expect(noCard.outflow12m).toBe(40_000);
    expect(noCard.cardBillPayments).toEqual({ outflow: 0, inflow: 0, transactionIds: [] });
    // Accounts without a type (older input): nothing is known about a card, nothing is removed.
    const untyped = pjOf(
      view({
        transactions: [sale, purchase, bill],
        accounts: [
          { id: 'conta', holder: 'PJ', label: 'Conta' },
          { id: 'cartao', holder: 'PJ', label: 'Cartão' },
        ],
      }),
    );
    expect(untyped.outflow12m).toBe(60_000);
    for (const description of [
      'FATURA ENERGIA ELETRICA',
      'PAGAMENTO FORNECEDOR',
      'BOLETO FATURAMENTO SERVICOS',
      'PAGAMENTO FATURAMENTO',
    ]) {
      const t = tx({ accountId: 'conta', amountCents: 20_000, date: '2026-10-05', description });
      expect(
        pjOf(view({ transactions: [t], accounts: [checking, card] })).outflow12m,
        description,
      ).toBe(20_000);
    }
    // A card purchase itself is never a bill payment, whatever its text.
    const onCard = tx({
      accountId: 'cartao',
      method: 'CARD',
      amountCents: 20_000,
      date: '2026-10-05',
      description: 'PAGAMENTO FATURA',
    });
    expect(pjOf(view({ transactions: [onCard], accounts: [checking, card] })).outflow12m).toBe(
      20_000,
    );
    // The PF card does not take a PJ payment out (same holder only).
    const pfCard = {
      id: 'cartao-pf',
      holder: 'PF' as const,
      label: 'Cartão PF',
      type: 'CREDIT' as const,
    };
    expect(pjOf(view({ transactions: [bill], accounts: [checking, pfCard] })).outflow12m).toBe(
      30_000,
    );
  });

  it('the hero has no bill payment: its tiles and accounts are unchanged', async () => {
    const hero = await heroAnswered();
    const input = heroInput();
    const r = financialViewOfRun(
      { ...input, transactions: input.transactions as SourceTransaction[] },
      hero.result,
    );
    if (!r.ok) throw new Error(r.error.message);
    const pj = r.value.pj as HolderView;
    expect([pj.inflow12m, pj.outflow12m]).toEqual([60_000_000, 56_004_654]);
    expect(pj.cardBillPayments).toEqual({ outflow: 0, inflow: 0, transactionIds: [] });
    expect((r.value.pf as HolderView).cardBillPayments.outflow).toBe(0);
  });
});
