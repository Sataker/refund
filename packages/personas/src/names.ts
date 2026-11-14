// Closed list of the names that may appear in persona data (ARCHITECTURE §7.5, TESTS §3.3).
// Every person and company here is fictitious, except the merchants marked "real brand": they are
// public companies needed by the ENGINE-SPEC E.7 regexes and carry no CNPJ in the data.
// People paid by Pix to a CPF (employees, psychologist) never have a name in the data: the
// sanitized description says "[pessoa]" (ARCHITECTURE §6.3), so they are not listed.

export const HOLDER_FIRST_NAMES = {
  'dev-exportador': 'Marina',
} as const;

export const COMPANY_NAMES = {
  devExportador: { legalName: 'MARINA DEV LTDA', tradeName: 'Marina Dev' },
  healthPlan: { legalName: 'PLANO AURORA SAUDE S.A.', tradeName: 'Aurora Saúde' },
  gym: { legalName: 'ACADEMIA RITMO FORTE LTDA', tradeName: 'Ritmo Forte' },
} as const;

export const MERCHANT_NAMES = {
  /** Real brand (ENGINE-SPEC F.2 and E.7 regex `NETFLIX`); no CNPJ in the data. */
  streaming: 'NETFLIX.COM',
  /** Fictitious supermarket (E.7 regex `SUPERMERC`). */
  supermarket: 'SUPERMERCADO VILA SERENA',
} as const;

/** Fictitious foreign client that pays the export invoices. */
export const FOREIGN_CLIENT_NAMES = {
  devExportador: 'HARBORLIGHT ANALYTICS INC',
} as const;

/** Fictitious bank and connector names. */
export const INSTITUTION_NAMES = {
  bank: 'Banco Meridiano',
  connectorPf: 'Banco Meridiano (persona sintética)',
  connectorPj: 'Banco Meridiano Empresas (persona sintética)',
} as const;

/** Every name allowed in `counterparty.name`, `displayLegalName`, `displayTradeName` and `institution`. */
export const ALLOWED_NAMES: ReadonlySet<string> = new Set([
  ...Object.values(HOLDER_FIRST_NAMES),
  ...Object.values(COMPANY_NAMES).flatMap((c) => [c.legalName, c.tradeName]),
  ...Object.values(MERCHANT_NAMES),
  ...Object.values(FOREIGN_CLIENT_NAMES),
  ...Object.values(INSTITUTION_NAMES),
]);
