import type { z } from 'zod';
import { getJson, requireLive } from '../http.ts';
import type {
  Cnpj,
  CnpjProvider,
  CnpjSource,
  ProviderContext,
  ProviderError,
  PublicCompany,
  Result,
} from '../types.ts';
import {
  brasilApiSchema,
  cnpjWsSchema,
  sanitizeBrasilApiCompany,
  sanitizeCnpjWsCompany,
} from './whitelist.ts';
import {
  cnpjaSchema,
  openCnpjSchema,
  receitaWsSchema,
  sanitizeCnpjaCompany,
  sanitizeMinhaReceitaCompany,
  sanitizeOpenCnpjCompany,
  sanitizeReceitaWsCompany,
} from './whitelist-mirrors.ts';

// Live CNPJ providers (ARCHITECTURE §4.3; six public mirrors since E21, 20/11/2026). The raw response
// goes straight into the whitelist; it is never cached, logged or returned. The CNPJ travels in
// canonical form (letters kept: alphanumeric CNPJ).

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

/** A live CNPJ source as the chain sees it: its name and the pacing its free tier needs. */
export interface LiveCnpjProvider extends CnpjProvider {
  readonly source: CnpjSource;
  /** Minimum time between two calls from this process (0 = no pacing). */
  readonly minIntervalMs: number;
}

/** Everything that defines one public source: where to ask, how to read the answer, how often. */
export interface CnpjSourceSpec {
  source: CnpjSource;
  baseUrl: string;
  /**
   * The raw fields the whitelist reads. Parsing with it (zod strips unknown keys) gives the raw answer
   * reduced to whitelisted keys: the only form of a raw answer that may be written as a test fixture.
   */
  rawSchema: z.ZodType;
  sanitize: Sanitize;
  timeoutMs: number;
  retries: number;
  minIntervalMs: number;
}

const THREE_PER_MINUTE_MS = 20_000;

/** Order of the live chain (E21): the fastest, fullest mirrors first; the 3/min ones last. */
export const CNPJ_SOURCES: readonly CnpjSourceSpec[] = [
  {
    // BrasilAPI: timeout 4 s, 1 retry (ARCHITECTURE §4.3). The app's chain passes retries: 0.
    source: 'brasilapi',
    baseUrl: 'https://brasilapi.com.br/api/cnpj/v1',
    rawSchema: brasilApiSchema,
    sanitize: sanitizeBrasilApiCompany,
    timeoutMs: 4000,
    retries: 1,
    minIntervalMs: 0,
  },
  {
    source: 'opencnpj',
    baseUrl: 'https://api.opencnpj.org',
    rawSchema: openCnpjSchema,
    sanitize: sanitizeOpenCnpjCompany,
    timeoutMs: 4000,
    retries: 0,
    minIntervalMs: 0,
  },
  {
    source: 'cnpja',
    baseUrl: 'https://open.cnpja.com/office',
    rawSchema: cnpjaSchema,
    sanitize: sanitizeCnpjaCompany,
    timeoutMs: 4000,
    retries: 0,
    minIntervalMs: 0,
  },
  {
    source: 'minhareceita',
    baseUrl: 'https://minhareceita.org',
    rawSchema: brasilApiSchema,
    sanitize: sanitizeMinhaReceitaCompany,
    timeoutMs: 4000,
    retries: 0,
    minIntervalMs: 0,
  },
  {
    // CNPJ.ws public API: 3 requests/min per IP (research 03 §2.1).
    source: 'cnpjws',
    baseUrl: 'https://publica.cnpj.ws/cnpj',
    rawSchema: cnpjWsSchema,
    sanitize: sanitizeCnpjWsCompany,
    timeoutMs: 4000,
    retries: 0,
    minIntervalMs: THREE_PER_MINUTE_MS,
  },
  {
    // ReceitaWS free tier: 3 requests/min.
    source: 'receitaws',
    baseUrl: 'https://receitaws.com.br/v1/cnpj',
    rawSchema: receitaWsSchema,
    sanitize: sanitizeReceitaWsCompany,
    timeoutMs: 4000,
    retries: 0,
    minIntervalMs: THREE_PER_MINUTE_MS,
  },
];

export function cnpjSourceSpec(source: CnpjSource): CnpjSourceSpec {
  const spec = CNPJ_SOURCES.find((s) => s.source === source);
  if (!spec) throw new RangeError(`unknown CNPJ source ${source}`);
  return spec;
}

/** One adapter for any public source: GET → whitelist → `PublicCompany`. Never throws. */
export class LiveCnpj implements LiveCnpjProvider {
  readonly source: CnpjSource;
  readonly minIntervalMs: number;
  private readonly spec: CnpjSourceSpec;
  private readonly options: LiveCnpjOptions;

  constructor(spec: CnpjSourceSpec, options: LiveCnpjOptions = {}) {
    this.spec = spec;
    this.options = options;
    this.source = spec.source;
    this.minIntervalMs = spec.minIntervalMs;
  }

  async lookup(cnpj: Cnpj, ctx: ProviderContext): Promise<Result<PublicCompany, ProviderError>> {
    const live = requireLive(ctx, this.source);
    if (!live.ok) return live;
    const base = this.options.baseUrl ?? this.spec.baseUrl;
    const response = await getJson(`${base}/${encodeURIComponent(cnpj)}`, ctx, {
      source: this.source,
      timeoutMs: this.options.timeoutMs ?? this.spec.timeoutMs,
      retries: this.options.retries ?? this.spec.retries,
      ...(this.options.sleep ? { sleep: this.options.sleep } : {}),
      ...(this.options.retryDelayMs === undefined
        ? {}
        : { retryDelayMs: this.options.retryDelayMs }),
    });
    if (!response.ok) return response;
    const fetchedAt = (this.options.now?.() ?? new Date()).toISOString();
    return this.spec.sanitize(response.value, cnpj, fetchedAt);
  }
}

/** BrasilAPI: timeout 4 s, 1 retry (ARCHITECTURE §4.3). */
export class BrasilApiCnpj extends LiveCnpj {
  constructor(options: LiveCnpjOptions = {}) {
    super(cnpjSourceSpec('brasilapi'), options);
  }
}

/** OpenCNPJ (api.opencnpj.org): timeout 4 s, no retry. */
export class OpenCnpjCnpj extends LiveCnpj {
  constructor(options: LiveCnpjOptions = {}) {
    super(cnpjSourceSpec('opencnpj'), options);
  }
}

/** CNPJá open tier (open.cnpja.com): timeout 4 s, no retry. */
export class CnpjaCnpj extends LiveCnpj {
  constructor(options: LiveCnpjOptions = {}) {
    super(cnpjSourceSpec('cnpja'), options);
  }
}

/** minhareceita.org: timeout 4 s, no retry. */
export class MinhaReceitaCnpj extends LiveCnpj {
  constructor(options: LiveCnpjOptions = {}) {
    super(cnpjSourceSpec('minhareceita'), options);
  }
}

/** CNPJ.ws public API: timeout 4 s, no retry (3 requests/min per IP, research 03 §2.1). */
export class CnpjWsCnpj extends LiveCnpj {
  constructor(options: LiveCnpjOptions = {}) {
    super(cnpjSourceSpec('cnpjws'), options);
  }
}

/** ReceitaWS free tier: timeout 4 s, no retry (3 requests/min). */
export class ReceitaWsCnpj extends LiveCnpj {
  constructor(options: LiveCnpjOptions = {}) {
    super(cnpjSourceSpec('receitaws'), options);
  }
}

/** The six live providers in chain order. */
export function liveCnpjProviders(
  options: Partial<Record<CnpjSource, LiveCnpjOptions>> = {},
): LiveCnpjProvider[] {
  return CNPJ_SOURCES.map((spec) => new LiveCnpj(spec, options[spec.source] ?? {}));
}
