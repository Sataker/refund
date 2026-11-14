// Fixed-window rate limit in Postgres (ARCHITECTURE §9.4).
import { lt, sql } from 'drizzle-orm';
import type { Db } from '../client.ts';
import { rateLimits } from '../schema/index.ts';

/** Increments the counter of (key, window) and returns the count after this hit. */
export async function hitRateLimit(db: Db, key: string, windowStart: Date): Promise<number> {
  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.key, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count });
  if (!row) throw new Error('hitRateLimit: no row returned');
  return row.count;
}

/** Technical cleanup (cron): windows older than `before`. */
export async function deleteRateLimitsBefore(db: Db, before: Date): Promise<number> {
  const rows = await db
    .delete(rateLimits)
    .where(lt(rateLimits.windowStart, before))
    .returning({ key: rateLimits.key });
  return rows.length;
}
