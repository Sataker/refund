import 'server-only';
import { consumeUsage, type Db } from '@refund/db';
import { getDb } from './db.ts';
import { logger } from './log.ts';
import { type ActionResult, fail, ok } from './result.ts';

// ARCHITECTURE §8.2 (ADR-009). E4 delivers only the atomic monthly count; activePlan,
// requireEntitlement and countLive arrive with the plan catalog in E14.

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
