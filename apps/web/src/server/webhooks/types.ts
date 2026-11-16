import 'server-only';
import type { Db, WebhookProvider } from '@refund/db';
import { finishWebhookEvent, recordWebhookEvent } from '@refund/db';
import type { Result } from '@refund/engine';
import { logger } from '../log.ts';

// ARCHITECTURE §4.9 (ADR-010): one verifier per provider over the RAW body, constant-time comparison,
// idempotency on webhook_events (provider, event_id). Invalid → 401 (no retry); our error → 500.

export interface VerifiedEvent {
  eventId: string;
  type: string;
  payload: unknown;
}

export type VerifyError = { code: 'INVALID_SIGNATURE' | 'NOT_CONFIGURED' | 'INVALID_PAYLOAD' };

export interface WebhookVerifier {
  provider: WebhookProvider;
  /** Receives the RAW body (await req.text()), never the parsed JSON. */
  verify(req: {
    body: string;
    headers: Headers;
    url: URL;
  }): Promise<Result<VerifiedEvent, VerifyError>>;
  /**
   * What `webhook_events.payload` keeps (ADR-010: minimal). Identifiers that give access to data are
   * stored only as an HMAC (ARCHITECTURE §9.3). Default: event name, event id and trigger only.
   */
  stored?(payload: unknown): Record<string, unknown>;
}

/** Larger bodies are refused before parsing (code review E11). */
export const MAX_WEBHOOK_BODY_BYTES = 64 * 1024;

export interface ReceiveDeps {
  db: Db;
  /** Defers work past the response (`waitUntil` from @vercel/functions in production). */
  defer: (work: Promise<unknown>) => void;
}

const json = (status: number, body: Record<string, unknown>) => Response.json(body, { status });

/**
 * Verify → record (idempotent) → respond 200 at once → process in `defer`. A repeated event answers
 * 200 without reprocessing; the processing outcome lands on the event row (processed/ignored/error).
 */
export async function receiveWebhook(
  v: WebhookVerifier,
  req: Request,
  deps: ReceiveDeps,
  process: (ev: VerifiedEvent) => Promise<'processed' | 'ignored'>,
): Promise<Response> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > MAX_WEBHOOK_BODY_BYTES) return json(413, { ok: false });
  const body = await req.text();
  if (Buffer.byteLength(body, 'utf8') > MAX_WEBHOOK_BODY_BYTES) return json(413, { ok: false });
  const verified = await v.verify({ body, headers: req.headers, url: new URL(req.url) });
  if (!verified.ok) {
    logger.warn('webhook.rejected', { provider: v.provider, code: verified.error.code });
    return json(verified.error.code === 'INVALID_PAYLOAD' ? 400 : 401, { ok: false });
  }
  const ev = verified.value;
  let id: number | null;
  try {
    id = await recordWebhookEvent(deps.db, {
      provider: v.provider,
      eventId: ev.eventId,
      type: ev.type,
      payload: v.stored ? v.stored(ev.payload) : minimal(ev.payload),
    });
  } catch (err) {
    logger.error('webhook.error', { provider: v.provider, error: err });
    return json(500, { ok: false });
  }
  if (id === null) return json(200, { ok: true, duplicate: true });
  const eventRowId = id;
  deps.defer(
    process(ev)
      .then((status) => finishWebhookEvent(deps.db, eventRowId, status))
      .catch(async (err: unknown) => {
        logger.error('webhook.failed', { provider: v.provider, type: ev.type, error: err });
        await finishWebhookEvent(deps.db, eventRowId, 'error', 'processing error').catch(() => {});
      }),
  );
  return json(200, { ok: true });
}

/** Only the event name, its id and the trigger (ADR-010: "the stored payload is minimal"). */
export function minimal(payload: unknown): Record<string, unknown> {
  if (payload === null || typeof payload !== 'object') return {};
  const p = payload as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of ['event', 'eventId', 'triggeredBy']) {
    if (typeof p[key] === 'string') out[key] = p[key];
  }
  return out;
}
