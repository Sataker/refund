import { getJson, requireLive } from '../http.ts';
import type {
  Cnpj,
  CnpjProvider,
  ProviderContext,
  ProviderError,
  PublicCompany,
  Result,
} from '../types.ts';
import { sanitizeBrasilApiCompany, sanitizeCnpjWsCompany } from './whitelist.ts';

// Live CNPJ providers (ARCHITECTURE §4.3). The raw response goes straight into the whitelist; it is
// never cached, logged or returned. The CNPJ travels in canonical form (letters kept: alphanumeric CNPJ).

export interface LiveCnpjOptions {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  baseUrl?: string;
}

type Sanitize = (
  raw: unknown,
  cnpj: Cnpj,
  fetchedAt: string,
) => Result<PublicCompany, ProviderError>;
type Lookup = (cnpj: Cnpj, ctx: ProviderContext) => Promise<Result<PublicCompany, ProviderError>>;

function createLookup(
  source: 'brasilapi' | 'cnpjws',
  url: (cnpj: Cnpj) => string,
  sanitize: Sanitize,
  options: LiveCnpjOptions & { timeoutMs: number; retries: number },
): Lookup {
  return async (cnpj, ctx) => {
    const live = requireLive(ctx, source);
    if (!live.ok) return live;
    const response = await getJson(url(cnpj), ctx, {
      source,
      timeoutMs: options.timeoutMs,
      retries: options.retries,
      ...(options.sleep ? { sleep: options.sleep } : {}),
      ...(options.retryDelayMs === undefined ? {} : { retryDelayMs: options.retryDelayMs }),
    });
    if (!response.ok) return response;
    const fetchedAt = (options.now?.() ?? new Date()).toISOString();
    return sanitize(response.value, cnpj, fetchedAt);
  };
}

/** BrasilAPI: timeout 4 s, 1 retry (ARCHITECTURE §4.3). */
export class BrasilApiCnpj implements CnpjProvider {
  readonly lookup: Lookup;
  constructor(options: LiveCnpjOptions = {}) {
    const base = options.baseUrl ?? 'https://brasilapi.com.br/api/cnpj/v1';
    this.lookup = createLookup(
      'brasilapi',
      (cnpj) => `${base}/${encodeURIComponent(cnpj)}`,
      sanitizeBrasilApiCompany,
      { ...options, timeoutMs: options.timeoutMs ?? 4000, retries: options.retries ?? 1 },
    );
  }
}

/** CNPJ.ws public API: timeout 4 s, no retry (3 requests/min per IP, research 03 §2.1). */
export class CnpjWsCnpj implements CnpjProvider {
  readonly lookup: Lookup;
  constructor(options: LiveCnpjOptions = {}) {
    const base = options.baseUrl ?? 'https://publica.cnpj.ws/cnpj';
    this.lookup = createLookup(
      'cnpjws',
      (cnpj) => `${base}/${encodeURIComponent(cnpj)}`,
      sanitizeCnpjWsCompany,
      { ...options, timeoutMs: options.timeoutMs ?? 4000, retries: options.retries ?? 0 },
    );
  }
}
