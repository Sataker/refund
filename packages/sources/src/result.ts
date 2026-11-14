import type { ProviderError, Result } from './types.ts';

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function fail(
  code: ProviderError['code'],
  source: string,
  message: string,
  extra: { recoverable?: boolean; retryInMs?: number } = {},
): { ok: false; error: ProviderError } {
  const recoverable =
    extra.recoverable ?? (code === 'RATE_LIMITED' || code === 'UNAVAILABLE' || code === 'TIMEOUT');
  const error: ProviderError = { code, message, recoverable, source };
  if (extra.retryInMs !== undefined) error.retryInMs = extra.retryInMs;
  return { ok: false, error };
}
