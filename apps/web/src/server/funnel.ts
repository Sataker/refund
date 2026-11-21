import 'server-only';
import { type Db, insertAuditEvent } from '@refund/db';
import { z } from 'zod';
import { logger } from './log.ts';
import { rateLimit } from './rate-limit.ts';
import { type ActionResult, fail, ok } from './result.ts';

// D58 conversion funnel: server-side rows in `audit_events` (actor 'user', target 'funnel'), so no migration and no
// third-party analytics. Ids only: the data holds the plan, the period and where the offer was clicked, never PII.

export const FUNNEL_ACTIONS = [
  'funnel.estimate_seen',
  'funnel.offer_clicked',
  'funnel.login_completed',
  'funnel.checkout_started',
  'funnel.paid',
] as const;
export type FunnelAction = (typeof FUNNEL_ACTIONS)[number];

/** Where an offer can be clicked (the UI mount points of the ROI card). */
export const FUNNEL_WHERE = ['estimativa', 'analise', 'painel', 'achado', 'plano'] as const;
export type FunnelWhere = (typeof FUNNEL_WHERE)[number];

/** The only fields a funnel row may carry. */
export interface FunnelData {
  plan?: string;
  period?: string;
  where?: FunnelWhere;
  /** login_completed: the session was merged into an account that already existed. */
  merged?: boolean;
}

/**
 * Best effort: a funnel row never fails the action that records it. It runs in its own savepoint, so a failed insert
 * inside the caller's transaction (the webhook's `grantPaidCharge`) does not abort that transaction.
 */
export async function recordFunnelWith(
  db: Db,
  userId: string,
  action: FunnelAction,
  data: FunnelData = {},
): Promise<void> {
  const clean: FunnelData = {
    ...(data.plan !== undefined ? { plan: data.plan } : {}),
    ...(data.period !== undefined ? { period: data.period } : {}),
    ...(data.where !== undefined ? { where: data.where } : {}),
    ...(data.merged !== undefined ? { merged: data.merged } : {}),
  };
  try {
    await db.transaction((tx) =>
      insertAuditEvent(tx, {
        actorType: 'user',
        actorUserId: userId,
        action,
        targetType: 'funnel',
        data: clean,
      }),
    );
  } catch (err) {
    logger.warn('funnel.record_failed', { action, error: err });
  }
}

export const offerClickedInput = z.object({ where: z.enum(FUNNEL_WHERE) });

/** A click is cheap to spam: 30 per hour per session is far above any real use. */
export const OFFER_CLICK_RATE = { limit: 30, windowMs: 60 * 60_000 } as const;

export async function offerClickedWith(
  input: unknown,
  deps: { db: Db; userId: string; nowMs?: number },
): Promise<ActionResult<void>> {
  const limited = await rateLimit(
    { key: `funnel:u:${deps.userId}`, ...OFFER_CLICK_RATE },
    deps.db,
    deps.nowMs,
  );
  if (!limited.ok) return limited;
  const parsed = offerClickedInput.safeParse(input);
  if (!parsed.success) return fail('INVALID_INPUT', 'Origem inválida.');
  await recordFunnelWith(deps.db, deps.userId, 'funnel.offer_clicked', {
    where: parsed.data.where,
  });
  return ok(undefined);
}
