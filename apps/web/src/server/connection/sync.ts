import 'server-only';
import { type Db, schema } from '@refund/db';
import { transactionId } from '@refund/pipeline';
import type {
  CivilDate,
  FinancialProvider,
  ProviderError,
  SourceAccount,
  SourceTransaction,
} from '@refund/sources';
import { and, eq } from 'drizzle-orm';
import { hmac } from '../crypto.ts';
import { logger } from '../log.ts';

// syncConnection (ARCHITECTURE §2.4): accounts and transactions, already through the whitelist
// (§6.2; the provider sanitizes), into the database. Idempotent: running it twice inserts nothing new
// (TESTS §4 "Pluggy connection"). A CPF reaches this function only as an HMAC or a mask.

const { connections, accounts, transactions } = schema;
const BATCH = 500;

export interface SyncDeps {
  db: Db;
  provider: FinancialProvider;
  pepper: Buffer;
  period: { from: CivilDate; to: CivilDate };
}

export type SyncResult =
  | { ok: true; accounts: number; transactions: number }
  | { ok: false; error: ProviderError };

function accountType(a: SourceAccount): (typeof accounts.$inferInsert)['type'] {
  if (a.type === 'CREDIT') return 'card';
  if (a.subtype === 'CHECKING_ACCOUNT') return 'checking';
  if (a.subtype === 'SAVINGS_ACCOUNT') return 'savings';
  return 'other';
}

const digits = (v: string | null | undefined, max: number): string | null => {
  const d = (v ?? '').replace(/\D/g, '');
  return d === '' ? null : d.slice(0, max);
};

/**
 * Row id: the pipeline's stable `transactionId`, scoped by the connection. The account source id alone
 * is not unique across users (every persona connection replays the same synthetic accounts).
 */
export function rowId(connectionId: string, accountSourceId: string, sourceId: string): string {
  return transactionId(`${connectionId}/${accountSourceId}`, sourceId);
}

export function transactionRow(
  connectionId: string,
  accountId: string,
  t: SourceTransaction,
  pepper: Buffer,
): typeof transactions.$inferInsert {
  const doc = t.counterparty?.document ?? null;
  const isCnpj = doc?.type === 'CNPJ';
  return {
    id: rowId(connectionId, t.accountSourceId, t.sourceId),
    accountId,
    sourceIdHash: hmac(t.sourceId, pepper),
    date: t.date,
    month: t.date.slice(0, 7),
    amountCents: t.amountCents,
    direction: t.amountCents >= 0 ? 'inflow' : 'outflow',
    description: t.description.slice(0, 300),
    method: t.method,
    counterpartyDocType: doc?.type ?? null,
    // CPF: only the HMAC (never `publicValue`, which the whitelist already keeps null for a CPF).
    counterpartyDocHmac: doc?.type === 'CPF' ? doc.hmac : null,
    counterpartyCnpj: isCnpj ? (doc.publicValue?.slice(0, 14) ?? null) : null,
    counterpartyMask: doc?.mask.slice(0, 24) ?? null,
    counterpartyName: isCnpj ? (t.counterparty?.name?.slice(0, 160) ?? null) : null,
    counterpartyCnae: digits(t.counterparty?.cnae, 7),
    sourceCategory: t.sourceCategory?.slice(0, 80) ?? null,
    mcc: t.mcc?.slice(0, 4) ?? null,
    installment: t.installment,
  };
}

/** Reads the item's accounts and transactions and marks the connection `active`. */
export async function syncConnection(
  connection: { id: string; itemId: string; holder: 'PF' | 'PJ' },
  deps: SyncDeps,
): Promise<SyncResult> {
  const { db, provider, pepper, period } = deps;
  const ctx = { mode: provider.name === 'pluggy' ? ('live' as const) : ('replay' as const) };
  const listed = await provider.listAccounts(connection.itemId, ctx);
  if (!listed.ok) return markError(db, connection.id, listed.error);
  let inserted = 0;
  for (const account of listed.value) {
    const sourceIdHash = hmac(account.sourceId, pepper);
    const [row] = await db
      .insert(accounts)
      .values({
        connectionId: connection.id,
        sourceIdHash,
        holder: account.holder,
        type: accountType(account),
        productName: account.productName.slice(0, 120),
        institution: account.institution.slice(0, 120),
        currency: (account.currency || 'BRL').slice(0, 3),
        balanceCents: account.balanceCents,
      })
      .onConflictDoUpdate({
        target: [accounts.connectionId, accounts.sourceIdHash],
        set: { balanceCents: account.balanceCents },
      })
      .returning({ id: accounts.id });
    if (!row) throw new Error('syncConnection: account not saved');
    for await (const page of provider.listTransactions(account.sourceId, period, ctx)) {
      if (!page.ok) return markError(db, connection.id, page.error);
      for (let i = 0; i < page.value.length; i += BATCH) {
        const rows = page.value
          .slice(i, i + BATCH)
          .map((t) => transactionRow(connection.id, row.id, t, pepper));
        if (rows.length === 0) continue;
        const saved = await db
          .insert(transactions)
          .values(rows)
          .onConflictDoNothing()
          .returning({ id: transactions.id });
        inserted += saved.length;
      }
    }
  }
  await db
    .update(connections)
    .set({ status: 'active', errorCode: null, lastSyncAt: new Date() })
    .where(and(eq(connections.id, connection.id), eq(connections.holder, connection.holder)));
  logger.info('connection.synced', {
    provider: provider.name,
    accounts: listed.value.length,
    inserted,
  });
  return { ok: true, accounts: listed.value.length, transactions: inserted };
}

async function markError(db: Db, connectionId: string, error: ProviderError): Promise<SyncResult> {
  await db
    .update(connections)
    .set({ status: 'error', errorCode: error.code })
    .where(eq(connections.id, connectionId));
  logger.warn('connection.sync_failed', { code: error.code, source: error.source });
  return { ok: false, error };
}
