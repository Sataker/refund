// SCHEMA §2.4: connections, accounts, transactions.
import {
  bigint,
  char,
  date,
  index,
  jsonb,
  smallint,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  accountType,
  connectionProvider,
  connectionStatus,
  createdAt,
  direction,
  documentType,
  holder,
  id,
  refund,
  transactionMethod,
  ts,
} from './base.ts';
import { companies } from './companies.ts';
import { consents, users } from './identity.ts';

export const connections = refund.table(
  'connections',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    consentId: uuid('consent_id').references(() => consents.id, { onDelete: 'set null' }),
    provider: connectionProvider('provider').notNull(),
    holder: holder('holder').notNull(),
    itemIdEncrypted: text('item_id_encrypted'), // AES-GCM; null for persona/replay
    itemIdHash: text('item_id_hash'), // HMAC; webhook lookup
    connectorName: varchar('connector_name', { length: 120 }),
    connectorSandbox: smallint('connector_sandbox').notNull().default(1), // 1 = sandbox (always, in the hackathon)
    status: connectionStatus('status').notNull().default('pending'),
    errorCode: varchar('error_code', { length: 60 }),
    lastSyncAt: ts('last_sync_at'),
    createdAt: createdAt(),
    revokedAt: ts('revoked_at'),
  },
  (t) => [
    uniqueIndex('connections_item_hash_uk').on(t.itemIdHash),
    index('connections_user_idx').on(t.userId),
  ],
);

export const accounts = refund.table(
  'accounts',
  {
    id: id(),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => connections.id, { onDelete: 'cascade' }),
    sourceIdHash: text('source_id_hash').notNull(), // HMAC of the Pluggy id
    holder: holder('holder').notNull(),
    type: accountType('type').notNull(),
    productName: varchar('product_name', { length: 120 }).notNull(),
    institution: varchar('institution', { length: 120 }).notNull(),
    currency: char('currency', { length: 3 }).notNull().default('BRL'),
    balanceCents: bigint('balance_cents', { mode: 'number' }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('accounts_connection_source_uk').on(t.connectionId, t.sourceIdHash)],
);

export const transactions = refund.table(
  'transactions',
  {
    id: varchar('id', { length: 26 }).primaryKey(), // = NormalizedTransaction.id (stable)
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    sourceIdHash: text('source_id_hash').notNull(),
    date: date('date', { mode: 'string' }).notNull(),
    month: char('month', { length: 7 }).notNull(),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(), // sign: + inflow / − outflow
    direction: direction('direction').notNull(),
    description: varchar('description', { length: 300 }).notNull(), // already redacted
    method: transactionMethod('method').notNull(),
    counterpartyDocType: documentType('counterparty_doc_type'),
    counterpartyDocHmac: text('counterparty_doc_hmac'), // CPF only
    counterpartyCnpj: char('counterparty_cnpj', { length: 14 }), // CNPJ is public
    counterpartyMask: varchar('counterparty_mask', { length: 24 }),
    counterpartyName: varchar('counterparty_name', { length: 160 }), // only when CNPJ
    counterpartyCnae: varchar('counterparty_cnae', { length: 7 }),
    sourceCategory: varchar('source_category', { length: 80 }),
    mcc: varchar('mcc', { length: 4 }),
    installment: jsonb('installment').$type<{ number: number; total: number } | null>(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('transactions_account_source_uk').on(t.accountId, t.sourceIdHash),
    index('transactions_account_date_idx').on(t.accountId, t.date),
    index('transactions_account_month_idx').on(t.accountId, t.month),
  ],
);
