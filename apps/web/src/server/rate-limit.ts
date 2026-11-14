import 'server-only';
import { type Db, hitRateLimit } from '@refund/db';
import { ipAddress } from '@vercel/functions';
import { hmac, sha256Hex } from './crypto.ts';
import { logger } from './log.ts';
import { type ActionResult, fail, ok } from './result.ts';

// ARCHITECTURE §9.4: fixed window. Postgres (`rate_limits`) for the live actions; per-instance memory
// for /api/demo and the deep health. The IP is only ever kept as an HMAC (or a hash, in memory).

export interface RateRule {
  /** e.g. 'cnpj:u:<id>', 'waitlist:ip:<hmac>'. */
  key: string;
  limit: number;
  windowMs: number;
}

const LIMITED = 'Muitas tentativas em pouco tempo. Espere alguns minutos e tente de novo.';

export function windowStart(nowMs: number, windowMs: number): Date {
  return new Date(Math.floor(nowMs / windowMs) * windowMs);
}

/** Postgres window. An infrastructure error lets the request through (logged): availability first. */
export async function rateLimit(
  rule: RateRule,
  db: Db,
  nowMs: number = Date.now(),
): Promise<ActionResult<void>> {
  try {
    const count = await hitRateLimit(db, rule.key, windowStart(nowMs, rule.windowMs));
    if (count <= rule.limit) return ok(undefined);
  } catch (err) {
    logger.warn('limit.rate', { store: 'postgres', failOpen: true, error: err });
    return ok(undefined);
  }
  logger.info('limit.rate', { prefix: rule.key.split(':')[0], limit: rule.limit });
  return fail('RATE_LIMITED', LIMITED, { detail: { retryAfterMs: rule.windowMs } });
}

const MAX_KEYS = 5000;
const memory = new Map<string, { start: number; count: number }>();

/** In-memory window (per instance), insertion-ordered map trimmed as an LRU. */
export function memoryRateLimit(rule: RateRule, nowMs: number = Date.now()): boolean {
  const start = windowStart(nowMs, rule.windowMs).getTime();
  const current = memory.get(rule.key);
  const count = current && current.start === start ? current.count + 1 : 1;
  memory.delete(rule.key);
  memory.set(rule.key, { start, count });
  if (memory.size > MAX_KEYS) {
    const oldest = memory.keys().next().value;
    if (oldest !== undefined) memory.delete(oldest);
  }
  return count <= rule.limit;
}

/** Client IP: Vercel's header first, then the 1st `x-forwarded-for` value. */
export function clientIp(headers: Headers): string {
  return ipAddress(headers) ?? headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

/** `<prefix>:ip:<hmac>`. Without a pepper (memory-only limiters) a plain hash is enough. */
export function ipKey(prefix: string, headers: Headers, pepper?: Buffer): string {
  const ip = clientIp(headers);
  const digest = pepper ? hmac(ip, pepper) : sha256Hex(ip).slice(0, 43);
  return `${prefix}:ip:${digest}`;
}
