// Daily cron reads and deletes (ARCHITECTURE §4.8 `GET /api/cron/diario`, §9.6 retention; SCHEMA §6 LGPD cleanup).
// Data access only: which plan keeps a connection and how Pluggy is called are decided by the caller.
import { and, eq, inArray, isNotNull, isNull, lt, notExists, sql } from 'drizzle-orm';
import type { Db } from '../client.ts';
import {
  analyses,
  companies,
  companyLinks,
  connections,
  consents,
  subscriptions,
  users,
} from '../schema/index.ts';
import type { ConnectionRow } from './connections.ts';

const olderThan = (days: number) => sql`now() - make_interval(days => ${days})`;

/** Anonymous users with no access for `days` days (deleted only after their Pluggy items are gone). */
export async function inactiveAnonymousUserIds(db: Db, days: number): Promise<string[]> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.anonymous, true), lt(users.lastAccessAt, olderThan(days))));
  return rows.map((r) => r.id);
}

/** Connections that still hold a Pluggy item id (to delete at Pluggy before the row goes). */
export async function connectionsWithItem(
  db: Db,
  userIds: readonly string[],
): Promise<ConnectionRow[]> {
  if (userIds.length === 0) return [];
  return db
    .select()
    .from(connections)
    .where(and(inArray(connections.userId, [...userIds]), isNotNull(connections.itemIdEncrypted)));
}

/** Revoked rows whose Pluggy item could not be deleted yet (`REVOKE_PENDING`, EXECUTION §9 E11 M2). */
export async function revokePendingConnections(db: Db, marker: string): Promise<ConnectionRow[]> {
  return db
    .select()
    .from(connections)
    .where(and(eq(connections.errorCode, marker), isNotNull(connections.itemIdEncrypted)));
}

/** The item is gone at Pluggy: forget its id and the marker. */
export async function clearRevokedItem(db: Db, connectionId: string): Promise<void> {
  await db
    .update(connections)
    .set({ itemIdEncrypted: null, errorCode: null })
    .where(eq(connections.id, connectionId));
}

/** Connections in force created more than `days` ago (snapshot TTL candidates; the caller checks the plan). */
export async function connectionsOlderThan(db: Db, days: number): Promise<ConnectionRow[]> {
  return db
    .select()
    .from(connections)
    .where(and(isNull(connections.revokedAt), lt(connections.createdAt, olderThan(days))));
}

/** Consents in force granted more than `days` ago. */
export async function consentsOlderThan(
  db: Db,
  days: number,
): Promise<{ id: string; userId: string }[]> {
  return db
    .select({ id: consents.id, userId: consents.userId })
    .from(consents)
    .where(and(isNull(consents.revokedAt), lt(consents.grantedAt, olderThan(days))));
}

export async function withdrawConsent(db: Db, consentId: string): Promise<void> {
  await db
    .update(consents)
    .set({ revokedAt: sql`now()` })
    .where(and(eq(consents.id, consentId), isNull(consents.revokedAt)));
}

/**
 * Public company rows nobody uses any more (EXECUTION §9, E11 C7): no link, no connection, no analysis, untouched
 * for `days` days. Returns how many were deleted.
 */
export async function deleteOrphanCompanies(db: Db, days: number): Promise<number> {
  const rows = await db
    .delete(companies)
    .where(
      and(
        lt(companies.updatedAt, olderThan(days)),
        notExists(
          db
            .select({ x: sql`1` })
            .from(companyLinks)
            .where(eq(companyLinks.companyId, companies.id)),
        ),
        notExists(
          db.select({ x: sql`1` }).from(connections).where(eq(connections.companyId, companies.id)),
        ),
        notExists(
          db.select({ x: sql`1` }).from(analyses).where(eq(analyses.companyId, companies.id)),
        ),
      ),
    )
    .returning({ id: companies.id });
  return rows.length;
}

/** §8.4: an active subscription past its end becomes `expired` (activePlan already ignores it). */
export async function expireSubscriptions(db: Db): Promise<number> {
  const rows = await db
    .update(subscriptions)
    .set({ status: 'expired' })
    .where(and(eq(subscriptions.status, 'active'), lt(subscriptions.endsAt, sql`now()`)))
    .returning({ id: subscriptions.id });
  return rows.length;
}
