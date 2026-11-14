// SCHEMA §2.3: public company data and the user ↔ company link.
import type { PublicCompany } from '@refund/sources';
import {
  boolean,
  char,
  date,
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  companySize,
  companySource,
  createdAt,
  emptyArray,
  id,
  linkRole,
  refund,
  taxRegime,
  updatedAt,
} from './base.ts';
import { users } from './identity.ts';

export const companies = refund.table(
  'companies',
  {
    id: id(),
    cnpj: char('cnpj', { length: 14 }).notNull(), // alphanumeric [0-9A-Z]{12}[0-9]{2}
    displayLegalName: varchar('display_legal_name', { length: 200 }).notNull(),
    displayTradeName: varchar('display_trade_name', { length: 200 }),
    masked: boolean('masked').notNull().default(false),
    legalNatureCode: varchar('legal_nature_code', { length: 4 }).notNull(),
    size: companySize('size').notNull(),
    primaryCnae: varchar('primary_cnae', { length: 7 }).notNull(),
    secondaryCnaes: text('secondary_cnaes').array().notNull().default(emptyArray),
    regime: taxRegime('regime').notNull(),
    optedIntoSimples: boolean('opted_into_simples').notNull(),
    optedIntoMei: boolean('opted_into_mei').notNull(),
    openedOn: date('opened_on', { mode: 'string' }).notNull(),
    uf: char('uf', { length: 2 }).notNull(),
    ibgeMunicipality: varchar('ibge_municipality', { length: 7 }),
    publicData: jsonb('public_data').$type<PublicCompany>().notNull(), // whitelist ONLY
    source: companySource('source').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('companies_cnpj_uk').on(t.cnpj)],
);

export const companyLinks = refund.table(
  'company_links',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    role: linkRole('role').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.companyId] }),
    index('company_links_company_idx').on(t.companyId),
  ],
);

/** Assumptions confirmed by the user per company (e.g. monthly pró-labore, has full bookkeeping). */
export const userAssumptions = refund.table(
  'user_assumptions',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    key: varchar('key', { length: 80 }).notNull(), // 'monthly_pro_labore', 'full_bookkeeping'…
    value: jsonb('value').$type<number | string | boolean>().notNull(),
    version: integer('version').notNull().default(1),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.companyId, t.key] })],
);
