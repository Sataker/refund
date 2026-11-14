// SCHEMA §2.8: charges, subscriptions, monthly usage.
import {
  bigint,
  boolean,
  char,
  index,
  integer,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  chargeStatus,
  createdAt,
  id,
  refund,
  subscriptionOrigin,
  subscriptionStatus,
  ts,
  updatedAt,
} from './base.ts';
import { users } from './identity.ts';

export const charges = refund.table(
  'charges',
  {
    id: id(), // = externalId sent to AbacatePay
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    planId: varchar('plan_id', { length: 20 }).notNull(), // PlanId: 'personal' | 'mei' | 'business' | 'accountant_pro' | …
    period: varchar('period', { length: 10 }).notNull(), // 'monthly' | 'yearly' | 'validation'
    provider: varchar('provider', { length: 20 }).notNull().default('abacatepay'),
    providerChargeId: varchar('provider_charge_id', { length: 80 }),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    status: chargeStatus('status').notNull().default('pending'),
    devMode: boolean('dev_mode').notNull(),
    brCode: text('br_code'),
    expiresAt: ts('expires_at'),
    paidAt: ts('paid_at'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('charges_provider_uk').on(t.provider, t.providerChargeId),
    index('charges_user_idx').on(t.userId, t.createdAt),
    index('charges_period_status_idx').on(t.period, t.status), // ceiling of 5 paid 'validation'
  ],
);

export const subscriptions = refund.table(
  'subscriptions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    planId: varchar('plan_id', { length: 20 }).notNull(),
    status: subscriptionStatus('status').notNull(),
    origin: subscriptionOrigin('origin').notNull(),
    chargeId: uuid('charge_id').references(() => charges.id, { onDelete: 'set null' }),
    providerSubscriptionId: varchar('provider_subscription_id', { length: 80 }), // 'subs_…' (Pix Automático/card, future)
    startsAt: ts('starts_at').notNull(),
    endsAt: ts('ends_at').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('subscriptions_active_idx').on(t.userId, t.status, t.endsAt),
    uniqueIndex('subscriptions_charge_uk').on(t.chargeId), // 1 charge = at most 1 granted period
  ],
);

export const monthlyUsage = refund.table(
  'monthly_usage',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    month: char('month', { length: 7 }).notNull(),
    resource: varchar('resource', { length: 40 }).notNull(),
    quantity: integer('quantity').notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.month, t.resource] })],
);
