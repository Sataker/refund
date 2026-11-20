export const PACKAGE_NAME = '@refund/sources';

export { ChainedCnpj, type ChainedCnpjOptions, preferDatedSimples } from './cnpj/chain.ts';
export {
  CnpjProviderGuard,
  type ProviderGuardOptions,
  type ProviderHealth,
  type SkipReason,
} from './cnpj/guard.ts';
export {
  BrasilApiCnpj,
  CNPJ_SOURCES,
  CnpjaCnpj,
  type CnpjSourceSpec,
  CnpjWsCnpj,
  cnpjSourceSpec,
  LiveCnpj,
  type LiveCnpjOptions,
  type LiveCnpjProvider,
  liveCnpjProviders,
  MinhaReceitaCnpj,
  OpenCnpjCnpj,
  ReceitaWsCnpj,
} from './cnpj/live.ts';
export { ReplayCnpj, type ReplayCnpjOptions } from './cnpj/replay.ts';
export { parsePublicCompany, publicCompanySchema } from './cnpj/schema.ts';
// `cnpjCheckDigits` stays internal: it throws on a malformed base, and nothing may throw across
// packages (code review 14/11). Callers use `validateCnpj`, which returns a Result.
export { formatCnpj, validateCnpj } from './cnpj/validate.ts';
export {
  CNPJ_WHITELIST,
  formatCnae,
  MASKED_LEGAL_NAME,
  MASKED_LEGAL_NATURES,
  sanitizeBrasilApiCompany,
  sanitizeCnpjWsCompany,
} from './cnpj/whitelist.ts';
export {
  sanitizeCnpjaCompany,
  sanitizeMinhaReceitaCompany,
  sanitizeOpenCnpjCompany,
  sanitizeReceitaWsCompany,
} from './cnpj/whitelist-mirrors.ts';
export { DEFAULT_PAGE_SIZE, type PersonaDataset, PersonaFinancial } from './financial/persona.ts';
export { ReplayFinancial } from './financial/replay.ts';
export {
  protectedDocumentSchema,
  sourceAccountSchema,
  sourceIdentitySchema,
  sourceItemSchema,
  sourceTransactionSchema,
} from './financial/schema.ts';
export {
  PLUGGY_WHITELIST,
  type PluggySanitizeOptions,
  reaisToCents,
  sanitizePluggyAccount,
  sanitizePluggyIdentity,
  sanitizePluggyItem,
  sanitizePluggyTransaction,
} from './financial/whitelist.ts';
export {
  createEnvelope,
  dataSha256,
  findFixture,
  stableStringify,
  verifyEnvelope,
} from './fixtures/envelope.ts';
export { sanitizationOf } from './fixtures/sanitization.ts';
export {
  FIRECRAWL_WHITELIST,
  isMeaningfulChange,
  MAX_DIFF_CHARS,
  type MonitorEvent,
  type MonitorJudgment,
  type MonitorPage,
  type MonitorPageStatus,
  sanitizeFirecrawlEvent,
} from './law/firecrawl.ts';
export { type LawChangeFixture, lawChangeFixture } from './law/replay.ts';
export { NCM_ROWS, NCM_TABLE_SOURCE, type NcmRow, ncmRegime } from './ncm/index.ts';
export {
  ALLOWED_EMAIL_DOMAINS,
  detectPii,
  FORBIDDEN_KEYS,
  findForbiddenKeys,
  hmacDocument,
  isAllowedEmailDomain,
  isValidCpf,
  mask,
  maskCpf,
  protectDocument,
  redactDescription,
  type ScanOptions,
  scanText,
  stripDocuments,
  syntheticDocument,
} from './pii/index.ts';
export { fixtureKey, type RecordingOptions, recording } from './recorder.ts';
export { ChainedSeries, ReplaySeries, seriesKey } from './series/replay.ts';
export {
  type SeriesPoint,
  SGS_WHITELIST,
  type SgsCode,
  SgsSeries,
  type SgsSeriesOptions,
  sanitizeSgsPoints,
  sgsWindows,
} from './series/sgs.ts';
export type {
  CachedEntry,
  CivilDate,
  Cnpj,
  CnpjProvider,
  CnpjSource,
  DataMode,
  ExternalCachePort,
  FinancialProvider,
  FixtureEnvelope,
  FixtureSource,
  NcmRegime,
  PiiFinding,
  PiiRule,
  ProtectedDocument,
  ProviderContext,
  ProviderError,
  PublicCompany,
  Result,
  Sanitization,
  SeriesProvider,
  SourceAccount,
  SourceIdentity,
  SourceItem,
  SourceTransaction,
} from './types.ts';
