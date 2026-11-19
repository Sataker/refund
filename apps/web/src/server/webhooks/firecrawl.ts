import 'server-only';
import { createHmac } from 'node:crypto';
import { safeEqual, sha256Hex } from '../crypto.ts';
import type { WebhookVerifier } from './types.ts';

// ARCHITECTURE §4.9, Firecrawl: `X-Firecrawl-Signature: sha256=<hex>` == hex(HMAC-SHA256(FIRECRAWL_WEBHOOK_SECRET,
// raw body)). The payload carries no stable delivery id, so the event id is sha256(body): a retried delivery has the
// same bytes and lands on the same webhook_events row (200 without reprocessing).

export const FIRECRAWL_SIGNATURE_HEADER = 'x-firecrawl-signature';

/** 1 MB: the Firecrawl cap only (code review E16, M3); every other provider keeps the 64 KB default. */
export const FIRECRAWL_MAX_BODY_BYTES = 1024 * 1024;

/** The header value Firecrawl sends for `body` (also what the tests sign with). */
export function firecrawlSignature(body: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;
}

export function firecrawlVerifier(config: { secret: string | undefined }): WebhookVerifier {
  return {
    provider: 'firecrawl',
    // A monitor.page delivery carries whole page diffs (up to 50 pages); each diff is still cut at MAX_DIFF_CHARS.
    maxBodyBytes: FIRECRAWL_MAX_BODY_BYTES,
    // webhook_events keeps the event type and the page count only (ADR-010); the diff goes to law_changes.
    stored(payload) {
      const p = (payload ?? {}) as { type?: unknown; data?: unknown };
      return {
        ...(typeof p.type === 'string' ? { type: p.type.slice(0, 60) } : {}),
        ...(Array.isArray(p.data) ? { items: p.data.length } : {}),
      };
    },
    async verify({ body, headers }) {
      if (!config.secret) return { ok: false, error: { code: 'NOT_CONFIGURED' } };
      const given = headers.get(FIRECRAWL_SIGNATURE_HEADER) ?? '';
      if (!safeEqual(given, firecrawlSignature(body, config.secret))) {
        return { ok: false, error: { code: 'INVALID_SIGNATURE' } };
      }
      let payload: unknown;
      try {
        payload = JSON.parse(body);
      } catch {
        return { ok: false, error: { code: 'INVALID_PAYLOAD' } };
      }
      const type = (payload as { type?: unknown } | null)?.type;
      if (typeof type !== 'string') return { ok: false, error: { code: 'INVALID_PAYLOAD' } };
      return { ok: true, value: { eventId: sha256Hex(body), type: type.slice(0, 60), payload } };
    },
  };
}
