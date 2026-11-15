// Holder identity and "same holder" (ENGINE-SPEC E.2). Only the holder's own identity is used, never the QSA.
import { createHash } from 'node:crypto';
import { addMonths, type YearMonth } from '@refund/engine';
import type { SourceIdentity } from '@refund/sources';
import type { NormalizedTransaction } from '../types.ts';

/** Documents compared without punctuation (alphanumeric CNPJ since 07/2026). */
export const documentKey = (value: string | null | undefined): string =>
  (value ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');

/**
 * Grouping key of a counterparty (one card per person/merchant): HMAC, else the public CNPJ, else the mask, else
 * the name. Hashed so no mask or name lands in a question id.
 */
export function counterpartyKey(tx: NormalizedTransaction): string {
  const doc = tx.counterparty?.document;
  const raw =
    doc?.hmac ??
    (doc?.publicValue ? documentKey(doc.publicValue) : null) ??
    doc?.mask ??
    tx.counterparty?.name ??
    tx.description;
  return createHash('sha256').update(raw).digest('hex').slice(0, 12);
}

export const isCpfCounterparty = (tx: NormalizedTransaction): boolean =>
  tx.counterparty?.document?.type === 'CPF';

const dayNumber = (date: string): number =>
  Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / 86_400_000;

export const daysApart = (a: string, b: string): number => Math.abs(dayNumber(a) - dayNumber(b));

export interface HolderIdentity {
  /** HMAC of the PF holder's CPF (null in /demo: no pepper). */
  cpfHmac: string | null;
  /** The company's CNPJ, without punctuation. */
  cnpj: string;
  pfConnected: boolean;
}

export function holderIdentity(
  identities: readonly SourceIdentity[],
  companyCnpj: string,
  pfConnected: boolean,
): HolderIdentity {
  const pf = identities.find((i) => i.holder === 'PF' && i.document.type === 'CPF');
  const pj = identities.find((i) => i.holder === 'PJ' && i.document.type === 'CNPJ');
  return {
    cpfHmac: pf?.document.hmac ?? null,
    cnpj: documentKey(pj?.document.publicValue ?? companyCnpj),
    pfConnected,
  };
}

/** Rule 1 of E.2: the payee's CPF (as HMAC) is the PF holder's. */
export const sameCpf = (tx: NormalizedTransaction, id: HolderIdentity): boolean =>
  id.cpfHmac !== null &&
  tx.counterparty?.document?.type === 'CPF' &&
  tx.counterparty.document.hmac === id.cpfHmac;

const isCompany = (tx: NormalizedTransaction, id: HolderIdentity): boolean =>
  tx.counterparty?.document?.type === 'CNPJ' &&
  documentKey(tx.counterparty.document.publicValue) === id.cnpj;

/**
 * Rule 3 of E.2 (and its mirror for contributions): a PF leg with the company's CNPJ as counterparty, same amount and
 * date ±1 day as the PJ leg. One-to-one, closest date first. Returns PJ id → PF id.
 */
export function pairSameHolder(
  txs: readonly NormalizedTransaction[],
  id: HolderIdentity,
  pjDirection: 'outflow' | 'inflow',
): Map<string, string> {
  const pfDirection = pjDirection === 'outflow' ? 'inflow' : 'outflow';
  const pjLegs = txs.filter(
    (t) =>
      t.holder === 'PJ' &&
      t.direction === pjDirection &&
      t.counterparty?.document?.type !== 'CNPJ' &&
      t.method !== 'CARD',
  );
  const pfLegs = txs.filter(
    (t) => t.holder === 'PF' && t.direction === pfDirection && isCompany(t, id),
  );
  const pairs = new Map<string, string>();
  const used = new Set<string>();
  for (const pf of pfLegs) {
    let best: NormalizedTransaction | undefined;
    for (const pj of pjLegs) {
      if (used.has(pj.id) || pj.amountCents !== pf.amountCents) continue;
      const gap = daysApart(pj.date, pf.date);
      if (gap > 1) continue;
      if (best === undefined || gap < daysApart(best.date, pf.date)) best = pj;
    }
    if (best !== undefined) {
      used.add(best.id);
      pairs.set(best.id, pf.id);
    }
  }
  return pairs;
}

/** The last `n` months up to `reference` (the "≥ 3 of the last 4 months" windows of E.2). */
export const lastMonths = (reference: YearMonth, n: number): YearMonth[] =>
  Array.from({ length: n }, (_, i) => addMonths(reference, i - n + 1));

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)] ?? 0;
};

/**
 * E.2 recurrence: payments in ≥ 3 of the last 4 months, each within `tolerance` of the median amount
 * (pró-labore ±2%, CLT salary ±10%; null = any amount).
 */
export function isRecurring(
  txs: readonly NormalizedTransaction[],
  reference: YearMonth,
  tolerance: number | null,
): boolean {
  if (txs.length === 0) return false;
  const typical = median(txs.map((t) => t.amountCents));
  const window = new Set(lastMonths(reference, 4));
  const months = new Set(
    txs
      .filter((t) => window.has(t.month))
      .filter((t) => tolerance === null || Math.abs(t.amountCents - typical) <= typical * tolerance)
      .map((t) => t.month),
  );
  return months.size >= 3;
}

/** Amount clusters within ±`tolerance` of the cluster's smallest amount (E.2 "stable amount"). */
export function amountClusters(
  txs: readonly NormalizedTransaction[],
  tolerance: number,
): NormalizedTransaction[][] {
  const sorted = [...txs].sort((a, b) => a.amountCents - b.amountCents || (a.id < b.id ? -1 : 1));
  const clusters: NormalizedTransaction[][] = [];
  for (const t of sorted) {
    const current = clusters.at(-1);
    const base = current?.[0]?.amountCents;
    if (current !== undefined && base !== undefined && t.amountCents <= base * (1 + tolerance)) {
      current.push(t);
    } else {
      clusters.push([t]);
    }
  }
  return clusters;
}
