import 'server-only';
import {
  type CivilDate,
  type FinancialProvider,
  type ProviderContext,
  type ProviderError,
  type Result,
  type SourceAccount,
  type SourceIdentity,
  type SourceItem,
  type SourceTransaction,
  sanitizePluggyAccount,
  sanitizePluggyIdentity,
  sanitizePluggyItem,
  sanitizePluggyTransaction,
} from '@refund/sources';

// PluggyFinancial (ARCHITECTURE §4.3, §2.4) over Pluggy's REST API with `fetch`, so tests inject the
// network. Every response goes through the `pluggy@1` whitelist of @refund/sources before leaving this
// file (§6.2). The API key (2 h) lives only in process memory and is renewed at 110 min (§9.3).
// It belongs in @refund/sources/financial/pluggy.ts; it is here while E11 cannot touch packages (§9).

export const PLUGGY_API = 'https://api.pluggy.ai';
const API_KEY_TTL_MS = 110 * 60_000;
const TIMEOUT_MS = 8_000;
const PAGE_SIZE = 500;

export interface PluggyOptions {
  clientId: string;
  clientSecret: string;
  pepper: Buffer;
  fetch?: typeof fetch;
  baseUrl?: string;
  now?: () => number;
}

function failure(
  code: ProviderError['code'],
  message: string,
  recoverable = true,
): { ok: false; error: ProviderError } {
  return { ok: false, error: { code, source: 'pluggy', message, recoverable } };
}

function statusError(status: number): { ok: false; error: ProviderError } {
  if (status === 404) return failure('NOT_FOUND', 'Conexão não encontrada no Open Finance.', false);
  if (status === 401 || status === 403) {
    return failure('UNAUTHORIZED', 'O Open Finance recusou nossas credenciais.', false);
  }
  if (status === 429) return failure('RATE_LIMITED', 'O Open Finance pediu para esperar.');
  return failure('UNAVAILABLE', 'O Open Finance não respondeu agora.');
}

interface Page {
  results?: unknown[];
  totalPages?: number;
}

export class PluggyFinancial implements FinancialProvider {
  readonly name = 'pluggy' as const;
  private readonly options: PluggyOptions;
  private apiKey: { value: string; expiresAt: number } | null = null;

  constructor(options: PluggyOptions) {
    this.options = options;
  }

  private get fetchFn(): typeof fetch {
    return this.options.fetch ?? fetch;
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  private async request(
    path: string,
    init: { method?: string; body?: unknown; auth?: boolean; signal?: AbortSignal } = {},
  ): Promise<Result<unknown, ProviderError>> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (init.body !== undefined) headers['content-type'] = 'application/json';
    if (init.auth !== false) {
      const key = await this.key(init.signal);
      if (!key.ok) return key;
      headers['x-api-key'] = key.value;
    }
    let res: Response;
    try {
      res = await this.fetchFn(`${this.options.baseUrl ?? PLUGGY_API}${path}`, {
        method: init.method ?? 'GET',
        headers,
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
        signal: init.signal ?? AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      const timeout = (err as { name?: string } | null)?.name === 'TimeoutError';
      return timeout
        ? failure('TIMEOUT', 'O Open Finance demorou para responder.')
        : failure('UNAVAILABLE', 'O Open Finance não respondeu agora.');
    }
    if (res.status === 401 && init.auth !== false) this.apiKey = null;
    if (!res.ok) return statusError(res.status);
    if (res.status === 204) return { ok: true, value: null };
    try {
      return { ok: true, value: await res.json() };
    } catch {
      return failure('UNEXPECTED_RESPONSE', 'Resposta inesperada do Open Finance.', false);
    }
  }

  /** POST /auth → apiKey, cached ~1h50 (ARCHITECTURE §9.3). */
  private async key(signal?: AbortSignal): Promise<Result<string, ProviderError>> {
    if (this.apiKey && this.apiKey.expiresAt > this.now())
      return { ok: true, value: this.apiKey.value };
    const r = await this.request('/auth', {
      method: 'POST',
      auth: false,
      body: { clientId: this.options.clientId, clientSecret: this.options.clientSecret },
      ...(signal ? { signal } : {}),
    });
    if (!r.ok) return r;
    const apiKey = (r.value as { apiKey?: unknown } | null)?.apiKey;
    if (typeof apiKey !== 'string' || apiKey === '') {
      return failure('UNEXPECTED_RESPONSE', 'Resposta inesperada do Open Finance (auth).', false);
    }
    this.apiKey = { value: apiKey, expiresAt: this.now() + API_KEY_TTL_MS };
    return { ok: true, value: apiKey };
  }

  /** POST /connect_token with `options.clientUserId` (checked again on register) and avoidDuplicates. */
  async createConnectToken(
    clientUserId: string,
    ctx: ProviderContext,
  ): Promise<Result<{ accessToken: string; expiresAt: string }, ProviderError>> {
    const r = await this.request('/connect_token', {
      method: 'POST',
      // No `webhookUrl` here: it would not carry our secret header (ARCHITECTURE §4.9).
      body: { options: { clientUserId, avoidDuplicates: true } },
      ...(ctx.signal ? { signal: ctx.signal } : {}),
    });
    if (!r.ok) return r;
    const accessToken = (r.value as { accessToken?: unknown } | null)?.accessToken;
    if (typeof accessToken !== 'string' || accessToken === '') {
      return failure('UNEXPECTED_RESPONSE', 'Resposta inesperada do Open Finance (token).', false);
    }
    return {
      ok: true,
      value: { accessToken, expiresAt: new Date(this.now() + 30 * 60_000).toISOString() },
    };
  }

  async getItem(itemId: string, ctx: ProviderContext): Promise<Result<SourceItem, ProviderError>> {
    const r = await this.request(`/items/${encodeURIComponent(itemId)}`, signalOf(ctx));
    return r.ok ? sanitizePluggyItem(r.value) : r;
  }

  async listAccounts(
    itemId: string,
    ctx: ProviderContext,
  ): Promise<Result<SourceAccount[], ProviderError>> {
    const item = await this.getItem(itemId, ctx);
    if (!item.ok) return item;
    const holder = item.value.connector.type === 'BUSINESS_BANK' ? 'PJ' : 'PF';
    const r = await this.request(`/accounts?itemId=${encodeURIComponent(itemId)}`, signalOf(ctx));
    if (!r.ok) return r;
    const out: SourceAccount[] = [];
    for (const raw of (r.value as Page | null)?.results ?? []) {
      const a = sanitizePluggyAccount(raw, { holder, institution: item.value.connector.name });
      if (!a.ok) return a;
      out.push(a.value);
    }
    return { ok: true, value: out };
  }

  async *listTransactions(
    accountSourceId: string,
    period: { from: CivilDate; to: CivilDate },
    ctx: ProviderContext,
  ): AsyncIterable<Result<SourceTransaction[], ProviderError>> {
    for (let page = 1; ; page++) {
      const query = new URLSearchParams({
        accountId: accountSourceId,
        from: period.from,
        to: period.to,
        pageSize: String(PAGE_SIZE),
        page: String(page),
      });
      const r = await this.request(`/transactions?${query}`, signalOf(ctx));
      if (!r.ok) {
        yield r;
        return;
      }
      const body = (r.value ?? {}) as Page;
      const out: SourceTransaction[] = [];
      for (const raw of body.results ?? []) {
        const t = sanitizePluggyTransaction(raw, { pepper: this.options.pepper });
        if (!t.ok) {
          yield t;
          return;
        }
        out.push(t.value);
      }
      yield { ok: true, value: out };
      if (page >= (body.totalPages ?? 1) || out.length === 0) return;
    }
  }

  async getIdentity(
    itemId: string,
    ctx: ProviderContext,
  ): Promise<Result<SourceIdentity | null, ProviderError>> {
    const r = await this.request(`/identity?itemId=${encodeURIComponent(itemId)}`, signalOf(ctx));
    if (!r.ok) return r.error.code === 'NOT_FOUND' ? { ok: true, value: null } : r;
    return sanitizePluggyIdentity(r.value, { pepper: this.options.pepper });
  }

  async revokeItem(itemId: string, ctx: ProviderContext): Promise<Result<void, ProviderError>> {
    const r = await this.request(`/items/${encodeURIComponent(itemId)}`, {
      method: 'DELETE',
      ...signalOf(ctx),
    });
    return r.ok || r.error.code === 'NOT_FOUND' ? { ok: true, value: undefined } : r;
  }

  /** ADR-012 probe: POST /auth + GET /connectors?sandbox=true. */
  async probe(ctx: ProviderContext): Promise<Result<{ sandboxAvailable: boolean }, ProviderError>> {
    const ids = await this.sandboxConnectorIds(ctx);
    return ids.ok ? { ok: true, value: { sandboxAvailable: ids.value.length > 0 } } : ids;
  }

  /**
   * Ids of the sandbox connectors only (`isSandbox: true`): the widget lists nothing else, so no real
   * bank can be connected in this version (compliance review E11, C1).
   */
  async sandboxConnectorIds(ctx: ProviderContext): Promise<Result<number[], ProviderError>> {
    const r = await this.request('/connectors?sandbox=true', signalOf(ctx));
    if (!r.ok) return r;
    const results = ((r.value as Page | null)?.results ?? []) as {
      id?: unknown;
      isSandbox?: unknown;
    }[];
    const ids = results
      .filter((c) => c.isSandbox === true && typeof c.id === 'number')
      .map((c) => c.id as number);
    return { ok: true, value: ids };
  }
}

function signalOf(ctx: ProviderContext): { signal?: AbortSignal } {
  return ctx.signal ? { signal: ctx.signal } : {};
}
