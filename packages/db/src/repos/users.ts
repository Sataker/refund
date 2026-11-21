// Users aggregate (SCHEMA §2.2, §6 LGPD cleanup). No business rule: only access.
import { and, eq, inArray, lt, notExists, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Db } from '../client.ts';
import {
  analyses,
  auditEvents,
  charges,
  companyLinks,
  connections,
  consents,
  monthlyUsage,
  organizationMembers,
  subscriptions,
  userAssumptions,
  users,
} from '../schema/index.ts';

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

/** LGPD cleanup: anonymous users with no access for `days` days and no paid charge. Returns how many. */
export async function deleteInactiveAnonymousUsers(db: Db, days: number): Promise<number> {
  const rows = await db
    .delete(users)
    .where(
      and(
        eq(users.anonymous, true),
        lt(users.lastAccessAt, sql`now() - make_interval(days => ${days})`),
        // Never a user who paid (same guard as cleanup.inactiveAnonymousUsers, D58).
        notExists(
          db
            .select({ x: sql`1` })
            .from(charges)
            .where(and(eq(charges.userId, users.id), eq(charges.status, 'paid'))),
        ),
      ),
    )
    .returning({ id: users.id });
  return rows.length;
}

/**
 * What a WorkOS sign-in attaches to a user (ARCHITECTURE §9.2). The e-mail arrives hashed and encrypted, never plain.
 * No name: `display_name` stays null (real-name PII we do not need; security review D58, item 10).
 */
export interface IdentityInput {
  workosUserId: string;
  /** Absent: the row keeps the e-mail it has (an unverified e-mail, or one another account already holds). */
  email?: { hash: string; encrypted: string };
}

/** The session user becomes a real account in place: same id, so its analyses, charges and links stay attached. */
export async function linkIdentity(
  db: Db,
  userId: string,
  identity: IdentityInput,
): Promise<UserRow | null> {
  const [row] = await db
    .update(users)
    .set({
      workosUserId: identity.workosUserId,
      ...(identity.email
        ? { emailHash: identity.email.hash, emailEncrypted: identity.email.encrypted }
        : {}),
      anonymous: false,
      lastAccessAt: sql`now()`,
    })
    .where(eq(users.id, userId))
    .returning();
  return row ?? null;
}

/** The account bound to this WorkOS user id (the only match that proves identity on its own). */
export async function findUserByWorkosId(db: Db, workosUserId: string): Promise<UserRow | null> {
  const [row] = await db.select().from(users).where(eq(users.workosUserId, workosUserId)).limit(1);
  return row ?? null;
}

/** The account holding this e-mail hash. The caller trusts it only for an e-mail WorkOS has verified. */
export async function findUserByEmailHash(db: Db, emailHash: string): Promise<UserRow | null> {
  const [row] = await db.select().from(users).where(eq(users.emailHash, emailHash)).limit(1);
  return row ?? null;
}

/**
 * The cron's deletion of one abandoned user, re-checked in the DELETE itself (security review D58, item 6): still
 * anonymous, still inactive for `days` days, and no paid charge. A user who signed in or paid since the select is kept.
 */
export async function deleteAbandonedUser(db: Db, userId: string, days: number): Promise<boolean> {
  const rows = await db
    .delete(users)
    .where(
      and(
        eq(users.id, userId),
        eq(users.anonymous, true),
        lt(users.lastAccessAt, sql`now() - make_interval(days => ${days})`),
        notExists(
          db
            .select({ x: sql`1` })
            .from(charges)
            .where(and(eq(charges.userId, users.id), eq(charges.status, 'paid'))),
        ),
      ),
    )
    .returning({ id: users.id });
  return rows.length > 0;
}

/**
 * Moves everything personal of `fromId` to `toId` and deletes `fromId`, in one transaction (ARCHITECTURE §9.2:
 * a returning user signs in on a new device). Rows keyed by the user (links, assumptions, memberships) keep the
 * target's copy on conflict; monthly usage is summed. Funnel and audit rows follow the user. Returns false when
 * either user is missing or both are the same.
 */
export async function mergeUsers(db: Db, fromId: string, toId: string): Promise<boolean> {
  if (fromId === toId) return false;
  return db.transaction(async (tx) => {
    // Same lock order as settleCharge (the users row): a payment settling for either side waits for the merge.
    const locked = await tx
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.id, [fromId, toId]))
      .orderBy(users.id)
      .for('update');
    if (locked.length !== 2) return false;

    const dupLink = alias(companyLinks, 'dup_link');
    await tx
      .update(companyLinks)
      .set({ userId: toId })
      .where(
        and(
          eq(companyLinks.userId, fromId),
          notExists(
            tx
              .select({ x: sql`1` })
              .from(dupLink)
              .where(and(eq(dupLink.userId, toId), eq(dupLink.companyId, companyLinks.companyId))),
          ),
        ),
      );
    const dupAssumption = alias(userAssumptions, 'dup_assumption');
    await tx
      .update(userAssumptions)
      .set({ userId: toId })
      .where(
        and(
          eq(userAssumptions.userId, fromId),
          notExists(
            tx
              .select({ x: sql`1` })
              .from(dupAssumption)
              .where(
                and(
                  eq(dupAssumption.userId, toId),
                  eq(dupAssumption.companyId, userAssumptions.companyId),
                  eq(dupAssumption.key, userAssumptions.key),
                ),
              ),
          ),
        ),
      );
    const dupMember = alias(organizationMembers, 'dup_member');
    await tx
      .update(organizationMembers)
      .set({ userId: toId })
      .where(
        and(
          eq(organizationMembers.userId, fromId),
          notExists(
            tx
              .select({ x: sql`1` })
              .from(dupMember)
              .where(
                and(
                  eq(dupMember.userId, toId),
                  eq(dupMember.organizationId, organizationMembers.organizationId),
                ),
              ),
          ),
        ),
      );

    const usage = await tx.select().from(monthlyUsage).where(eq(monthlyUsage.userId, fromId));
    if (usage.length > 0) {
      await tx
        .insert(monthlyUsage)
        .values(
          usage.map((u) => ({
            userId: toId,
            month: u.month,
            resource: u.resource,
            quantity: u.quantity,
          })),
        )
        .onConflictDoUpdate({
          target: [monthlyUsage.userId, monthlyUsage.month, monthlyUsage.resource],
          set: {
            quantity: sql`${monthlyUsage.quantity} + excluded.quantity`,
            updatedAt: sql`now()`,
          },
        });
    }

    await tx.update(consents).set({ userId: toId }).where(eq(consents.userId, fromId));
    await tx.update(connections).set({ userId: toId }).where(eq(connections.userId, fromId));
    await tx.update(analyses).set({ userId: toId }).where(eq(analyses.userId, fromId));
    await tx.update(charges).set({ userId: toId }).where(eq(charges.userId, fromId));
    await tx.update(subscriptions).set({ userId: toId }).where(eq(subscriptions.userId, fromId));
    await tx
      .update(auditEvents)
      .set({ actorUserId: toId })
      .where(eq(auditEvents.actorUserId, fromId));
    await tx.update(users).set({ lastAccessAt: sql`now()` }).where(eq(users.id, toId));
    // What is left on `fromId` (the duplicate links, assumptions and usage rows) goes with it in cascade.
    await tx.delete(users).where(eq(users.id, fromId));
    return true;
  });
}
