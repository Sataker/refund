import 'server-only';
import { type AnalysisRow, type Db, type LedgerRow, schema } from '@refund/db';
import type { CivilDate, YearMonth } from '@refund/engine';
import { type AnalysisInput, type QuestionAnswer, transactionId } from '@refund/pipeline';
import {
  type FinancialProvider,
  type PublicCompany,
  parsePublicCompany,
  ReplaySeries,
  type SourceAccount,
  type SourceIdentity,
  type SourceTransaction,
} from '@refund/sources';
import { and, eq, isNull, like, or } from 'drizzle-orm';
import { SAMPLE_DATA } from '../connection/connections.ts';
import { decrypt, type Secrets } from '../crypto.ts';

// The live analysis input, rebuilt from what the connection sync stored (ARCHITECTURE §2.3: live and demo run the same
// pipeline). The rows already went through the whitelist; nothing here reads a provider's raw payload.
//
// Ids (EXECUTION §9, 16/11 E11 row): a stored transaction id is connection-scoped. The pipeline names a transaction
// `transactionId(accountSourceId, sourceId)`; here `accountSourceId` = the account row id and `sourceId` = the stored
// transaction id, and `ids` maps the pipeline id back to the row, so classifications reference real rows.

const { connections, accounts, transactions, companies, userAssumptions } = schema;

/** Card answers live in `user_assumptions` under this prefix (per user and company; the next run reuses them). */
export const ANSWER_PREFIX = 'answer:';

type AccountRow = typeof accounts.$inferSelect;
type TransactionRow = typeof transactions.$inferSelect;

export function sourceAccount(
  a: Pick<
    AccountRow,
    'id' | 'holder' | 'type' | 'productName' | 'institution' | 'currency' | 'balanceCents'
  >,
): SourceAccount {
  const card = a.type === 'card';
  return {
    sourceId: a.id,
    holder: a.holder,
    type: card ? 'CREDIT' : 'BANK',
    subtype: card
      ? 'CREDIT_CARD'
      : a.type === 'checking'
        ? 'CHECKING_ACCOUNT'
        : a.type === 'savings'
          ? 'SAVINGS_ACCOUNT'
          : a.type.toUpperCase(),
    productName: a.productName,
    institution: a.institution,
    currency: a.currency,
    balanceCents: a.balanceCents,
  };
}

export function sourceTransaction(t: TransactionRow): SourceTransaction {
  const hasParty =
    t.counterpartyDocType !== null || t.counterpartyName !== null || t.counterpartyCnae !== null;
  return {
    sourceId: t.id,
    accountSourceId: t.accountId,
    date: t.date as CivilDate,
    amountCents: t.amountCents,
    description: t.description,
    pluggyType: t.amountCents >= 0 ? 'CREDIT' : 'DEBIT',
    method: t.method,
    sourceCategory: t.sourceCategory,
    counterparty: hasParty
      ? {
          document:
            t.counterpartyDocType === null
              ? null
              : {
                  type: t.counterpartyDocType,
                  hmac: t.counterpartyDocType === 'CPF' ? t.counterpartyDocHmac : null,
                  publicValue: t.counterpartyDocType === 'CNPJ' ? t.counterpartyCnpj : null,
                  mask: t.counterpartyMask ?? '',
                },
          name: t.counterpartyName,
          cnae: t.counterpartyCnae,
        }
      : null,
    mcc: t.mcc,
    installment: t.installment ?? null,
  };
}

/** Pipeline id → stored row id, for every row given. */
export function idMap(
  rows: readonly Pick<TransactionRow, 'id' | 'accountId'>[],
): Map<string, string> {
  return new Map(rows.map((t) => [transactionId(t.accountId, t.id), t.id]));
}

/** The month before `today` (the last closed month: Facts.referenceMonth). */
export function previousMonth(today: CivilDate): YearMonth {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  return (m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`) as YearMonth;
}

/** "15.00" (SGS 432, % a.a.) → "0.15". String arithmetic only (CLAUDE.md rule 2). */
export function percentToRate(percent: string): string | null {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(percent);
  if (!m) return null;
  const int = m[1] ?? '0';
  let digits = `${int}${m[2] ?? ''}`;
  let point = int.length - 2;
  if (point < 1) {
    digits = `${'0'.repeat(1 - point)}${digits}`;
    point = 1;
  }
  const whole = digits.slice(0, point).replace(/^0+(?=\d)/, '');
  const dec = digits.slice(point).replace(/0+$/, '');
  return dec === '' ? whole : `${whole}.${dec}`;
}

/**
 * Last Selic point on or before `today`. A recorded series usually ends a few days before the analysis date, so
 * when no fixture covers the window ending today, step back one day at a time (at most 60) to the newest one
 * that does: the last published value, as ENGINE-SPEC C.1 item 4 does for parameters.
 */
export async function lastSelicUpTo(
  today: CivilDate,
  replay: Pick<ReplaySeries, 'series'> = new ReplaySeries(),
): Promise<{ date: string; value: string } | undefined> {
  const end = new Date(`${today}T12:00:00Z`);
  for (let back = 0; back <= 60; back++) {
    const d = new Date(end.getTime() - back * 86_400_000).toISOString().slice(0, 10) as CivilDate;
    const from = `${Number(d.slice(0, 4)) - 1}${d.slice(4)}` as CivilDate;
    const r = await replay.series(432, { from, to: d }, { mode: 'replay' });
    if (r.ok && r.value.length > 0) return r.value.at(-1);
  }
  return undefined;
}

/** Selic from the SGS series fixture (the same source /demo uses); without it the engine simply has no Selic. */
async function selicAssumption(today: CivilDate): Promise<AnalysisInput['userAssumptions']> {
  const last = await lastSelicUpTo(today);
  const value = last ? percentToRate(last.value) : null;
  if (value === null) return {};
  return {
    selicAnnual: {
      value,
      origin: 'default',
      editable: true,
      source: `sgs:432 (fixture ${last?.date})`,
    },
  };
}

export interface LiveInput {
  input: AnalysisInput;
  /** Pipeline transaction id → stored row id. */
  ids: Map<string, string>;
}

export async function loadAnswers(
  db: Db,
  userId: string,
  companyId: string,
): Promise<QuestionAnswer[]> {
  const rows = await db
    .select({ key: userAssumptions.key, value: userAssumptions.value })
    .from(userAssumptions)
    .where(
      and(
        eq(userAssumptions.userId, userId),
        eq(userAssumptions.companyId, companyId),
        like(userAssumptions.key, `${ANSWER_PREFIX}%`),
      ),
    );
  return rows.map((r) => ({
    questionId: r.key.slice(ANSWER_PREFIX.length),
    value: r.value as QuestionAnswer['value'],
  }));
}

export interface InputDeps {
  db: Db;
  secrets: Secrets;
  today: CivilDate;
  /** Pluggy client for the holder identity of a real connection (null: off or not configured). */
  pluggy: FinancialProvider | null;
}

/**
 * Accounts and transactions of the connections in force for this analysis: the PF connection and the PJ connection
 * of the analysis's company (the same scoping as the track).
 */
export async function buildLiveInput(
  analysis: AnalysisRow,
  deps: InputDeps,
): Promise<{ ok: true; value: LiveInput } | { ok: false; code: 'NO_COMPANY' | 'NO_DATA' }> {
  const { db } = deps;
  const [companyRow] = await db
    .select({ publicData: companies.publicData })
    .from(companies)
    .where(eq(companies.id, analysis.companyId))
    .limit(1);
  const company: PublicCompany | null = companyRow
    ? parsePublicCompany(companyRow.publicData)
    : null;
  if (!company) return { ok: false, code: 'NO_COMPANY' };
  const conns = await db
    .select()
    .from(connections)
    .where(
      and(
        eq(connections.userId, analysis.userId),
        eq(connections.status, 'active'),
        isNull(connections.revokedAt),
        or(eq(connections.holder, 'PF'), eq(connections.companyId, analysis.companyId)),
      ),
    );
  const accs: SourceAccount[] = [];
  const txRows: TransactionRow[] = [];
  const identities: SourceIdentity[] = [];
  for (const c of conns) {
    const rows = await db.select().from(accounts).where(eq(accounts.connectionId, c.id));
    for (const a of rows) {
      accs.push(sourceAccount(a));
      txRows.push(
        ...(await db.select().from(transactions).where(eq(transactions.accountId, a.id))),
      );
    }
    const identity = await identityOf(c, deps);
    if (identity) identities.push(identity);
  }
  if (txRows.length === 0) return { ok: false, code: 'NO_DATA' };
  txRows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));
  return {
    ok: true,
    value: {
      ids: idMap(txRows),
      input: {
        analysisId: analysis.id,
        company,
        accounts: accs,
        transactions: txRows.map(sourceTransaction),
        identities,
        userAssumptions: await selicAssumption(deps.today),
        confirmations: [],
        referenceMonth: analysis.referenceMonth as YearMonth,
        answers: await loadAnswers(db, analysis.userId, analysis.companyId),
      },
    },
  };
}

/**
 * The holder's own identity (ENGINE-SPEC E.2: never the QSA). Sample data: the synthetic persona's. Pluggy: the
 * item's identity through our key, already whitelisted (CPF only as HMAC). Missing → the pipeline falls back to the
 * company CNPJ (and no CPF match), as on /demo.
 */
async function identityOf(
  c: typeof connections.$inferSelect,
  deps: InputDeps,
): Promise<SourceIdentity | null> {
  if (c.provider === 'persona') {
    return SAMPLE_DATA.items.find((i) => i.holder === c.holder)?.identity ?? null;
  }
  if (c.provider === 'pluggy' && c.itemIdEncrypted && deps.pluggy) {
    const itemId = decrypt(c.itemIdEncrypted, deps.secrets.encryption);
    if (!itemId) return null;
    const r = await deps.pluggy.getIdentity(itemId, { mode: 'live' });
    return r.ok ? r.value : null;
  }
  return null;
}

/** Ledger rows → the pieces `buildFinancialView` needs (same reconstruction as the analysis input). */
export function ledgerInput(ledger: readonly LedgerRow[]) {
  const byAccount = new Map<string, SourceAccount>();
  for (const r of ledger) byAccount.set(r.account.id, sourceAccount(r.account));
  return {
    accounts: [...byAccount.values()],
    transactions: ledger.map((r) => sourceTransaction(r.transaction)),
    ids: idMap(ledger.map((r) => r.transaction)),
  };
}
