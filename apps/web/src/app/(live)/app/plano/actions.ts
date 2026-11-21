'use server';

import { runLive } from '@/server/action.ts';
import { hmac } from '@/server/crypto.ts';
import {
  type ChargeView,
  type CheckoutView,
  getChargeWith,
  simulateDevPaymentWith,
  startPixCheckoutWith,
} from '@/server/payments/checkout.ts';
import { paymentsConfig } from '@/server/payments/gateway.ts';
import { clientIp } from '@/server/rate-limit.ts';
import type { ActionResult } from '@/server/result.ts';

// ARCHITECTURE §4.7 "plans and Pix (live, P1)": getSession → requireCapability (database in runLive, payments = the
// gateway) → rateLimit → zod inside each core. Results only; the price comes from the catalog, never from here.

export async function startPixCheckout(input: {
  planId: 'personal' | 'mei' | 'business';
  period: 'monthly' | 'yearly' | 'validation';
  code?: string;
}): Promise<ActionResult<CheckoutView>> {
  return runLive('startPixCheckout', (ctx) => {
    const config = paymentsConfig();
    return startPixCheckoutWith(input, {
      db: ctx.db,
      userId: ctx.userId,
      gateway: config?.gateway ?? null,
      validationCode: config?.validationCode ?? null,
      // D58: with the `login` capability, an anonymous session signs in before paying.
      requireLogin: ctx.caps.login,
      anonymous: !ctx.isLoggedIn,
      // The IP only as an HMAC (ARCHITECTURE §9.4).
      ipHash: hmac(clientIp(ctx.headers), ctx.secrets.pepper),
    });
  });
}

export async function getCharge(input: { chargeId: string }): Promise<ActionResult<ChargeView>> {
  // §2.5 "'paid' → plan unlocked (updateTag)": no /app read is cached (every page reads the plan per request), so
  // the client's router.refresh() is enough; no cache tag exists to expire.
  return runLive('getCharge', (ctx) =>
    getChargeWith(input, {
      db: ctx.db,
      userId: ctx.userId,
      gateway: paymentsConfig()?.gateway ?? null,
    }),
  );
}

export async function simulateDevPayment(input: { chargeId: string }): Promise<ActionResult<void>> {
  return runLive('simulateDevPayment', (ctx) =>
    simulateDevPaymentWith(input, {
      db: ctx.db,
      userId: ctx.userId,
      gateway: paymentsConfig()?.gateway ?? null,
    }),
  );
}
