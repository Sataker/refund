// Normalization (ENGINE-SPEC E.1, item 5): what the deterministic rules read.
import { createHash } from 'node:crypto';
import type { CivilDate, YearMonth } from '@refund/engine';
import type { SourceAccount, SourceTransaction } from '@refund/sources';
import type { NormalizedTransaction } from './types.ts';

const CNPJ_FORMATTED = /\b[0-9A-Z]{2}\.[0-9A-Z]{3}\.[0-9A-Z]{3}\/[0-9A-Z]{4}-\d{2}\b/g;
const CPF_FORMATTED = /(?:\d{3}|\*{3})\.\d{3}\.\d{3}-(?:\d{2}|\*{2})/g;

/** Uppercase, no accents (NFD + diacritics removed), collapsed spaces, documents without punctuation (E.1.5). */
export function normalizeDescription(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(CNPJ_FORMATTED, (doc) => doc.replace(/[./-]/g, ''))
    .replace(CPF_FORMATTED, (doc) => doc.replace(/[.-]/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Stable id: sha256(account + sourceId), 26 hex chars (ARCHITECTURE §4.4). */
export function transactionId(accountSourceId: string, sourceId: string): string {
  return createHash('sha256').update(`${accountSourceId}:${sourceId}`).digest('hex').slice(0, 26);
}

export type NormalizeResult =
  | { ok: true; value: NormalizedTransaction }
  | { ok: false; reason: 'UNKNOWN_ACCOUNT' | 'INVALID_AMOUNT' | 'INVALID_DATE' };

const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function normalizeTransaction(
  tx: SourceTransaction,
  accounts: ReadonlyMap<string, SourceAccount>,
): NormalizeResult {
  const account = accounts.get(tx.accountSourceId);
  if (account === undefined) return { ok: false, reason: 'UNKNOWN_ACCOUNT' };
  if (!Number.isSafeInteger(tx.amountCents) || tx.amountCents === 0) {
    return { ok: false, reason: 'INVALID_AMOUNT' };
  }
  if (!DATE.test(tx.date)) return { ok: false, reason: 'INVALID_DATE' };
  return {
    ok: true,
    value: {
      id: transactionId(tx.accountSourceId, tx.sourceId),
      accountId: tx.accountSourceId,
      holder: account.holder,
      date: tx.date as CivilDate,
      month: tx.date.slice(0, 7) as YearMonth,
      amountCents: Math.abs(tx.amountCents),
      direction: tx.amountCents > 0 ? 'inflow' : 'outflow',
      description: normalizeDescription(tx.description),
      method: tx.method,
      counterparty: tx.counterparty,
      sourceCategory: tx.sourceCategory,
      mcc: tx.mcc,
      installment: tx.installment ?? null,
    },
  };
}

/**
 * The run's normalization, shared by `runAnalysis` (page by page) and `normalizeTransactions` (an array), so the
 * financial view and the run can never see different transactions: invalid rows dropped, first id wins, sorted by
 * date then id.
 */
export class Normalizer {
  readonly #accounts: ReadonlyMap<string, SourceAccount>;
  readonly #byId = new Map<string, NormalizedTransaction>();
  readonly #originals = new Map<string, SourceTransaction>();

  constructor(accounts: readonly SourceAccount[]) {
    this.#accounts = new Map(accounts.map((a) => [a.sourceId, a]));
  }

  add(tx: SourceTransaction): void {
    const n = normalizeTransaction(tx, this.#accounts);
    if (n.ok && !this.#byId.has(n.value.id)) {
      this.#byId.set(n.value.id, n.value);
      this.#originals.set(n.value.id, tx);
    }
  }

  /** The source row of a normalized id (the run's masked sample reads the original description). */
  get originals(): ReadonlyMap<string, SourceTransaction> {
    return this.#originals;
  }

  result(): NormalizedTransaction[] {
    return [...this.#byId.values()].sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1,
    );
  }
}

/** `runAnalysis`'s normalization over an array (`PipelineResult` does not carry the transactions). */
export function normalizeTransactions(
  accounts: readonly SourceAccount[],
  transactions: readonly SourceTransaction[],
): NormalizedTransaction[] {
  const n = new Normalizer(accounts);
  for (const tx of transactions) n.add(tx);
  return n.result();
}
