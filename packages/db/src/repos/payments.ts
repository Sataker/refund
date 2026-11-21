// Charges and granted periods (SCHEMA §2.8; ARCHITECTURE §2.5, §4.9, §8.4). Which plan, which price and how many days
// a period lasts are business rules and stay in `apps/web/src/server/plans`; this file only reads and writes rows.
import { and, count, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import type { Db } from '../client.ts';
import { charges, companyLinks, connections, subscriptions, users } from '../schema/index.ts';

export type ChargeStatus = (typeof charges.status.enumValues)[number];
export type ChargeRow = typeof charges.$inferSelect;

export interface ChargeInsert {
  userId: string;
  planId: string;
  period: string;
  amountCents: number;
  devMode: boolean;
  /**
   * Provisional expiry, set at insert (code review E17, M4): a row whose provider call never came back still ages
   * out of the sales ceiling. Replaced by AbacatePay's own `expiresAt` once attached.
   */
  expiresAt: Date;
}

/** Step 1 of §2.5: the row exists before AbacatePay is called (its id is the `externalId`). */
export async function insertCharge(db: Db, input: ChargeInsert): Promise<ChargeRow> {
  const [row] = await db
    .insert(charges)
    .values({ ...input, status: 'pending' })
    .returning();
  if (!row) throw new Error('insertCharge: no row returned');
  return row;
}

export type ReserveOutcome =
  | { ok: true; charge: ChargeRow }
  | { ok: false; reason: 'SOLD_OUT' | 'ALREADY_TAKEN' };

/**
 * A charge of a period with a global ceiling (the validation offer): count and insert under one transaction-scoped
 * advisory lock, so two requests at the last slot cannot both pass; at most one such charge (pending or paid) per
 * user, so nobody can hold every slot.
 */
export async function reserveCappedCharge(
  db: Db,
  input: ChargeInsert,
  maxSales: number,
): Promise<ReserveOutcome> {
  return db.transaction(async (txRaw) => {
    const tx = txRaw as unknown as Db;
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`refund.charges:${input.period}`}))`,
    );
    const [mine] = await tx
      .select({ n: count() })
      .from(charges)
      .where(and(eq(charges.userId, input.userId), eq(charges.period, input.period), sellable()));
    if ((mine?.n ?? 0) > 0) return { ok: false, reason: 'ALREADY_TAKEN' } as const;
    if ((await countPeriodSales(tx, input.period)) >= maxSales) {
      return { ok: false, reason: 'SOLD_OUT' } as const;
    }
    return { ok: true, charge: await insertCharge(tx, input) } as const;
  });
}

/** Paid, or pending with a QR that may still be paid. */
function sellable() {
  return sql`(${charges.status} = 'paid' OR (${charges.status} = 'pending' AND ${charges.expiresAt} > now()))`;
}

export async function findChargeById(db: Db, id: string): Promise<ChargeRow | null> {
  const [row] = await db.select().from(charges).where(eq(charges.id, id)).limit(1);
  return row ?? null;
}

/** Step 2 of §2.5: what AbacatePay answered. */
export async function attachProviderCharge(
  db: Db,
  id: string,
  input: { providerChargeId: string; brCode: string; expiresAt: Date; devMode: boolean },
): Promise<void> {
  await db.update(charges).set(input).where(eq(charges.id, id));
}

/** The provider refused the charge: it never existed for the payer. */
export async function cancelCharge(db: Db, id: string): Promise<void> {
  await db
    .update(charges)
    .set({ status: 'cancelled' })
    .where(and(eq(charges.id, id), eq(charges.status, 'pending')));
}

export async function findOwnedCharge(
  db: Db,
  userId: string,
  id: string,
): Promise<ChargeRow | null> {
  const [row] = await db
    .select()
    .from(charges)
    .where(and(eq(charges.id, id), eq(charges.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function findChargeByProviderId(
  db: Db,
  providerChargeId: string,
  provider = 'abacatepay',
): Promise<ChargeRow | null> {
  const [row] = await db
    .select()
    .from(charges)
    .where(and(eq(charges.provider, provider), eq(charges.providerChargeId, providerChargeId)))
    .limit(1);
  return row ?? null;
}

/**
 * Charges of a period that count against a sales ceiling: the paid ones plus the pending ones whose QR has not
 * expired yet (each may still be paid). Used for the 5 sales of the validation offer.
 */
export async function countPeriodSales(db: Db, period: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(charges)
    .where(and(eq(charges.period, period), sellable()));
  return row?.n ?? 0;
}

/** A pending charge that the provider says is over (expired QR, cancelled). */
export async function closePendingCharge(
  db: Db,
  id: string,
  status: Extract<ChargeStatus, 'expired' | 'cancelled'>,
): Promise<boolean> {
  const rows = await db
    .update(charges)
    .set({ status })
    .where(and(eq(charges.id, id), eq(charges.status, 'pending')))
    .returning({ id: charges.id });
  return rows.length > 0;
}

export interface SettleInput {
  chargeId: string;
  paidAt: Date;
  /** Length of the granted period, decided by the caller from the plan catalog. */
  days: number;
}

export type SettleOutcome =
  | { settled: true; subscriptionId: string; endsAt: Date; userId: string; planId: string }
  | { settled: false; reason: 'NOT_PENDING' };

const DAY_MS = 86_400_000;

/**
 * The single transaction of §2.5 and §4.9: the charge goes `pending → paid` (the `WHERE status = 'pending'` makes a
 * second delivery a no-op) and the period is granted (`subscriptions_charge_uk`: one charge, one period). A period of
 * the same plan still running is extended rather than overlapped: paying again before the end adds days.
 */
export async function settleCharge(db: Db, input: SettleInput): Promise<SettleOutcome> {
  return db.transaction(async (tx) => {
    // One settlement per user at a time (code review E17, L8): two periods of the same plan chain, never overlap.
    await tx.execute(
      sql`SELECT 1 FROM ${users} WHERE ${users.id} = (SELECT ${charges.userId} FROM ${charges} WHERE ${charges.id} = ${input.chargeId}) FOR UPDATE`,
    );
    const [paid] = await tx
      .update(charges)
      .set({ status: 'paid', paidAt: input.paidAt })
      .where(and(eq(charges.id, input.chargeId), eq(charges.status, 'pending')))
      .returning();
    if (!paid) return { settled: false, reason: 'NOT_PENDING' } as const;
    const [running] = await tx
      .select({ endsAt: subscriptions.endsAt })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.userId, paid.userId),
          eq(subscriptions.planId, paid.planId),
          eq(subscriptions.status, 'active'),
          gt(subscriptions.endsAt, input.paidAt),
        ),
      )
      .orderBy(desc(subscriptions.endsAt))
      .limit(1);
    const startsAt = running ? running.endsAt : input.paidAt;
    const endsAt = new Date(startsAt.getTime() + input.days * DAY_MS);
    const [sub] = await tx
      .insert(subscriptions)
      .values({
        userId: paid.userId,
        planId: paid.planId,
        status: 'active',
        origin: 'one_time_pix',
        chargeId: paid.id,
        startsAt,
        endsAt,
      })
      .returning({ id: subscriptions.id });
    if (!sub) throw new Error('settleCharge: no subscription returned');
    return {
      settled: true,
      subscriptionId: sub.id,
      endsAt,
      userId: paid.userId,
      planId: paid.planId,
    } as const;
  });
}

/**
 * Refund or lost dispute: the charge leaves `pending` or `paid` for `refunded` and its period is cancelled. A refund
 * that arrives before the completion (events come in any order) makes the late completion a no-op, since
 * `settleCharge` only settles a pending charge.
 */
export async function refundCharge(db: Db, chargeId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(charges)
      .set({ status: 'refunded' })
      .where(and(eq(charges.id, chargeId), inArray(charges.status, ['pending', 'paid'])))
      .returning({ id: charges.id });
    if (rows.length === 0) return false;
    await tx
      .update(subscriptions)
      .set({ status: 'cancelled' })
      .where(eq(subscriptions.chargeId, chargeId));
    return true;
  });
}

/**
 * §8.2 live counts: linked companies, and ACTIVE connections per holder (a stuck `syncing` row is retired by the
 * connect flow and must not block the sample-data fallback). A PJ connection counts only for a company the user
 * still has linked (code review E17, H1).
 */
export async function countLiveResource(
  db: Db,
  userId: string,
  resource: 'cnpjs' | 'connections_pf' | 'connections_pj',
): Promise<number> {
  if (resource === 'cnpjs') {
    const [row] = await db
      .select({ n: count() })
      .from(companyLinks)
      .where(eq(companyLinks.userId, userId));
    return row?.n ?? 0;
  }
  const pj = resource === 'connections_pj';
  const [row] = await db
    .select({ n: count() })
    .from(connections)
    .where(
      and(
        eq(connections.userId, userId),
        eq(connections.holder, pj ? 'PJ' : 'PF'),
        isNull(connections.revokedAt),
        eq(connections.status, 'active'),
        pj
          ? sql`${connections.companyId} IN (SELECT ${companyLinks.companyId} FROM ${companyLinks} WHERE ${companyLinks.userId} = ${userId})`
          : undefined,
      ),
    );
  return row?.n ?? 0;
}
