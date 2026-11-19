import 'server-only';
import { activeSubscriptions, consumeUsage, type Db } from '@refund/db';
import { getDb } from './db.ts';
import { logger } from './log.ts';
import { type Entitlements, isPlanId, PLAN_TIER, PLANS, type PlanId } from './plans/catalog.ts';
import { type ActionResult, fail, ok } from './result.ts';

// ARCHITECTURE §8.2 (ADR-009): the active plan, the entitlement check and the atomic monthly count. The rule lives here
// and in the serialization (§8.3), never in the proxy or the UI.

export interface ActivePlan {
  plan: PlanId;
  until: Date | null;
  origin: 'subscription' | 'default';
}

/** 'active' subscription with ends_at > now(); more than one → the highest tier; none → 'free'. */
export async function activePlanWith(db: Db, userId: string): Promise<ActivePlan> {
  let best: ActivePlan = { plan: 'free', until: null, origin: 'default' };
  for (const s of await activeSubscriptions(db, userId)) {
    if (!isPlanId(s.planId)) continue;
    if (PLAN_TIER.indexOf(s.planId) > PLAN_TIER.indexOf(best.plan))
      best = { plan: s.planId, until: s.endsAt, origin: 'subscription' };
  }
  return best;
}

export async function entitlementsWith(
  db: Db,
  userId: string,
): Promise<{ plan: PlanId; ent: Entitlements }> {
  const { plan } = await activePlanWith(db, userId);
  return { plan, ent: PLANS[plan] };
}

/** PLAN_LIMIT with the upgrade hint when the plan's value fails the predicate. */
export async function requireEntitlementWith<K extends keyof Entitlements>(
  db: Db,
  userId: string,
  key: K,
  predicate: (v: Entitlements[K]) => boolean,
): Promise<ActionResult<void>> {
  const { ent } = await entitlementsWith(db, userId);
  if (predicate(ent[key])) return ok(undefined);
  return fail('PLAN_LIMIT', 'Este recurso faz parte de um plano pago.', {
    upgrade: { resource: String(key), suggestedPlan: 'business', url: '/app/plano' },
  });
}

export type QuotaResource = 'live_analyses_month' | 'ask_law';

const MONTH_BRT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
});

/** Quota month = current month in America/Sao_Paulo, as 'YYYY-MM'. */
export function quotaMonth(nowMs: number = Date.now()): string {
  const parts = MONTH_BRT.formatToParts(new Date(nowMs));
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  return `${year}-${month}`;
}

/** Core with the database passed in (tested on PGlite). */
export async function consumeQuotaWith(
  db: Db,
  userId: string,
  resource: QuotaResource,
  limit: number,
  n = 1,
  nowMs: number = Date.now(),
): Promise<ActionResult<{ remaining: number }>> {
  const quantity = await consumeUsage(db, { userId, month: quotaMonth(nowMs), resource, n, limit });
  if (quantity === null) {
    logger.info('limit.plan', { resource, limit });
    return fail('PLAN_LIMIT', 'Você chegou ao limite do seu plano neste mês.', {
      upgrade: { resource, suggestedPlan: 'business', url: '/app/plano' },
    });
  }
  return ok({ remaining: limit - quantity });
}

export async function consumeQuota(
  userId: string,
  resource: QuotaResource,
  limit: number,
  n = 1,
): Promise<ActionResult<{ remaining: number }>> {
  const handle = await getDb();
  if (!handle) {
    return fail('NOT_CONFIGURED', 'O modo ao vivo não está ativo neste deploy. Veja a demo.');
  }
  return consumeQuotaWith(handle.db, userId, resource, limit, n);
}
