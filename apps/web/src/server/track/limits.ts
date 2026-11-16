import 'server-only';
import type { Db } from '@refund/db';
import { rateLimit } from '../rate-limit.ts';
import type { ActionResult } from '../result.ts';

// Per-session limits for the track (ARCHITECTURE §9.4; code review E11, M3). A person finishes the
// track in ~15 actions; 120 per hour leaves room for corrections and stops a script. The status
// polling (every 2 s while the bank syncs) has its own, larger budget.

export const TRACK_RATE = { limit: 120, windowMs: 60 * 60_000 } as const;
export const POLL_RATE = { limit: 900, windowMs: 60 * 60_000 } as const;

export function trackLimit(db: Db, userId: string, nowMs?: number): Promise<ActionResult<void>> {
  return rateLimit({ key: `track:u:${userId}`, ...TRACK_RATE }, db, nowMs);
}

export function pollLimit(db: Db, userId: string, nowMs?: number): Promise<ActionResult<void>> {
  return rateLimit({ key: `poll:u:${userId}`, ...POLL_RATE }, db, nowMs);
}
