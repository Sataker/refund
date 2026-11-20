// Where the numbers of a live analysis come from (UX review 19/11, C2). Pure and browser-safe: the server reads the
// company's source and the providers of the connections the run used; the screens only label them.
//
// "Usar dados de exemplo" connects Marina's synthetic statements to whatever CNPJ the track has, and the Pluggy
// sandbox serves test accounts: either way the transactions are not the company's. Every screen of such an analysis
// says so, so a real company name never sits next to someone else's money as if it were its own.

/** `sample`: the hero persona's synthetic statements; `sandbox`: Pluggy's test accounts; `none`: nothing connected. */
export type BankSource = 'sample' | 'sandbox' | 'none';

export interface DataOrigin {
  /** The company card is a persona or replay company (synthetic CNPJ, no real public data). */
  companySynthetic: boolean;
  /** The company is the sample persona's own (Marina Dev): her statements are hers, no banner needed. */
  companyIsSample: boolean;
  bank: BankSource;
}

/** Provider of each connection the run read → the analysis's bank source (the sample wins: it is never the company's). */
export function bankSourceOf(providers: readonly string[]): BankSource {
  if (providers.some((p) => p === 'persona' || p === 'replay')) return 'sample';
  if (providers.includes('pluggy')) return 'sandbox';
  return 'none';
}

/**
 * The origin before the run, on /app's "Tudo pronto" (the track's connections): the same banner and seal as the analysis
 * screens, from the active connections the run will read.
 */
export function trackOrigin(input: {
  companySource: string | undefined;
  companyIsSample: boolean;
  connections: readonly ({ provider: string; status: string } | null)[];
}): DataOrigin {
  return {
    companySynthetic: input.companySource === 'persona' || input.companySource === 'replay',
    companyIsSample: input.companyIsSample,
    bank: bankSourceOf(
      input.connections.flatMap((c) => (c !== null && c.status === 'active' ? [c.provider] : [])),
    ),
  };
}

/** The persistent banner's text, or null when the statements are the company's own (or there are none). */
export function bankBannerText(origin: DataOrigin, companyName: string): string | null {
  if (origin.bank === 'sample' && !origin.companyIsSample)
    return `Extrato de exemplo (Marina, empresa fictícia): os valores não são da ${companyName}.`;
  if (origin.bank === 'sandbox')
    return `Extrato do ambiente de testes do Open Finance: os valores não são da ${companyName}.`;
  return null;
}

export const SYNTHETIC_LIVE_LABEL = 'Dados sintéticos · Open Finance em sandbox';
export const SAMPLE_BANK_LABEL =
  'Extrato de exemplo (empresa fictícia) · dados públicos da Receita';
/** Same text as SandboxSeal's LIVE_LABEL (a real company's public data, sandbox accounts). */
export const PUBLIC_LIVE_LABEL = 'Open Finance sandbox · dados públicos da Receita';

/** The seal of a live analysis (screens and the report footer). */
export function liveSealLabel(origin: DataOrigin): string {
  if (origin.companySynthetic) return SYNTHETIC_LIVE_LABEL;
  if (origin.bank === 'sample') return SAMPLE_BANK_LABEL;
  return PUBLIC_LIVE_LABEL;
}
