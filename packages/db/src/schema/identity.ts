// SCHEMA §2.2: users, organizations, consent.
import { boolean, index, primaryKey, text, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import {
  createdAt,
  emptyArray,
  id,
  organizationRole,
  organizationType,
  refund,
  ts,
  updatedAt,
} from './base.ts';

export const users = refund.table(
  'users',
  {
    id: id(),
    anonymous: boolean('anonymous').notNull().default(true),
    workosUserId: text('workos_user_id'),
    emailHash: text('email_hash'), // HMAC(PII_PEPPER, lower(email)) for lookup
    emailEncrypted: text('email_encrypted'), // AES-GCM (v1.…); shown on /app/conta
    displayName: varchar('display_name', { length: 120 }),
    lastAccessAt: ts('last_access_at').notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('users_workos_uk').on(t.workosUserId),
    uniqueIndex('users_email_hash_uk').on(t.emailHash),
    index('users_anonymous_access_idx').on(t.anonymous, t.lastAccessAt), // LGPD cleanup
  ],
);

export const organizations = refund.table(
  'organizations',
  {
    id: id(),
    workosOrgId: text('workos_org_id').notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    type: organizationType('type').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('organizations_workos_uk').on(t.workosOrgId)],
);

export const organizationMembers = refund.table(
  'organization_members',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: organizationRole('role').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.userId] }),
    index('organization_members_user_idx').on(t.userId),
  ],
);

export const consents = refund.table(
  'consents',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    scopes: text('scopes').array().notNull().default(emptyArray), // ['accounts','transactions','identity','public_cnpj']
    termsVersion: varchar('terms_version', { length: 20 }).notNull(), // '2026-11-20'
    ipHash: text('ip_hash'),
    grantedAt: ts('granted_at').notNull().defaultNow(),
    revokedAt: ts('revoked_at'),
  },
  (t) => [index('consents_user_idx').on(t.userId)],
);
