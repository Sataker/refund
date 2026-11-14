import { fail, ok } from './result.ts';
import type { ProviderContext, ProviderError, Result } from './types.ts';

// One HTTP GET → Result. Never throws, never logs the body (it is raw, unsanitized data).

export interface GetJsonOptions {
  source: string;
  timeoutMs: number;
  /** Retries on TIMEOUT/UNAVAILABLE only (never on 4xx or 429). */
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
  retryDelayMs?: number;
}

// BrasilAPI's CDN answers 403 to Node's default fetch client (checked on 14/11/2026); a plain, generic
// User-Agent gets 200. It identifies the software only, never a person.
export const REQUEST_HEADERS: Readonly<Record<string, string>> = {
  accept: 'application/json',
  'user-agent': 'refund-sources/1.0',
};

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** `Retry-After` in seconds or as an HTTP date → milliseconds. */
export function parseRetryAfter(value: string | null, nowMs: number): number | undefined {
  if (!value) return undefined;
  if (/^\d+$/.test(value.trim())) return Number(value.trim()) * 1000;
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, at - nowMs);
}

function isAbort(e: unknown): boolean {
  return e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError');
}

async function once(
  url: string,
  ctx: ProviderContext,
  opts: GetJsonOptions,
): Promise<Result<unknown, ProviderError>> {
  const doFetch = ctx.fetch ?? globalThis.fetch;
  const timeout = AbortSignal.timeout(opts.timeoutMs);
  const signal = ctx.signal ? AbortSignal.any([ctx.signal, timeout]) : timeout;
  let response: Response;
  try {
    response = await doFetch(url, { headers: REQUEST_HEADERS, signal });
  } catch (e) {
    if (ctx.signal?.aborted) return fail('TIMEOUT', opts.source, 'Consulta cancelada.');
    if (isAbort(e)) return fail('TIMEOUT', opts.source, 'A fonte demorou demais para responder.');
    return fail('UNAVAILABLE', opts.source, 'A fonte está fora do ar agora.');
  }
  const { status } = response;
  if (status === 404) return fail('NOT_FOUND', opts.source, 'Não encontrado na fonte.');
  if (status === 429) {
    const retryInMs = parseRetryAfter(response.headers.get('retry-after'), Date.now());
    return fail('RATE_LIMITED', opts.source, 'Limite de consultas da fonte atingido.', {
      ...(retryInMs === undefined ? {} : { retryInMs }),
    });
  }
  if (status === 401 || status === 403) {
    return fail('UNAUTHORIZED', opts.source, 'A fonte recusou o acesso.');
  }
  if (status === 400 || status === 406 || status === 422) {
    return fail('INVALID', opts.source, 'A fonte recusou a consulta.');
  }
  if (status >= 500) return fail('UNAVAILABLE', opts.source, 'A fonte está fora do ar agora.');
  if (status < 200 || status >= 300) {
    return fail('UNEXPECTED_RESPONSE', opts.source, 'Resposta inesperada da fonte.');
  }
  try {
    return ok(await response.json());
  } catch (e) {
    if (isAbort(e)) return fail('TIMEOUT', opts.source, 'A fonte demorou demais para responder.');
    return fail('UNEXPECTED_RESPONSE', opts.source, 'A fonte respondeu em formato inesperado.');
  }
}

export async function getJson(
  url: string,
  ctx: ProviderContext,
  opts: GetJsonOptions,
): Promise<Result<unknown, ProviderError>> {
  const retries = opts.retries ?? 0;
  const sleep = opts.sleep ?? defaultSleep;
  let result = await once(url, ctx, opts);
  for (let attempt = 0; attempt < retries; attempt++) {
    if (result.ok) return result;
    if (result.error.code !== 'TIMEOUT' && result.error.code !== 'UNAVAILABLE') return result;
    if (ctx.signal?.aborted) return result;
    await sleep(opts.retryDelayMs ?? 300);
    result = await once(url, ctx, opts);
  }
  return result;
}

/** Live providers refuse to touch the network outside `live` mode (`/demo` makes no external call). */
export function requireLive(ctx: ProviderContext, source: string): Result<void, ProviderError> {
  if (ctx.mode === 'live') return ok(undefined);
  return fail('NOT_CONFIGURED', source, 'Consulta externa desligada no modo replay.', {
    recoverable: false,
  });
}
