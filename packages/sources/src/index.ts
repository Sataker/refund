export const PACKAGE_NAME = '@refund/sources';

export { cnpjCheckDigits, formatCnpj, validateCnpj } from './cnpj/validate.ts';
export type {
  CivilDate,
  Cnpj,
  CnpjProvider,
  DataMode,
  FinancialProvider,
  ProtectedDocument,
  ProviderContext,
  ProviderError,
  PublicCompany,
  Result,
  SeriesProvider,
  SourceAccount,
  SourceIdentity,
  SourceItem,
  SourceTransaction,
} from './types.ts';
