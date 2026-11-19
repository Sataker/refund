import 'server-only';
import { type Db, findChargeById, findChargeByProviderId, refundCharge } from '@refund/db';
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
    async verify({ body, headers }) {
      if (!config.secret || !config.keyMode)
        return { ok: false, error: { code: 'NOT_CONFIGURED' } };
      // Header only (payments review L6): a secret in the query string ends up in access logs.
      const given = headers.get(SECRET_HEADER) ?? '';
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
        logger.warn('payments.dev_event_rejected', { type: p.event });
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
  /** Our `charges.id`, sent as metadata at creation. */
  chargeId: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function transparentOf(payload: unknown): TransparentData | null {
  const data = ((payload ?? {}) as { data?: unknown }).data;
  const t = ((data ?? {}) as { transparent?: unknown }).transparent as
    | Record<string, unknown>
    | undefined;
  if (!t || typeof t.id !== 'string' || typeof t.amount !== 'number') return null;
  if (typeof t.status !== 'string' || typeof t.devMode !== 'boolean') return null;
  const meta = (t.metadata ?? {}) as Record<string, unknown>;
  const chargeId =
    typeof meta.chargeId === 'string' && UUID.test(meta.chargeId) ? meta.chargeId : null;
  return { id: t.id, amount: t.amount, status: t.status, devMode: t.devMode, chargeId };
}

/** Events that take the money back: a refund, or a dispute lost (Pix MED). */
function isClawback(type: string, status: string): boolean {
  return (
    (type === 'transparent.refunded' && status === 'REFUNDED') ||
    (type === 'transparent.disputed' && status === 'REFUNDED') ||
    type === 'transparent.lost'
  );
}

const HANDLED = new Set([
  'transparent.completed',
  'transparent.refunded',
  'transparent.disputed',
  'transparent.lost',
]);

/**
 * `transparent.completed` with a Pix PAID: charge paid + period granted (same transaction as the event row). A
 * refund or a lost dispute: charge refunded and its period cancelled, also when it arrives before the completion
 * (events come in any order). `subscription.*` (Pix Automatico) and `checkout.*` are recorded and ignored: out of
 * the MVP. The charge is found by AbacatePay's id; if the webhook arrived before our own update, by the `chargeId`
 * we sent as metadata (code review E17, L12).
 */
export async function processAbacatePayEvent(
  ev: VerifiedEvent,
  tx: Db,
  nowMs: number = Date.now(),
): Promise<'processed' | 'ignored'> {
  if (!HANDLED.has(ev.type)) return 'ignored';
  const t = transparentOf(ev.payload);
  if (!t) return 'ignored';
  let charge = await findChargeByProviderId(tx, t.id);
  if (!charge && t.chargeId) {
    const byMeta = await findChargeById(tx, t.chargeId);
    if (byMeta && (byMeta.providerChargeId === null || byMeta.providerChargeId === t.id))
      charge = byMeta;
  }
  if (!charge) {
    logger.warn('payments.unknown_charge', { type: ev.type });
    return 'ignored';
  }
  // Same environment and exactly the amount we asked for; anything else is never a paid plan.
  if (t.devMode !== charge.devMode || t.amount !== charge.amountCents) {
    logger.error('payments.charge_mismatch', {
      type: ev.type,
      devModeOk: t.devMode === charge.devMode,
      amountOk: t.amount === charge.amountCents,
    });
    return 'ignored';
  }
  if (ev.type === 'transparent.completed') {
    if (t.status !== 'PAID') return 'ignored';
    if ((await grantPaidCharge(tx, charge, new Date(nowMs))) === 'granted') return 'processed';
    // Money received for a charge we had closed (expired, cancelled, refunded): nothing is granted automatically.
    // logger.error also lands in system_events; the runbook (EXECUTION §9, E17) says how to settle it by hand.
    if (charge.status !== 'pending' && charge.status !== 'paid') {
      logger.error('payments.paid_not_granted', {
        chargeStatus: charge.status,
        period: charge.period,
      });
    }
    return 'ignored';
  }
  if (!isClawback(ev.type, t.status)) return 'ignored';
  if (!(await refundCharge(tx, charge.id))) return 'ignored';
  logger.info('payments.charge_refunded', { period: charge.period, type: ev.type });
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
