// Boundary types of @refund/sources (ARCHITECTURE §4.1 and §4.3).
// This package does not import the engine, so it declares its own `Result` and `CivilDate`
// with the same shape as `@refund/engine` (ARCHITECTURE §4.1).

/** Civil date "YYYY-MM-DD" (no time, no time zone). Same shape as `@refund/engine`'s `CivilDate`. */
export type CivilDate = `${number}-${string}-${string}`;

export type Result<T, E = ProviderError> = { ok: true; value: T } | { ok: false; error: E };

export interface ProviderError {
  code:
    | 'NOT_FOUND'
    | 'INVALID'
    | 'RATE_LIMITED'
    | 'UNAVAILABLE'
    | 'TIMEOUT'
    | 'UNAUTHORIZED'
    | 'NOT_CONFIGURED'
    | 'FIXTURE_MISSING'
    | 'UNEXPECTED_RESPONSE';
  message: string;
  recoverable: boolean;
  /**
   * 'brasilapi' | 'cnpjws' | 'pluggy' | 'sgs' | 'persona' | 'replay', or 'input' when no provider is
   * involved (validating what the user typed, e.g. `validateCnpj`; EXECUTION §9, 14/11).
   */
  source: string;
  /** From Retry-After. */
  retryInMs?: number;
}

export type DataMode = 'live' | 'replay';
export interface ProviderContext {
  mode: DataMode;
  signal?: AbortSignal;
  /** Injectable in tests. */
  fetch?: typeof fetch;
  /** Never receives PII. */
  log?: (event: string, data: Record<string, unknown>) => void;
}

// ---------- CNPJ ----------

/** 14 chars `[0-9A-Z]{12}[0-9]{2}`, uppercase, no mask. */
export type Cnpj = string & { readonly __brand: 'Cnpj' };

/** ONLY whitelisted fields (ARCHITECTURE §6.2). */
export interface PublicCompany {
  cnpj: Cnpj;
  /** Masked if EI/MEI. */
  displayLegalName: string;
  displayTradeName: string | null;
  masked: boolean;
  legalNature: { code: string; description: string };
  size: 'MEI' | 'ME' | 'EPP' | 'OTHER' | 'UNKNOWN';
  primaryCnae: { code: string; description: string };
  secondaryCnaes: { code: string; description: string }[];
  registrationStatus: string;
  activityStartDate: CivilDate;
  uf: string;
  ibgeMunicipality: string | null;
  simples: { optedIn: boolean; since: CivilDate | null; excludedAt: CivilDate | null };
  mei: { optedIn: boolean; since: CivilDate | null; excludedAt: CivilDate | null };
  taxRegimeHistory: { year: number; form: string }[];
  source: 'brasilapi' | 'cnpjws' | 'replay' | 'persona';
  /** ISO-8601. */
  fetchedAt: string;
}

export interface CnpjProvider {
  lookup(cnpj: Cnpj, ctx: ProviderContext): Promise<Result<PublicCompany, ProviderError>>;
}

// ---------- Financial (Open Finance) ----------

/** Subset of Pluggy's schema that we use, ALREADY sanitized. Personas and fixtures follow this format. */
export interface SourceAccount {
  /** Pluggy id (fixtures: synthetic). */
  sourceId: string;
  holder: 'PF' | 'PJ';
  type: 'BANK' | 'CREDIT';
  subtype: 'CHECKING_ACCOUNT' | 'SAVINGS_ACCOUNT' | 'CREDIT_CARD' | string;
  /** "Conta Corrente" (no account number). */
  productName: string;
  institution: string;
  currency: 'BRL' | string;
  balanceCents: number | null;
}

export interface ProtectedDocument {
  type: 'CPF' | 'CNPJ';
  /** HMAC-SHA256(PII_PEPPER, doc), CPF only; null in fixtures without a pepper. */
  hmac: string | null;
  /** CNPJ stays in clear (it is public); CPF NEVER. */
  publicValue: string | null;
  /** "***.456.789-**" | "12.ABC.345/0001-67" */
  mask: string;
}

export interface SourceTransaction {
  sourceId: string;
  accountSourceId: string;
  date: CivilDate;
  /** Positive = inflow, negative = outflow. */
  amountCents: number;
  /** Already without document digits (redaction, ARCHITECTURE §6.3). */
  description: string;
  pluggyType: 'DEBIT' | 'CREDIT';
  method: 'PIX' | 'TED' | 'DOC' | 'BOLETO' | 'CARD' | 'FEE' | 'FX' | 'OTHER';
  /** Pluggy's category, when present. */
  sourceCategory: string | null;
  counterparty: {
    document: ProtectedDocument | null;
    name: string | null;
    cnae: string | null;
  } | null;
  mcc: string | null;
  installment: { number: number; total: number } | null;
}

export interface SourceIdentity {
  holder: 'PF' | 'PJ';
  document: ProtectedDocument;
  /** CNAEs (PJ). */
  economicActivities: string[];
  /** HMAC only; no name (REVISAO A6). */
  partnerDocuments: ProtectedDocument[];
}

export interface SourceItem {
  sourceId: string;
  clientUserId: string | null;
  status: 'UPDATED' | 'UPDATING' | 'LOGIN_ERROR' | 'OUTDATED' | 'WAITING_USER_INPUT' | string;
  executionStatus: string;
  connector: {
    id: number;
    name: string;
    sandbox: boolean;
    type: 'PERSONAL_BANK' | 'BUSINESS_BANK' | string;
  };
}

export interface FinancialProvider {
  readonly name: 'pluggy' | 'persona' | 'replay';
  createConnectToken?(
    clientUserId: string,
    ctx: ProviderContext,
  ): Promise<Result<{ accessToken: string; expiresAt: string }, ProviderError>>;
  getItem(itemId: string, ctx: ProviderContext): Promise<Result<SourceItem, ProviderError>>;
  listAccounts(
    itemId: string,
    ctx: ProviderContext,
  ): Promise<Result<SourceAccount[], ProviderError>>;
  /** Already-sanitized pages; the consumer iterates without loading everything into memory. */
  listTransactions(
    accountSourceId: string,
    period: { from: CivilDate; to: CivilDate },
    ctx: ProviderContext,
  ): AsyncIterable<Result<SourceTransaction[], ProviderError>>;
  getIdentity(
    itemId: string,
    ctx: ProviderContext,
  ): Promise<Result<SourceIdentity | null, ProviderError>>;
  revokeItem?(itemId: string, ctx: ProviderContext): Promise<Result<void, ProviderError>>;
  /** Cheap probe for the automatic fallback (A11). */
  probe?(ctx: ProviderContext): Promise<Result<{ sandboxAvailable: boolean }, ProviderError>>;
}

// ---------- Series (BCB SGS) ----------

export interface SeriesProvider {
  series(
    code: 432 | 11 | 433 | 4389,
    period: { from: CivilDate; to: CivilDate },
    ctx: ProviderContext,
  ): Promise<Result<{ date: CivilDate; value: string }[], ProviderError>>;
}

// ---------- Monofásico NCM (frozen file) ----------

export interface NcmRegime {
  monofasico: boolean;
  /** Legal basis of the matched row of table 4.3.10 (null when nothing matched). */
  law: string | null;
  /** Matched NCM prefix, digits only (null when nothing matched). */
  prefix: string | null;
}

// ---------- PII (ARCHITECTURE §6.3, §6.4) ----------

export type PiiRule =
  | 'forbidden-key'
  | 'formatted-cpf'
  | 'unformatted-cpf'
  | 'email'
  | 'phone'
  | 'persona-cnpj';

export interface PiiFinding {
  /** JSON path (`$.items[0].document`) or `$` for plain text. */
  path: string;
  rule: PiiRule;
  /** Masked excerpt: never the whole value found. */
  excerpt: string;
  /** Offset in the scanned text, when the finding comes from text. */
  index?: number;
}

// ---------- Fixtures (ARCHITECTURE §5.2) ----------

export type FixtureSource =
  | 'brasilapi.cnpj'
  | 'cnpjws.cnpj'
  | 'sgs.series'
  | 'pluggy.item'
  | 'pluggy.accounts'
  | 'pluggy.transactions'
  | 'pluggy.identity'
  | 'firecrawl.monitor.page';

export interface Sanitization {
  /** Version of the applied whitelist, e.g. `cnpj@1`, `pluggy@1`, `sgs@1`. */
  whitelist: string;
  /** Top-level raw fields that the whitelist did not copy. */
  discardedFields: string[];
  /** Documents replaced by synthetic ones (Pluggy sandbox fixtures, §5.2). */
  replacedDocuments: number;
}

export interface FixtureEnvelope<T = unknown> {
  $format: 'refund.fixture/v1';
  source: FixtureSource;
  key: string;
  origin: 'live' | 'synthetic';
  /** ISO-8601. */
  recordedAt: string;
  recordedBy: string;
  sanitization: Sanitization;
  /** SHA-256 (hex) of the canonical JSON of `data`. */
  dataSha256: string;
  data: T;
}

// ---------- External cache port (SCHEMA `external_cache`; implemented by apps/web) ----------

export interface CachedEntry {
  /** Already sanitized when written; re-validated on read. */
  payload: unknown;
  /** ISO-8601. */
  fetchedAt: string;
  /** ISO-8601. An expired entry is still served as the last resort (ARCHITECTURE §4.3). */
  expiresAt: string;
}

export interface ExternalCachePort {
  get(source: 'cnpj' | 'sgs', key: string): Promise<CachedEntry | null>;
  set?(source: 'cnpj' | 'sgs', key: string, payload: unknown, fetchedAt: string): Promise<void>;
}
