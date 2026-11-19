// D31 (Enzo, 16/11; PLAN §18): the Finanças totals split per bank account, own-account transfers explained, and a
// payment that appears twice can be excluded by the owner (financial view only; the engine is not re-run).
import type { Cents } from '@refund/engine';
import type { SourceTransaction } from '@refund/sources';
import { describe, expect, it } from 'vitest';
import {
  buildFinancialView,
  type Classification,
  duplicateRemovals,
  type FinancialView,
  type FinancialViewFinding,
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
  o: Partial<Classification> = {},
): Classification => ({
  transactionId: t.id,
  category,
  confidence: 0.95,
  origin: 'rule',
  reason: 'teste',
  status: 'applied',
  ...o,
});

function build(input: Partial<FinancialViewInput> & Pick<FinancialViewInput, 'transactions'>) {
  return buildFinancialView({
    referenceMonth: '2026-10',
    regime: 'SIMPLES',
    classifications: [],
    findings: [],
    ...input,
  });
}
function view(
  input: Partial<FinancialViewInput> & Pick<FinancialViewInput, 'transactions'>,
): FinancialView {
  const r = build(input);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}
const pjOf = (v: FinancialView) => v.pj as HolderView;

describe('D31 (a): totals per bank account, own-account transfers explained', () => {
  const sale = tx({
    accountId: 'conta',
    direction: 'inflow',
    amountCents: 500_000,
    date: '2026-10-01',
  });
  const toSavings = tx({ accountId: 'conta', amountCents: 100_000, date: '2026-10-02' });
  const fromChecking = tx({
    accountId: 'poupanca',
    direction: 'inflow',
    amountCents: 100_000,
    date: '2026-10-02',
  });
  const card = tx({ accountId: 'cartao', method: 'CARD', amountCents: 9_990, date: '2026-10-05' });
  const transactions = [sale, toSavings, fromChecking, card];
  const classifications = [
    classified(sale, 'service_revenue'),
    classified(toSavings, 'same_holder_transfer', { ruleId: 'own_account' }),
    classified(fromChecking, 'same_holder_transfer', { ruleId: 'own_account' }),
    classified(card, 'operating_expense'),
  ];
  const accounts = [
    { id: 'conta', holder: 'PJ' as const, label: 'Banco Meridiano · Conta Corrente PJ' },
    { id: 'poupanca', holder: 'PJ' as const, label: 'Banco Meridiano · Poupança' },
  ];

  it('own-account transfers stay in both tiles; each account shows its own in/out and its share of them', () => {
    const pj = pjOf(view({ transactions, classifications, accounts }));
    expect([pj.inflow12m, pj.outflow12m]).toEqual([600_000, 109_990]);
    // Largest outflow first; an account the input does not name gets a neutral label (never an id on screen).
    expect(pj.accounts).toEqual([
      {
        accountId: 'conta',
        label: 'Banco Meridiano · Conta Corrente PJ',
        inflow12m: 500_000,
        outflow12m: 100_000,
        internalIn: 0,
        internalOut: 100_000,
        count: 2,
      },
      {
        accountId: 'cartao',
        label: 'Conta 2',
        inflow12m: 0,
        outflow12m: 9_990,
        internalIn: 0,
        internalOut: 0,
        count: 1,
      },
      {
        accountId: 'poupanca',
        label: 'Banco Meridiano · Poupança',
        inflow12m: 100_000,
        outflow12m: 0,
        internalIn: 100_000,
        internalOut: 0,
        count: 1,
      },
    ]);
    // Σ accounts == the tiles (nothing is netted out, D31).
    expect(pj.accounts.reduce((a, x) => a + x.inflow12m, 0)).toBe(pj.inflow12m);
    expect(pj.accounts.reduce((a, x) => a + x.outflow12m, 0)).toBe(pj.outflow12m);
    expect(pj.internalTransfers).toEqual({ inflow: 100_000, outflow: 100_000 });
  });

  it('the hero: two PJ accounts (checking and card) and one PF account, summing to the E.9.3 tiles', async () => {
    const hero = await heroAnswered();
    const input = heroInput();
    const r = financialViewOfRun(
      { ...input, transactions: input.transactions as SourceTransaction[] },
      hero.result,
    );
    if (!r.ok) throw new Error(r.error.message);
    const pj = r.value.pj as HolderView;
    const pf = r.value.pf as HolderView;
    expect(pj.accounts.map((a) => [a.label, a.inflow12m, a.outflow12m, a.count])).toEqual([
      ['Banco Meridiano · Conta Corrente PJ', 60_000_000, 55_856_334, 101],
      ['Banco Meridiano · Cartão de Crédito Empresarial', 0, 148_320, 13],
    ]);
    expect(pf.accounts.map((a) => [a.label, a.inflow12m, a.outflow12m])).toEqual([
      ['Banco Meridiano · Conta Corrente', 29_631_228, 1_895_880],
    ]);
    expect(pj.internalTransfers).toEqual({ inflow: 0, outflow: 0 });
    expect(r.value.excluded).toEqual([]);
  });
});

describe('D31 (b): the owner excludes a payment that appears twice', () => {
  const p = {
    method: 'PIX' as const,
    description: 'PAGAMENTO FORNECEDOR NUVEM',
    cnpj: 'RFNUVM01000100',
    name: 'NUVEM LTDA',
    amountCents: 35_000,
  };
  const first = tx({ ...p, date: '2026-10-15' });
  const twin = tx({ ...p, date: '2026-10-15' });
  const other = tx({ date: '2026-10-20', amountCents: 10_000, description: 'OUTRA DESPESA' });
  const transactions = [first, twin, other];
  const classifications = transactions.map((t) => classified(t, 'operating_expense'));

  it('duplicateRemovals keeps the first occurrence and offers the repeats', () => {
    const [suspect] = pjOf(view({ transactions, classifications })).duplicates;
    if (suspect === undefined) throw new Error('no suspect');
    expect(suspect.reason).toBe('same_charge_within_3_days');
    expect(duplicateRemovals(suspect)).toEqual([twin.id]);
  });

  it('without the repeat: totals, group, month and detectors recompute; the exclusion is listed for undo', () => {
    const before = pjOf(view({ transactions, classifications }));
    const v = view({ transactions, classifications, excludedTransactionIds: [twin.id] });
    const pj = pjOf(v);
    expect(before.outflow12m).toBe(80_000);
    expect(pj.outflow12m).toBe(45_000);
    const op = pj.groups.find((g) => g.groupId === 'operating_expense');
    expect([op?.total12m, op?.count, op?.lastMonth]).toEqual([45_000, 2, 45_000]);
    expect(op?.transactionIds).not.toContain(twin.id);
    expect(pj.duplicates).toEqual([]);
    expect(pj.accounts[0]?.outflow12m).toBe(45_000);
    expect(pj.outflowChange.cents).toBe(45_000);
    expect(v.excluded).toEqual([
      {
        transactionId: twin.id,
        holder: 'PJ',
        accountId: 'acc-pj',
        date: '2026-10-15',
        amount: 35_000,
        groupId: 'operating_expense',
        label: 'NUVEM LTDA',
      },
    ]);
  });

  it('undo round trip: remove the twin, then rebuild from the same input with [] = exactly the original', () => {
    const input = { transactions, classifications };
    const base = view(input);
    const removed = view({ ...input, excludedTransactionIds: [twin.id] });
    expect(removed).not.toEqual(base);
    const undone = view({
      ...input,
      excludedTransactionIds: removed.excluded
        .filter((e) => e.transactionId !== twin.id)
        .map((e) => e.transactionId),
    });
    expect(undone).toEqual(base);
    expect(view({ ...input, excludedTransactionIds: [] })).toEqual(base);
  });

  it('a seal recomputes: excluding the only settled row of a group drops its seal', () => {
    const das = tx({
      description: 'PAGAMENTO DAS PA 09/2026',
      date: '2026-10-19',
      amountCents: 892_500,
    });
    const r01: FinancialViewFinding = {
      ruleId: 'R01',
      order: 1,
      type: 'savings',
      refs: [
        {
          id: 'lc123-2006/art18/p5-j',
          label: 'LC 123',
          url: 'https://x',
          verifiedAt: '2026-11-12',
        },
      ],
      countsInTotal: true,
      marginalValue12m: 100 as Cents,
    };
    const input = {
      transactions: [das],
      classifications: [classified(das, 'das_tax', { ruleId: 'das_simples' })],
      findings: [r01],
    };
    expect(pjOf(view(input)).groups[0]?.seals.map((s) => s.kind)).toEqual(['lower_tax']);
    const without = view({ ...input, excludedTransactionIds: [das.id] });
    expect(without.pj?.groups).toEqual([]);
    expect(without.pj?.outflow12m).toBe(0);
  });

  it('an exclusion of an unknown transaction is invalid input; a repeated id counts once', () => {
    expect(
      build({ transactions, classifications, excludedTransactionIds: ['nao-existe'] }),
    ).toMatchObject({
      ok: false,
      error: { code: 'FINANCIAL_VIEW_INVALID_INPUT' },
    });
    const v = view({ transactions, classifications, excludedTransactionIds: [twin.id, twin.id] });
    expect(v.excluded).toHaveLength(1);
  });
});
