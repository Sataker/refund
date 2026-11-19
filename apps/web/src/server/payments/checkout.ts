import 'server-only';
import {
  attachProviderCharge,
  type ChargeRow,
  type ChargeStatus,
  cancelCharge,
  closePendingCharge,
  type Db,
  findOwnedCharge,
  insertCharge,
  reserveCappedCharge,
  settleCharge,
} from '@refund/db';
import { z } from 'zod';
import { safeEqual } from '../crypto.ts';
import { logger } from '../log.ts';
import {
  type ChargePeriod,
  isPlanId,
  PERIOD_DAYS,
  PIX_PLANS,
  type PlanId,
  pixAmountCents,
  VALIDATION_OFFER,
} from '../plans/catalog.ts';
import { rateLimit } from '../rate-limit.ts';
import { type ActionResult, fail, ok } from '../result.ts';
import { pollLimit } from '../track/limits.ts';
import type { PixGateway } from './abacatepay.ts';

// ARCHITECTURE §2.5, §4.7 "plans and Pix", §8.4; ADR-009: a one-time Pix grants a period (31 / 366 / 7 days). The
// price always comes from the catalog in code, never from the client. Each core receives its gateway and database, so
// the integration tests drive the whole flow (charge → simulate-payment → webhook → plan) with a fake AbacatePay.

export interface PaymentDeps {
  db: Db;
  userId: string;
  /** null when the `payments` capability is off. */
  gateway: PixGateway | null;
  nowMs?: number;
  /** HMAC of the client IP (never the IP itself), for the per-IP limits; null when unknown. */
  ipHash?: string | null;
  /** VALIDATION_OFFER_CODE; null or absent = the validation offer is off. */
  validationCode?: string | null;
}

/** ARCHITECTURE §9.4: startPixCheckout 10/h per session. */
export const PIX_RATE = { limit: 10, windowMs: 60 * 60_000 } as const;
/** Payments review M3: charges per IP (many throwaway sessions behind one address). */
export const PIX_IP_RATE = { limit: 20, windowMs: 60 * 60_000 } as const;
/** Payments review M1: validation charges per IP per day. */
export const VALIDATION_IP_RATE = { limit: 2, windowMs: 24 * 60 * 60_000 } as const;
/** Payments review L9: "Simular pagamento" has its own budget. */
export const SIMULATE_RATE = { limit: 20, windowMs: 60 * 60_000 } as const;
/** §2.5: the QR lives 15 minutes. */
export const PIX_EXPIRES_IN_SECONDS = 900;
/** §4.7 / §2.5: getCharge asks AbacatePay itself only after 20 s without a webhook. */
export const RECONCILE_AFTER_MS = 20_000;

const PAYMENTS_OFF = 'O pagamento por Pix não está ativo neste deploy.';
const PIX_FAILED = 'Não conseguimos gerar o Pix agora. Tente de novo em instantes.';
const NOT_FOUND = 'Cobrança não encontrada.';

export const checkoutInput = z.object({
  planId: z.enum(PIX_PLANS),
  period: z.enum(['monthly', 'yearly', 'validation']),
  /** Only for the validation offer: the code from the private link. */
  code: z.string().max(200).optional(),
});

const OFFER_OFF = 'Esta oferta não está disponível.';

const PLAN_NAME: Record<(typeof PIX_PLANS)[number], string> = {
  personal: 'Pessoal',
  mei: 'MEI',
  business: 'Empresa',
};
const PERIOD_NAME: Record<ChargePeriod, string> = {
  monthly: 'mensal',
  yearly: 'anual',
  validation: '7 dias',
};

export interface CheckoutView {
  chargeId: string;
  brCode: string;
  brCodeBase64: string;
  expiresAt: string;
  devMode: boolean;
  amountCents: number;
}

export async function startPixCheckoutWith(
  input: unknown,
  deps: PaymentDeps,
): Promise<ActionResult<CheckoutView>> {
  const { db, userId, gateway } = deps;
  if (!gateway) return fail('NOT_CONFIGURED', PAYMENTS_OFF);
  const limited = await rateLimit({ key: `pix:u:${userId}`, ...PIX_RATE }, db, deps.nowMs);
  if (!limited.ok) return limited;
  if (deps.ipHash) {
    const byIp = await rateLimit({ key: `pix:ip:${deps.ipHash}`, ...PIX_IP_RATE }, db, deps.nowMs);
    if (!byIp.ok) return byIp;
  }
  const parsed = checkoutInput.safeParse(input);
  if (!parsed.success) return fail('INVALID_INPUT', 'Plano inválido.');
  const { planId, period } = parsed.data;
  const amountCents = pixAmountCents(planId, period);
  if (amountCents === null) return fail('INVALID_INPUT', 'Plano inválido.');
  if (period === 'validation') {
    // Payments review M1: the offer exists only with VALIDATION_OFFER_CODE, and only for whoever has the link.
    const expected = deps.validationCode ?? null;
    if (!expected || !safeEqual(parsed.data.code ?? '', expected)) {
      return fail('FORBIDDEN', OFFER_OFF);
    }
    if (deps.ipHash) {
      const byIp = await rateLimit(
        { key: `pixval:ip:${deps.ipHash}`, ...VALIDATION_IP_RATE },
        db,
        deps.nowMs,
      );
      if (!byIp.ok) return byIp;
    }
  }
  const draft = {
    userId,
    planId,
    period,
    amountCents,
    devMode: gateway.keyMode === 'test',
    // Provisional; AbacatePay's own expiry replaces it. A margin covers the provider call.
    expiresAt: new Date((deps.nowMs ?? Date.now()) + (PIX_EXPIRES_IN_SECONDS + 120) * 1000),
  };
  let charge: ChargeRow;
  if (period === 'validation') {
    const reserved = await reserveCappedCharge(db, draft, VALIDATION_OFFER.maxSales);
    if (!reserved.ok) {
      return fail(
        'SOLD_OUT',
        reserved.reason === 'SOLD_OUT'
          ? 'Esta oferta já foi encerrada.'
          : 'Esta oferta vale uma vez por pessoa.',
      );
    }
    charge = reserved.charge;
  } else {
    charge = await insertCharge(db, draft);
  }
  const created = await gateway.createPix({
    amountCents,
    // AbacatePay refuses emoji and other characters in the description: plain ASCII only.
    description: `Refund - plano ${PLAN_NAME[planId]} (${PERIOD_NAME[period]})`
      .normalize('NFD')
      .replace(/[^\x20-\x7E]/g, ''),
    expiresInSeconds: PIX_EXPIRES_IN_SECONDS,
    externalId: charge.id,
    // Opaque ids only (payments review L8: no user id at the provider).
    metadata: { chargeId: charge.id, planId, period },
  });
  if (!created.ok) {
    await cancelCharge(db, charge.id);
    logger.warn('payments.create_failed', {
      code: created.error.code,
      detail: created.error.detail,
    });
    return fail('UNAVAILABLE', PIX_FAILED);
  }
  const pix = created.value;
  // The QR must charge exactly the catalog price, in the environment of our key.
  if (pix.amountCents !== amountCents || pix.devMode !== (gateway.keyMode === 'test')) {
    await cancelCharge(db, charge.id);
    logger.error('payments.create_mismatch', {
      amountOk: pix.amountCents === amountCents,
      devMode: pix.devMode,
      keyMode: gateway.keyMode,
    });
    return fail('UNAVAILABLE', PIX_FAILED);
  }
  await attachProviderCharge(db, charge.id, {
    providerChargeId: pix.id,
    brCode: pix.brCode,
    expiresAt: new Date(pix.expiresAt),
    devMode: pix.devMode,
  });
  logger.info('payments.charge_created', { planId, period, devMode: pix.devMode });
  return ok({
    chargeId: charge.id,
    brCode: pix.brCode,
    brCodeBase64: pix.brCodeBase64,
    expiresAt: pix.expiresAt,
    devMode: pix.devMode,
    amountCents,
  });
}

/**
 * The paid charge → the granted period, in one transaction (`settleCharge`). Shared by the webhook and by the
 * reconciliation of getCharge, so both land on the same rows; a second call is a no-op.
 */
export async function grantPaidCharge(
  db: Db,
  charge: Pick<ChargeRow, 'id' | 'period'>,
  paidAt: Date,
): Promise<'granted' | 'already'> {
  const period = charge.period as ChargePeriod;
  const days = PERIOD_DAYS[period];
  if (days === undefined) throw new Error(`grantPaidCharge: unknown period ${charge.period}`);
  const r = await settleCharge(db, { chargeId: charge.id, paidAt, days });
  if (r.settled) logger.info('payments.charge_paid', { period });
  return r.settled ? 'granted' : 'already';
}

export const chargeIdInput = z.object({ chargeId: z.uuid() });

export interface ChargeView {
  status: ChargeStatus;
  plan?: PlanId;
  expiresAt: string | null;
}

function view(row: ChargeRow): ChargeView {
  return {
    status: row.status,
    ...(row.status === 'paid' && isPlanId(row.planId) ? { plan: row.planId } : {}),
    expiresAt: row.expiresAt?.toISOString() ?? null,
  };
}

/**
 * Polling target (every 2 s, up to 15 min). After 20 s still pending, asks AbacatePay (`/transparents/check`) and
 * reconciles with the same transaction as the webhook: a late or lost webhook never leaves a paid user locked.
 */
export async function getChargeWith(
  input: unknown,
  deps: PaymentDeps,
): Promise<ActionResult<ChargeView>> {
  const { db, userId } = deps;
  const limited = await pollLimit(db, userId, deps.nowMs);
  if (!limited.ok) return limited;
  const parsed = chargeIdInput.safeParse(input);
  if (!parsed.success) return fail('INVALID_INPUT', NOT_FOUND);
  const row = await findOwnedCharge(db, userId, parsed.data.chargeId);
  if (!row) return fail('NOT_FOUND', NOT_FOUND);
  const now = deps.nowMs ?? Date.now();
  if (row.status !== 'pending' || now - row.createdAt.getTime() < RECONCILE_AFTER_MS) {
    return ok(view(row));
  }
  if (!deps.gateway || !row.providerChargeId) {
    if (row.expiresAt && row.expiresAt.getTime() < now) {
      await closePendingCharge(db, row.id, 'expired');
      return ok(view({ ...row, status: 'expired' }));
    }
    return ok(view(row));
  }
  const checked = await deps.gateway.checkPix(row.providerChargeId);
  if (!checked.ok) return ok(view(row));
  const s = checked.value.status;
  if (s === 'PAID') {
    await grantPaidCharge(db, row, new Date(now));
    logger.info('payments.reconciled', { period: row.period });
    const fresh = await findOwnedCharge(db, userId, row.id);
    return ok(view(fresh ?? row));
  }
  if (s === 'EXPIRED' || s === 'CANCELLED' || s === 'FAILED') {
    await closePendingCharge(db, row.id, s === 'EXPIRED' ? 'expired' : 'cancelled');
    return ok(view({ ...row, status: s === 'EXPIRED' ? 'expired' : 'cancelled' }));
  }
  return ok(view(row));
}

/** Test Mode only: AbacatePay marks the Pix paid and fires `transparent.completed` to our webhook. */
export async function simulateDevPaymentWith(
  input: unknown,
  deps: PaymentDeps,
): Promise<ActionResult<void>> {
  const { db, userId, gateway } = deps;
  if (!gateway) return fail('NOT_CONFIGURED', PAYMENTS_OFF);
  if (gateway.keyMode !== 'test') {
    return fail('FORBIDDEN', 'A simulação de pagamento só existe no modo de teste.');
  }
  const limited = await rateLimit({ key: `pixsim:u:${userId}`, ...SIMULATE_RATE }, db, deps.nowMs);
  if (!limited.ok) return limited;
  const parsed = chargeIdInput.safeParse(input);
  if (!parsed.success) return fail('INVALID_INPUT', NOT_FOUND);
  const row = await findOwnedCharge(db, userId, parsed.data.chargeId);
  if (!row?.providerChargeId) return fail('NOT_FOUND', NOT_FOUND);
  if (!row.devMode) {
    return fail('FORBIDDEN', 'A simulação de pagamento só existe no modo de teste.');
  }
  if (row.status !== 'pending') return ok(undefined);
  const r = await gateway.simulatePayment(row.providerChargeId);
  if (!r.ok) {
    logger.warn('payments.simulate_failed', { code: r.error.code, detail: r.error.detail });
    return fail('UNAVAILABLE', 'A simulação falhou. Tente de novo.');
  }
  return ok(undefined);
}
