export const PACKAGE_NAME = '@refund/sources';

export { ChainedCnpj, type ChainedCnpjOptions } from './cnpj/chain.ts';
export { BrasilApiCnpj, CnpjWsCnpj, type LiveCnpjOptions } from './cnpj/live.ts';
export { ReplayCnpj, type ReplayCnpjOptions } from './cnpj/replay.ts';
export { parsePublicCompany, publicCompanySchema } from './cnpj/schema.ts';
export { cnpjCheckDigits, formatCnpj, validateCnpj } from './cnpj/validate.ts';
export {
  CNPJ_WHITELIST,
  formatCnae,
  MASKED_LEGAL_NAME,
  MASKED_LEGAL_NATURES,
  sanitizeBrasilApiCompany,
  sanitizeCnpjWsCompany,
} from './cnpj/whitelist.ts';
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
