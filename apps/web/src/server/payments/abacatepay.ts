import 'server-only';
import { createHmac } from 'node:crypto';
import type { Result } from '@refund/engine';
import { safeEqual } from '../crypto.ts';

// ARCHITECTURE §2.5, §4.9, §8.4: AbacatePay v2, one-time Pix of the transparent checkout. Everything the app needs from
// AbacatePay goes through the `PixGateway` port, so the flow is tested with a fake (integration and e2e) and nothing
// here is guessed silently. Read on 19/11/2026 at docs.abacatepay.com (pages transparents/create, transparents/check,
// transparents/simulate-payment, comecar/modo-teste, notificacoes/webhooks, notificacoes/seguranca,
// webhooks/events/transparent):
// - one base URL `https://api.abacatepay.com/v2` for both environments; the key decides: `abc_dev_…` = Test Mode,
//   `abc_prod_…` = production; `Authorization: Bearer <key>`;
// - `POST /transparents/create` `{ method: 'PIX', data: { amount (cents, min 100), expiresIn (s, min 300),
//   description (≤ 500, no emoji), externalId, metadata } }` → `{ data: { id: 'pix_char_…', amount, status,
//   devMode, brCode, brCodeBase64, expiresAt, … }, success, error }`;
// - `GET /transparents/check?id=` → `{ data: { id, status, expiresAt } }`, status ∈ PENDING, EXPIRED, CANCELLED,
//   PAID, UNDER_DISPUTE, REFUNDED, REDEEMED, APPROVED, FAILED;
// - `POST /transparents/simulate-payment?id=` (Test Mode only) → PAID and fires `transparent.completed`.

export const ABACATEPAY_API_BASE_URL = 'https://api.abacatepay.com/v2';

/**
 * AbacatePay's public HMAC key (docs.abacatepay.com/pages/notificacoes/seguranca, read 19/11/2026): the same for every
 * account. It is NOT a secret: the signature proves the body was not altered; the webhook secret proves the origin.
 */
export const ABACATEPAY_HMAC_PUBLIC_KEY =
  't9dXRhHHo3yDEj5pVDYz0frf7q6bMKyMRmxxCPIPp3RCplBfXRxqlC6ZpiWmOqj4L63qEaeUOtrCI8P0VMUgo6iIga2ri9ogaHFs0WIIywSMg0q7RmBfybe1E5XJcfC4IW3alNqym0tXoAKkzvfEjZxV6bE0oG2zJrNNYmUCKZyV0KZ3JS8Votf9EAWWYdiDkMkpbMdPggfh1EqHlVkMiTady6jOR3hyzGEHrIz2Ret0xHKMbiqkr9HS1JhNHDX9';

/** `X-Webhook-Signature`: base64(HMAC-SHA256(public key, raw body)). */
export function abacatePaySignature(rawBody: string, key = ABACATEPAY_HMAC_PUBLIC_KEY): string {
  return createHmac('sha256', key).update(rawBody, 'utf8').digest('base64');
}

export function validAbacatePaySignature(rawBody: string, given: string | null): boolean {
  return given !== null && safeEqual(given, abacatePaySignature(rawBody));
}

/** The environment comes from the key prefix. Anything else is treated as production (the safe side). */
export type KeyMode = 'test' | 'production';

export function keyModeOf(apiKey: string): KeyMode {
  return apiKey.startsWith('abc_dev_') ? 'test' : 'production';
}

export type ProviderPixStatus =
  | 'PENDING'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'PAID'
  | 'UNDER_DISPUTE'
  | 'REFUNDED'
  | 'REDEEMED'
  | 'APPROVED'
  | 'FAILED';

export interface CreatePixInput {
  amountCents: number;
  description: string;
  expiresInSeconds: number;
  /** Our `charges.id`. */
  externalId: string;
  /** Only opaque ids (no personal data goes to AbacatePay). */
  metadata: Record<string, string>;
}

export interface PixCharge {
  id: string;
  amountCents: number;
  status: ProviderPixStatus;
  devMode: boolean;
  brCode: string;
  brCodeBase64: string;
  expiresAt: string;
}

export interface GatewayError {
  code: 'UNAVAILABLE' | 'REJECTED' | 'INVALID_RESPONSE';
  /** AbacatePay's `error` text, for the log only (never shown to the user). */
  detail?: string;
}

/** The port: what the app asks of AbacatePay. */
export interface PixGateway {
  readonly keyMode: KeyMode;
  createPix(input: CreatePixInput): Promise<Result<PixCharge, GatewayError>>;
  checkPix(
    id: string,
  ): Promise<
    Result<{ id: string; status: ProviderPixStatus; expiresAt: string | null }, GatewayError>
  >;
  /** Test Mode only (AbacatePay answers an error with a production key). */
  simulatePayment(id: string): Promise<Result<void, GatewayError>>;
}

const STATUSES = new Set<string>([
  'PENDING',
  'EXPIRED',
  'CANCELLED',
  'PAID',
  'UNDER_DISPUTE',
  'REFUNDED',
  'REDEEMED',
  'APPROVED',
  'FAILED',
]);

const isStatus = (v: unknown): v is ProviderPixStatus => typeof v === 'string' && STATUSES.has(v);
const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

const TIMEOUT_MS = 10_000;

export interface HttpGatewayOptions {
  apiKey: string;
  /** Defaults to the official URL; a loopback base is honoured only for a Test Mode key (local fake in e2e). */
  baseUrl?: string;
  fetch?: typeof fetch;
}

/** The override exists only for a local fake (e2e): a loopback host, never a remote one (code review E17, L9). */
function isLoopback(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === '127.0.0.1' || host === 'localhost' || host === '[::1]';
  } catch {
    return false;
  }
}

/** The HTTP adapter of the port. */
export function abacatePayHttp(options: HttpGatewayOptions): PixGateway {
  const keyMode = keyModeOf(options.apiKey);
  const base =
    keyMode === 'test' && options.baseUrl && isLoopback(options.baseUrl)
      ? options.baseUrl.replace(/\/+$/, '')
      : ABACATEPAY_API_BASE_URL;
  const doFetch = options.fetch ?? fetch;

  async function call(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<Result<Record<string, unknown>, GatewayError>> {
    let res: Response;
    try {
      res = await doFetch(`${base}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          accept: 'application/json',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: 'no-store',
      });
    } catch {
      return { ok: false, error: { code: 'UNAVAILABLE' } };
    }
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      return { ok: false, error: { code: res.ok ? 'INVALID_RESPONSE' : 'UNAVAILABLE' } };
    }
    const envelope = (json ?? {}) as { data?: unknown; error?: unknown; success?: unknown };
    if (!res.ok || envelope.success === false || (envelope.error ?? null) !== null) {
      const detail = typeof envelope.error === 'string' ? envelope.error.slice(0, 200) : undefined;
      return {
        ok: false,
        error: {
          code: res.status >= 500 || res.status === 429 ? 'UNAVAILABLE' : 'REJECTED',
          ...(detail ? { detail } : {}),
        },
      };
    }
    if (envelope.data === null || typeof envelope.data !== 'object') {
      return { ok: false, error: { code: 'INVALID_RESPONSE' } };
    }
    return { ok: true, value: envelope.data as Record<string, unknown> };
  }

  return {
    keyMode,
    async createPix(input) {
      const r = await call('POST', '/transparents/create', {
        method: 'PIX',
        data: {
          amount: input.amountCents,
          expiresIn: input.expiresInSeconds,
          description: input.description,
          externalId: input.externalId,
          metadata: input.metadata,
        },
      });
      if (!r.ok) return r;
      const d = r.value;
      if (
        !str(d.id) ||
        typeof d.amount !== 'number' ||
        !isStatus(d.status) ||
        typeof d.devMode !== 'boolean' ||
        !str(d.brCode) ||
        !str(d.brCodeBase64) ||
        // The image goes straight into <img src>: only an inline PNG, never a URL.
        !d.brCodeBase64.startsWith('data:image/png;base64,') ||
        !str(d.expiresAt)
      ) {
        return { ok: false, error: { code: 'INVALID_RESPONSE' } };
      }
      return {
        ok: true,
        value: {
          id: d.id,
          amountCents: d.amount,
          status: d.status,
          devMode: d.devMode,
          brCode: d.brCode,
          brCodeBase64: d.brCodeBase64,
          expiresAt: d.expiresAt,
        },
      };
    },
    async checkPix(id) {
      const r = await call('GET', `/transparents/check?id=${encodeURIComponent(id)}`);
      if (!r.ok) return r;
      const d = r.value;
      if (!isStatus(d.status)) return { ok: false, error: { code: 'INVALID_RESPONSE' } };
      return {
        ok: true,
        value: { id, status: d.status, expiresAt: str(d.expiresAt) ? d.expiresAt : null },
      };
    },
    async simulatePayment(id) {
      if (keyMode !== 'test')
        return { ok: false, error: { code: 'REJECTED', detail: 'production key' } };
      const r = await call(
        'POST',
        `/transparents/simulate-payment?id=${encodeURIComponent(id)}`,
        {},
      );
      return r.ok ? { ok: true, value: undefined } : r;
    },
  };
}
