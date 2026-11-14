import { formatCnae } from '../cnpj/whitelist.ts';
import { markSanitized } from '../fixtures/sanitization.ts';
import { isValidCpf } from '../pii/cpf.ts';
import { protectDocument, syntheticDocument } from '../pii/document.ts';
import { redactDescription, stripDocuments } from '../pii/redact.ts';
import { fail, ok } from '../result.ts';
import type {
  CivilDate,
  ProtectedDocument,
  ProviderError,
  Result,
  SourceAccount,
  SourceIdentity,
  SourceItem,
  SourceTransaction,
} from '../types.ts';
import {
  pluggyAccountSchema,
  pluggyIdentitySchema,
  pluggyItemSchema,
  pluggyTransactionSchema,
} from './pluggy-schema.ts';

// Whitelist `pluggy@1` (ARCHITECTURE §6.2): each `Source*` object is built field by field. A CPF becomes
// HMAC + mask; a CNPJ stays in clear; partners keep only the HMAC; person names never leave.

export const PLUGGY_WHITELIST = 'pluggy@1';

export interface PluggySanitizeOptions {
  /** `PII_PEPPER` (live) or null (fixtures, personas): then `hmac` is null. */
  pepper: Uint8Array | null;
  /** Fixture recording: replace every CPF/CNPJ with a deterministic synthetic one (§5.2). */
  syntheticDocuments?: boolean;
}

const ITEM_KEPT = new Set(['id', 'status', 'executionStatus', 'clientUserId', 'connector']);
const ACCOUNT_KEPT = new Set([
  'id',
  'type',
  'subtype',
  'name',
  'marketingName',
  'currencyCode',
  'balance',
]);
const TRANSACTION_KEPT = new Set([
  'id',
  'accountId',
  'date',
  'description',
  'amount',
  'type',
  'category',
  'merchant',
  'creditCardMetadata',
  'paymentData',
]);
const IDENTITY_KEPT = new Set(['document', 'documentType', 'economicActivities', 'parties']);

function discarded(raw: unknown, kept: Set<string>): string[] {
  if (raw === null || typeof raw !== 'object') return [];
  return Object.keys(raw)
    .filter((k) => !kept.has(k))
    .sort();
}

function unexpected(what: string): { ok: false; error: ProviderError } {
  return fail('UNEXPECTED_RESPONSE', 'pluggy', `Resposta inesperada do Open Finance (${what}).`, {
    recoverable: false,
  });
}

/** Reais (number or decimal string) → integer cents, half-up on the 3rd decimal, without float math. */
export function reaisToCents(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  let s = typeof value === 'number' ? String(value) : value.trim();
  if (/e/i.test(s)) s = Number(s).toFixed(6);
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) return null;
  const frac = (m[3] ?? '').padEnd(3, '0');
  let cents = Number(m[2]) * 100 + Number(frac.slice(0, 2));
  if (Number(frac[2]) >= 5) cents += 1;
  if (!Number.isSafeInteger(cents)) return null;
  return m[1] === '-' && cents !== 0 ? -cents : cents;
}

function civilDate(value: string): CivilDate | null {
  // Pluggy sends the posting date as an ISO timestamp at 00:00 or 03:00 UTC; the calendar day is the
  // first 10 characters.
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day
    ? (day as CivilDate)
    : null;
}

class DocumentProtector {
  replaced = 0;
  private readonly options: PluggySanitizeOptions;
  constructor(options: PluggySanitizeOptions) {
    this.options = options;
  }

  protect(value: string | null | undefined, hidePublicValue = false): ProtectedDocument | null {
    const raw = (value ?? '').replace(/[.\-/\s]/g, '').toUpperCase();
    if (raw === '') return null;
    let doc = raw;
    if (this.options.syntheticDocuments) {
      const type = isValidCpf(raw) ? 'CPF' : raw.length === 14 ? 'CNPJ' : null;
      if (!type) return null;
      doc = syntheticDocument(raw, type);
      this.replaced++;
    }
    return protectDocument(doc, this.options.pepper, { hidePublicValue });
  }
}

export function sanitizePluggyItem(raw: unknown): Result<SourceItem, ProviderError> {
  const r = pluggyItemSchema.safeParse(raw);
  if (!r.success) return unexpected('item');
  const i = r.data;
  const item: SourceItem = {
    sourceId: i.id,
    clientUserId: i.clientUserId ?? null,
    status: i.status,
    executionStatus: i.executionStatus ?? '',
    connector: {
      id: i.connector.id,
      name: stripDocuments(i.connector.name),
      sandbox: i.connector.isSandbox === true,
      type: i.connector.type ?? '',
    },
  };
  return ok(
    markSanitized(item, {
      whitelist: PLUGGY_WHITELIST,
      discardedFields: discarded(raw, ITEM_KEPT),
      replacedDocuments: 0,
    }),
  );
}

export function sanitizePluggyAccount(
  raw: unknown,
  context: { holder: 'PF' | 'PJ'; institution: string },
): Result<SourceAccount, ProviderError> {
  const r = pluggyAccountSchema.safeParse(raw);
  if (!r.success) return unexpected('conta');
  const a = r.data;
  if (a.type !== 'BANK' && a.type !== 'CREDIT') return unexpected('tipo de conta');
  const account: SourceAccount = {
    sourceId: a.id,
    holder: context.holder,
    type: a.type,
    subtype: a.subtype ?? '',
    // The product name may carry an account number: documents and long digit runs are redacted.
    productName: redactDescription(a.marketingName ?? a.name ?? ''),
    institution: stripDocuments(context.institution),
    currency: a.currencyCode ?? 'BRL',
    balanceCents: reaisToCents(a.balance),
  };
  return ok(
    markSanitized(account, {
      whitelist: PLUGGY_WHITELIST,
      discardedFields: discarded(raw, ACCOUNT_KEPT),
      replacedDocuments: 0,
    }),
  );
}

function method(
  paymentMethod: string | null | undefined,
  isCard: boolean,
): SourceTransaction['method'] {
  const m = (paymentMethod ?? '').toUpperCase();
  if (m === 'PIX' || m === 'TED' || m === 'DOC' || m === 'BOLETO') return m;
  return isCard ? 'CARD' : 'OTHER';
}

export function sanitizePluggyTransaction(
  raw: unknown,
  options: PluggySanitizeOptions,
): Result<SourceTransaction, ProviderError> {
  const r = pluggyTransactionSchema.safeParse(raw);
  if (!r.success) return unexpected('transação');
  const t = r.data;
  const date = civilDate(t.date);
  const cents = reaisToCents(t.amount);
  if (date === null || cents === null) return unexpected('data ou valor');
  const protector = new DocumentProtector(options);

  // The counterparty is who received a debit or who paid a credit.
  const party = t.type === 'DEBIT' ? t.paymentData?.receiver : t.paymentData?.payer;
  let document = protector.protect(party?.documentNumber?.value);
  // The name of a person (CPF) never leaves; a company's (CNPJ) is public. Without a document we cannot
  // tell, so the name is dropped too.
  let name = document?.type === 'CNPJ' ? stripDocuments(party?.name ?? '') || null : null;
  if (!document && t.merchant?.cnpj) {
    document = protector.protect(t.merchant.cnpj);
    // merchant.businessName is kept only when there is a CNPJ (§6.2).
    name = document ? stripDocuments(t.merchant.businessName ?? '') || null : null;
  }
  const cnae = formatCnae(t.merchant?.cnae) ?? null;

  const installmentNumber = t.creditCardMetadata?.installmentNumber;
  const totalInstallments = t.creditCardMetadata?.totalInstallments;
  const mcc = t.creditCardMetadata?.payeeMCC;

  const transaction: SourceTransaction = {
    sourceId: t.id,
    accountSourceId: t.accountId,
    date,
    amountCents: t.type === 'CREDIT' ? Math.abs(cents) : -Math.abs(cents),
    description: redactDescription(t.description ?? '', {
      document,
      name: party?.name ?? null,
    }),
    pluggyType: t.type,
    method: method(t.paymentData?.paymentMethod, t.creditCardMetadata != null),
    sourceCategory: t.category ?? null,
    counterparty: document || name || cnae ? { document, name, cnae } : null,
    // Merchant category code of the card acquirer: describes the shop, not a person.
    mcc: mcc === null || mcc === undefined || String(mcc).trim() === '' ? null : String(mcc).trim(),
    installment:
      installmentNumber != null && totalInstallments != null
        ? { number: installmentNumber, total: totalInstallments }
        : null,
  };
  return ok(
    markSanitized(transaction, {
      whitelist: PLUGGY_WHITELIST,
      discardedFields: discarded(raw, TRANSACTION_KEPT),
      replacedDocuments: protector.replaced,
    }),
  );
}

export function sanitizePluggyIdentity(
  raw: unknown,
  options: PluggySanitizeOptions,
): Result<SourceIdentity, ProviderError> {
  const r = pluggyIdentitySchema.safeParse(raw);
  if (!r.success) return unexpected('identidade');
  const i = r.data;
  const protector = new DocumentProtector(options);
  const document = protector.protect(i.document);
  if (!document) return unexpected('documento do titular');
  const identity: SourceIdentity = {
    holder: document.type === 'CPF' ? 'PF' : 'PJ',
    document,
    economicActivities: (i.economicActivities ?? []).flatMap((a) => {
      const c = formatCnae(a.code);
      return c ? [c] : [];
    }),
    // Partners: HMAC + mask only, never the number or the name (REVISAO A6).
    partnerDocuments: (i.parties ?? []).flatMap((p) => {
      const d = protector.protect(p.document, true);
      return d ? [d] : [];
    }),
  };
  return ok(
    markSanitized(identity, {
      whitelist: PLUGGY_WHITELIST,
      discardedFields: discarded(raw, IDENTITY_KEPT),
      replacedDocuments: protector.replaced,
    }),
  );
}
