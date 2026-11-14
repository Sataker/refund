// Users aggregate (SCHEMA §2.2, §6 LGPD cleanup). No business rule: only access.
import { and, eq, lt, sql } from 'drizzle-orm';
import type { Db } from '../client.ts';
import { users } from '../schema/index.ts';

export type UserRow = typeof users.$inferSelect;

/**
 * Lazily materializes the anonymous user behind a signed `rf_sid` (ARCHITECTURE §9.2): the proxy
 * mints the id, the first server action creates the row. Idempotent; refreshes `last_access_at`.
 */
export async function ensureAnonymousUser(db: Db, userId: string): Promise<UserRow> {
  const [row] = await db
    .insert(users)
    .values({ id: userId, anonymous: true })
    .onConflictDoUpdate({ target: users.id, set: { lastAccessAt: sql`now()` } })
    .returning();
  if (!row) throw new Error('ensureAnonymousUser: no row returned');
  return row;
}

export async function findUser(db: Db, userId: string): Promise<UserRow | null> {
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return row ?? null;
}

/** "Delete my data": ON DELETE CASCADE from users removes everything personal (SCHEMA §1.8). */
export async function deleteUser(db: Db, userId: string): Promise<boolean> {
  const rows = await db.delete(users).where(eq(users.id, userId)).returning({ id: users.id });
  return rows.length > 0;
}

/** LGPD cleanup (cron): anonymous users with no access for `days` days. Returns how many. */
export async function deleteInactiveAnonymousUsers(db: Db, days: number): Promise<number> {
  const rows = await db
    .delete(users)
    .where(
      and(
        eq(users.anonymous, true),
        lt(users.lastAccessAt, sql`now() - make_interval(days => ${days})`),
      ),
    )
    .returning({ id: users.id });
  return rows.length;
}
