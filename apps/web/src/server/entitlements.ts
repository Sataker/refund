import 'server-only';
import { activeSubscriptions, consumeUsage, countLiveResource, type Db } from '@refund/db';
import { getDb } from './db.ts';
import { logger } from './log.ts';
import {
  type Entitlements,
  isPlanId,
  PLAN_TIER,
  PLANS,
  type PlanId,
  VALIDATION_OFFER,
} from './plans/catalog.ts';
import { type ActionResult, fail, ok } from './result.ts';

// ARCHITECTURE §8.2 (ADR-009): the active plan, the entitlement check and the atomic monthly count. The rule lives here
// and in the serialization (§8.3), never in the proxy or the UI.

export interface ActivePlan {
  plan: PlanId;
  until: Date | null;
  origin: 'subscription' | 'validation_offer' | 'default';
}

/** 'active' subscription with ends_at > now(); more than one → the highest tier; none → 'free'. */
export async function activePlanWith(db: Db, userId: string): Promise<ActivePlan> {
  let best: ActivePlan = { plan: 'free', until: null, origin: 'default' };
  for (const s of await activeSubscriptions(db, userId)) {
    if (!isPlanId(s.planId)) continue;
    if (PLAN_TIER.indexOf(s.planId) > PLAN_TIER.indexOf(best.plan))
      best = {
        plan: s.planId,
        until: s.endsAt,
        origin: s.chargePeriod === 'validation' ? 'validation_offer' : 'subscription',
      };
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
  resource: string = String(key),
): Promise<ActionResult<void>> {
  const { ent } = await entitlementsWith(db, userId);
  if (predicate(ent[key])) return ok(undefined);
  logger.info('limit.plan', { resource });
  return fail('PLAN_LIMIT', 'Este recurso faz parte de um plano pago.', {
    upgrade: { resource, suggestedPlan: SUGGESTED_PLAN, url: '/app/plano' },
  });
}

/** `upgrade.suggestedPlan` for a PLAN_LIMIT (§4.7): Empresa, the plan the "moment to pay" sells (07 §3.6). */
const SUGGESTED_PLAN: PlanId = VALIDATION_OFFER.plan;

export type LiveResource = 'cnpjs' | 'connections_pf' | 'connections_pj';

/** §8.2 live counts (company links; non-revoked connections per holder). */
export async function countLiveWith(
  db: Db,
  userId: string,
  resource: LiveResource,
): Promise<number> {
  return countLiveResource(db, userId, resource);
}

const LIVE_LIMIT: Record<LiveResource, 'maxCnpjs' | 'maxConnectionsPf' | 'maxConnectionsPj'> = {
  cnpjs: 'maxCnpjs',
  connections_pf: 'maxConnectionsPf',
  connections_pj: 'maxConnectionsPj',
};

/**
 * One more `resource` fits the plan (`countLive + adding ≤ limit`)? PLAN_LIMIT with the upgrade hint otherwise.
 * `adding` is 0 when the action replaces an existing link instead of adding one.
 */
export async function requireLiveRoomWith(
  db: Db,
  userId: string,
  resource: LiveResource,
  adding = 1,
): Promise<ActionResult<void>> {
  const key = LIVE_LIMIT[resource];
  const used = adding > 0 ? await countLiveWith(db, userId, resource) : 0;
  return requireEntitlementWith(db, userId, key, (limit) => used + adding <= limit, resource);
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
      upgrade: { resource, suggestedPlan: SUGGESTED_PLAN, url: '/app/plano' },
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
