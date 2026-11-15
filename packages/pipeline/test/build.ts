// Synthetic transactions for the rule tests (names and documents are not real; CNPJs use the persona `RF` roots).
import type { CivilDate, YearMonth } from '@refund/engine';
import type { HolderIdentity } from '../src/classify/identity.ts';
import type { RuleContext } from '../src/classify/rules.ts';
import { normalizeDescription } from '../src/normalize.ts';
import type { NormalizedTransaction } from '../src/types.ts';

export const COMPANY_CNPJ = 'RFDEV001000158';

let seq = 0;

type TxInput = Partial<Omit<NormalizedTransaction, 'counterparty'>> & {
  cpf?: string; // mask of a person counterparty
  cnpj?: string;
  cnae?: string;
  name?: string;
  hmac?: string;
};

export function tx(p: TxInput = {}): NormalizedTransaction {
  seq += 1;
  const date = p.date ?? '2026-10-10';
  const doc =
    p.cpf !== undefined
      ? { type: 'CPF' as const, hmac: p.hmac ?? null, publicValue: null, mask: p.cpf }
      : p.cnpj !== undefined
        ? { type: 'CNPJ' as const, hmac: null, publicValue: p.cnpj, mask: p.cnpj }
        : null;
  return {
    id: p.id ?? `t${String(seq).padStart(4, '0')}`,
    accountId: p.holder === 'PF' ? 'acc-pf' : 'acc-pj',
    holder: p.holder ?? 'PJ',
    date,
    month: date.slice(0, 7) as YearMonth,
    amountCents: p.amountCents ?? 10_000,
    direction: p.direction ?? 'outflow',
    description: normalizeDescription(p.description ?? 'LANCAMENTO'),
    method: p.method ?? 'PIX',
    counterparty:
      doc === null && p.name === undefined && p.cnae === undefined
        ? null
        : { document: doc, name: p.name ?? null, cnae: p.cnae ?? null },
    sourceCategory: null,
    mcc: p.mcc ?? null,
  };
}

/** One payment per month, `count` months ending in `last`. */
export function monthly(count: number, last: YearMonth, p: TxInput): NormalizedTransaction[] {
  const [y, m] = last.split('-').map(Number) as [number, number];
  return Array.from({ length: count }, (_, i) => {
    const idx = y * 12 + (m - 1) - (count - 1 - i);
    const month = `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
    return tx({ ...p, date: `${month}-07` as CivilDate });
  });
}

export const identity = (o: Partial<HolderIdentity> = {}): HolderIdentity => ({
  cpfHmac: null,
  cnpj: COMPANY_CNPJ,
  pfConnected: true,
  ...o,
});

export const ruleContext = (o: Partial<RuleContext> = {}): RuleContext => ({
  identity: identity(),
  primaryCnae: '6201-5/01',
  revenueCategory: 'service_revenue',
  referenceMonth: '2026-10',
  ...o,
});
