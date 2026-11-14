// SCHEMA §2.9: webhooks, rate limit, cache, audit, health, waitlist.
import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  primaryKey,
  smallint,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  actorType,
  createdAt,
  id,
  logLevel,
  refund,
  ts,
  webhookProvider,
  webhookStatus,
} from './base.ts';

export const webhookEvents = refund.table(
  'webhook_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    provider: webhookProvider('provider').notNull(),
    eventId: varchar('event_id', { length: 120 }).notNull(),
    type: varchar('type', { length: 60 }).notNull(),
    status: webhookStatus('status').notNull().default('received'),
    payload: jsonb('payload'), // minimal; deleted after 30 days
    error: text('error'),
    receivedAt: ts('received_at').notNull().defaultNow(),
    processedAt: ts('processed_at'),
  },
  (t) => [
    uniqueIndex('webhook_events_uk').on(t.provider, t.eventId),
    index('webhook_events_received_idx').on(t.receivedAt),
  ],
);

export const rateLimits = refund.table(
  'rate_limits',
  {
    key: varchar('key', { length: 120 }).notNull(), // 'cnpj:s:<sid>' (IP always as HMAC)
    windowStart: ts('window_start').notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.key, t.windowStart] }),
    index('rate_limits_window_idx').on(t.windowStart),
  ],
);

export const externalCache = refund.table(
  'external_cache',
  {
    source: varchar('source', { length: 30 }).notNull(), // 'cnpj' | 'sgs'
    key: varchar('key', { length: 120 }).notNull(),
    payload: jsonb('payload').notNull(), // already sanitized
    fetchedAt: ts('fetched_at').notNull().defaultNow(),
    expiresAt: ts('expires_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.source, t.key] })],
);

export const auditEvents = refund.table(
  'audit_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    actorType: actorType('actor_type').notNull(),
    actorUserId: uuid('actor_user_id'), // no FK: survives deletion (set to null by the cron)
    action: varchar('action', { length: 60 }).notNull(), // 'connection.created', 'report.approved', 'delete_data'…
    targetType: varchar('target_type', { length: 40 }),
    targetId: varchar('target_id', { length: 80 }),
    data: jsonb('data'), // never PII
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_events_target_idx').on(t.targetType, t.targetId),
    index('audit_events_created_idx').on(t.createdAt),
  ],
);

export const systemEvents = refund.table(
  'system_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    level: logLevel('level').notNull(),
    event: varchar('event', { length: 60 }).notNull(),
    route: varchar('route', { length: 200 }),
    requestId: varchar('request_id', { length: 120 }),
    context: jsonb('context'), // already redacted
    createdAt: createdAt(),
  },
  (t) => [
    index('system_events_created_idx').on(t.createdAt),
    index('system_events_event_idx').on(t.event, t.createdAt),
  ],
);

/** A single row (id = 1). Written by the deep health check and by the cron: keeps Supabase awake. */
export const systemHeartbeat = refund.table('system_heartbeat', {
  id: smallint('id').primaryKey(),
  seenAt: ts('seen_at').notNull().defaultNow(),
  origin: varchar('origin', { length: 30 }).notNull(), // 'migration' | 'health' | 'cron' | 'gh-actions'
});

/**
 * Landing waitlist (E4; SCHEMA §2.9). No FK to users: whoever joins has no session. The e-mail is
 * stored only encrypted, with the HMAC beside it so a second sign-up is idempotent.
 */
export const waitlist = refund.table(
  'waitlist',
  {
    id: id(),
    emailEncrypted: text('email_encrypted').notNull(), // AES-GCM (v1.…)
    emailHash: text('email_hash').notNull(), // HMAC(PII_PEPPER, lower(email))
    hasCnpj: boolean('has_cnpj').notNull(),
    origin: varchar('origin', { length: 40 }).notNull(), // 'landing', 'demo'…
    consentedAt: ts('consented_at').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('waitlist_email_hash_uk').on(t.emailHash)],
);
