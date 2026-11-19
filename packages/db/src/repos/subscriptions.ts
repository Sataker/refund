// Active subscriptions (SCHEMA §6 "Active plan"). Choosing the highest tier is business logic and
// stays in `server/entitlements.ts`; this only lists what is active now.
import { and, desc, eq, gt, sql } from 'drizzle-orm';
import type { Db } from '../client.ts';
import { charges, subscriptions } from '../schema/index.ts';

export interface ActiveSubscription {
  planId: string;
  endsAt: Date;
  /** The period of the charge that granted it ('monthly' | 'yearly' | 'validation'); null without a charge. */
  chargePeriod: string | null;
  /** The granting charge was a Test Mode one; null without a charge. */
  chargeDevMode: boolean | null;
}

export async function activeSubscriptions(db: Db, userId: string): Promise<ActiveSubscription[]> {
  return db
    .select({
      planId: subscriptions.planId,
      endsAt: subscriptions.endsAt,
      chargePeriod: charges.period,
      chargeDevMode: charges.devMode,
    })
    .from(subscriptions)
    .leftJoin(charges, eq(charges.id, subscriptions.chargeId))
    .where(
      and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.status, 'active'),
        gt(subscriptions.endsAt, sql`now()`),
      ),
    )
    .orderBy(desc(subscriptions.endsAt));
}
