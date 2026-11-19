import 'server-only';
import { type Db, findChargeByProviderId, schema } from '@refund/db';
import { and, eq } from 'drizzle-orm';
import { safeEqual } from '../crypto.ts';
import { logger } from '../log.ts';
import { type KeyMode, validAbacatePaySignature } from '../payments/abacatepay.ts';
import { grantPaidCharge } from '../payments/checkout.ts';
import { receiveWebhookInline, type VerifiedEvent, type WebhookVerifier } from './types.ts';

// ARCHITECTURE §4.9, AbacatePay: (1) `X-Webhook-Secret` header or `?webhookSecret=` == ABACATEPAY_WEBHOOK_SECRET (proves
// the origin) and (2) `X-Webhook-Signature` == base64(HMAC-SHA256(AbacatePay's public key, raw body)) (proves the body).
// Both compared in constant time. An event with `devMode: true` is accepted only while our key is a Test Mode key.
// Idempotency: the delivery `id` (`log_…`, the same across retries) on webhook_events, and the charge itself
// (`UPDATE … WHERE status = 'pending'`), because a manual resend from the dashboard comes with a new id.

export const SECRET_HEADER = 'x-webhook-secret';
export const SIGNATURE_HEADER = 'x-webhook-signature';

export interface AbacatePayWebhookConfig {
  secret: string | undefined;
  keyMode: KeyMode | null;
}

export function abacatePayVerifier(config: AbacatePayWebhookConfig): WebhookVerifier {
  return {
    provider: 'abacatepay',
    stored(payload) {
      const p = (payload ?? {}) as Record<string, unknown>;
      const data = (p.data ?? {}) as Record<string, unknown>;
      const charge = (data.transparent ?? {}) as Record<string, unknown>;
      // Never the customer or payer block (name, e-mail, masked tax id): ids and the outcome only.
      const out: Record<string, unknown> = {};
      if (typeof p.event === 'string') out.event = p.event;
      if (typeof p.id === 'string') out.id = p.id;
      if (typeof p.devMode === 'boolean') out.devMode = p.devMode;
      if (typeof charge.id === 'string') out.chargeId = charge.id;
      if (typeof charge.status === 'string') out.status = charge.status;
      return out;
    },
    async verify({ body, headers, url }) {
      if (!config.secret || !config.keyMode)
        return { ok: false, error: { code: 'NOT_CONFIGURED' } };
      const given = headers.get(SECRET_HEADER) ?? url.searchParams.get('webhookSecret') ?? '';
      if (!safeEqual(given, config.secret)) {
        return { ok: false, error: { code: 'INVALID_SIGNATURE' } };
      }
      if (!validAbacatePaySignature(body, headers.get(SIGNATURE_HEADER))) {
        return { ok: false, error: { code: 'INVALID_SIGNATURE' } };
      }
      let payload: unknown;
      try {
        payload = JSON.parse(body);
      } catch {
        return { ok: false, error: { code: 'INVALID_PAYLOAD' } };
      }
      const p = (payload ?? {}) as Record<string, unknown>;
      if (typeof p.id !== 'string' || p.id === '' || typeof p.event !== 'string') {
        return { ok: false, error: { code: 'INVALID_PAYLOAD' } };
      }
      // A Test Mode event is never trusted by a production integration (§4.9): 401, no retry.
      if (p.devMode === true && config.keyMode !== 'test') {
        logger.warn('payments.dev_event_rejected', { event: p.event });
        return { ok: false, error: { code: 'INVALID_SIGNATURE' } };
      }
      return {
        ok: true,
        value: { eventId: p.id.slice(0, 120), type: p.event.slice(0, 60), payload },
      };
    },
  };
}

interface TransparentData {
  id: string;
  amount: number;
  status: string;
  devMode: boolean;
}

function transparentOf(payload: unknown): TransparentData | null {
  const data = ((payload ?? {}) as { data?: unknown }).data;
  const t = ((data ?? {}) as { transparent?: unknown }).transparent as
    | Record<string, unknown>
    | undefined;
  if (!t || typeof t.id !== 'string' || typeof t.amount !== 'number') return null;
  if (typeof t.status !== 'string' || typeof t.devMode !== 'boolean') return null;
  return { id: t.id, amount: t.amount, status: t.status, devMode: t.devMode };
}

/**
 * `transparent.completed` with a Pix PAID → charge paid + period granted (same transaction as the event row);
 * `transparent.refunded` → charge refunded and its period cancelled (the 30-day guarantee goes through AbacatePay's
 * customer portal). `subscription.*` (Pix Automático) and `checkout.*` are recorded and ignored: out of the MVP.
 */
export async function processAbacatePayEvent(
  ev: VerifiedEvent,
  tx: Db,
  nowMs: number = Date.now(),
): Promise<'processed' | 'ignored'> {
  if (ev.type !== 'transparent.completed' && ev.type !== 'transparent.refunded') return 'ignored';
  const t = transparentOf(ev.payload);
  if (!t) return 'ignored';
  const charge = await findChargeByProviderId(tx, t.id);
  if (!charge) {
    logger.warn('payments.unknown_charge', { event: ev.type });
    return 'ignored';
  }
  // Same environment and exactly the amount we asked for; anything else is never a paid plan.
  if (t.devMode !== charge.devMode || t.amount !== charge.amountCents) {
    logger.error('payments.charge_mismatch', {
      event: ev.type,
      devModeOk: t.devMode === charge.devMode,
      amountOk: t.amount === charge.amountCents,
    });
    return 'ignored';
  }
  if (ev.type === 'transparent.completed') {
    if (t.status !== 'PAID') return 'ignored';
    return (await grantPaidCharge(tx, charge, new Date(nowMs))) === 'granted'
      ? 'processed'
      : 'ignored';
  }
  if (t.status !== 'REFUNDED') return 'ignored';
  const { charges, subscriptions } = schema;
  const refunded = await tx
    .update(charges)
    .set({ status: 'refunded' })
    .where(and(eq(charges.id, charge.id), eq(charges.status, 'paid')))
    .returning({ id: charges.id });
  if (refunded.length === 0) return 'ignored';
  await tx
    .update(subscriptions)
    .set({ status: 'cancelled' })
    .where(eq(subscriptions.chargeId, charge.id));
  logger.info('payments.charge_refunded', { period: charge.period });
  return 'processed';
}

export function receiveAbacatePayWebhook(
  req: Request,
  db: Db,
  config: AbacatePayWebhookConfig,
): Promise<Response> {
  return receiveWebhookInline(abacatePayVerifier(config), req, db, (ev, tx) =>
    processAbacatePayEvent(ev, tx),
  );
}
