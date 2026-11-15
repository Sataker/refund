import type { SourceAccount, SourceTransaction } from '@refund/sources';
import { describe, expect, it } from 'vitest';
import { normalizeDescription, normalizeTransaction, transactionId } from '../src/normalize.ts';

const account: SourceAccount = {
  sourceId: 'acc-1',
  holder: 'PJ',
  type: 'BANK',
  subtype: 'CHECKING_ACCOUNT',
  productName: 'Conta Corrente PJ',
  institution: 'Banco Meridiano',
  currency: 'BRL',
  balanceCents: null,
};
const accounts = new Map([[account.sourceId, account]]);
const source = (o: Partial<SourceTransaction> = {}): SourceTransaction => ({
  sourceId: 'tx-1',
  accountSourceId: 'acc-1',
  date: '2026-10-06',
  amountCents: -892500,
  description: 'Pagamento  DAS – Simples   Nacional',
  pluggyType: 'DEBIT',
  method: 'BOLETO',
  sourceCategory: null,
  counterparty: null,
  mcc: null,
  installment: null,
  ...o,
});

describe('normalizeDescription (ENGINE-SPEC E.1.5)', () => {
  it('uppercases, strips accents and collapses spaces', () => {
    expect(normalizeDescription('  Pró-labore   Março ')).toBe('PRO-LABORE MARCO');
    expect(normalizeDescription('Câmbio — ordem de pagamento')).toBe('CAMBIO — ORDEM DE PAGAMENTO');
  });

  it('removes document punctuation, alphanumeric CNPJ included', () => {
    expect(normalizeDescription('PIX 12.ABC.345/01DE-35 recebido')).toBe(
      'PIX 12ABC34501DE35 RECEBIDO',
    );
    expect(normalizeDescription('pix ***.493.103-** enviado')).toBe('PIX ***493103** ENVIADO');
  });

  it('keeps accrual-month slashes that are not documents', () => {
    expect(normalizeDescription('DAS PA 10/2025')).toBe('DAS PA 10/2025');
  });
});

describe('normalizeTransaction', () => {
  it('derives holder, month, direction and a stable 26-char id', () => {
    const n = normalizeTransaction(source(), accounts);
    expect(n.ok).toBe(true);
    if (!n.ok) return;
    expect(n.value).toMatchObject({
      holder: 'PJ',
      month: '2026-10',
      amountCents: 892500,
      direction: 'outflow',
      description: 'PAGAMENTO DAS – SIMPLES NACIONAL',
    });
    expect(n.value.id).toHaveLength(26);
    expect(n.value.id).toBe(transactionId('acc-1', 'tx-1'));
    expect(transactionId('acc-1', 'tx-2')).not.toBe(n.value.id);
  });

  it('marks credits as inflow', () => {
    const n = normalizeTransaction(source({ amountCents: 5000000 }), accounts);
    expect(n.ok && n.value.direction).toBe('inflow');
  });

  it('rejects unknown accounts, zero or unsafe amounts and malformed dates', () => {
    expect(normalizeTransaction(source({ accountSourceId: 'nope' }), accounts)).toEqual({
      ok: false,
      reason: 'UNKNOWN_ACCOUNT',
    });
    expect(normalizeTransaction(source({ amountCents: 0 }), accounts)).toEqual({
      ok: false,
      reason: 'INVALID_AMOUNT',
    });
    expect(normalizeTransaction(source({ amountCents: 1.5 }), accounts)).toEqual({
      ok: false,
      reason: 'INVALID_AMOUNT',
    });
    expect(normalizeTransaction(source({ date: '2026-13-01' }), accounts)).toEqual({
      ok: false,
      reason: 'INVALID_DATE',
    });
  });
});
