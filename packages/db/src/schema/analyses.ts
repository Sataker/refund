// SCHEMA §2.5: analysis, events, classification, facts, findings.
import type { Finding, LegalRef, Step, Total } from '@refund/engine';
import {
  bigint,
  boolean,
  char,
  date,
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
  analysisOrigin,
  analysisStatus,
  category,
  classificationOrigin,
  classificationStatus,
  confidence,
  createdAt,
  emptyArray,
  explanationOrigin,
  factOrigin,
  findingStatus,
  findingType,
  id,
  refund,
  ts,
} from './base.ts';
import { companies } from './companies.ts';
import { transactions } from './financial.ts';
import { users } from './identity.ts';

export const analyses = refund.table(
  'analyses',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    origin: analysisOrigin('origin').notNull(),
    status: analysisStatus('status').notNull().default('pending'),
    referenceMonth: char('reference_month', { length: 7 }).notNull(),
    engineVersion: varchar('engine_version', { length: 20 }),
    parametersVersion: varchar('parameters_version', { length: 20 }),
    parametersHash: char('parameters_hash', { length: 64 }),
    inputsHash: char('inputs_hash', { length: 64 }),
    total: jsonb('total').$type<Total>(),
    metrics: jsonb('metrics').$type<{
      transactions: number;
      byOrigin: Record<string, number>;
      durationMs: number;
    }>(),
    error: jsonb('error').$type<{ code: string; message: string; stage?: string }>(),
    claimedAt: ts('claimed_at'), // execution lock (claim)
    startedAt: ts('started_at'),
    completedAt: ts('completed_at'),
    createdAt: createdAt(),
  },
  (t) => [
    index('analyses_user_idx').on(t.userId, t.createdAt),
    index('analyses_company_idx').on(t.companyId),
  ],
);

/** SSE event log (replay on reconnect; Last-Event-ID). */
export const analysisEvents = refund.table(
  'analysis_events',
  {
    analysisId: uuid('analysis_id')
      .notNull()
      .references(() => analyses.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    type: varchar('type', { length: 30 }).notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.analysisId, t.seq] })],
);

export const classifications = refund.table(
  'classifications',
  {
    id: id(),
    analysisId: uuid('analysis_id')
      .notNull()
      .references(() => analyses.id, { onDelete: 'cascade' }),
    transactionId: varchar('transaction_id', { length: 26 })
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    category: category('category').notNull(),
    confidenceBp: smallint('confidence_bp').notNull(), // 0..1000
    origin: classificationOrigin('origin').notNull(),
    ruleId: varchar('rule_id', { length: 40 }),
    reason: varchar('reason', { length: 300 }).notNull(),
    status: classificationStatus('status').notNull(),
    confirmedAt: ts('confirmed_at'),
  },
  (t) => [
    uniqueIndex('classifications_analysis_transaction_uk').on(t.analysisId, t.transactionId),
    index('classifications_pending_idx').on(t.analysisId, t.status),
  ],
);

export const facts = refund.table(
  'facts',
  {
    id: id(),
    analysisId: uuid('analysis_id')
      .notNull()
      .references(() => analyses.id, { onDelete: 'cascade' }),
    key: varchar('key', { length: 80 }).notNull(), // 'monthlyRevenue', 'monthlyPayroll'…
    month: char('month', { length: 7 }), // null = non-monthly fact
    amountCents: bigint('amount_cents', { mode: 'number' }),
    valueJson: jsonb('value_json'),
    origin: factOrigin('origin').notNull(),
    provenance: varchar('provenance', { length: 26 }).array().notNull().default(emptyArray), // transaction ids
  },
  (t) => [index('facts_analysis_key_idx').on(t.analysisId, t.key, t.month)],
);

export const findings = refund.table(
  'findings',
  {
    id: id(),
    analysisId: uuid('analysis_id')
      .notNull()
      .references(() => analyses.id, { onDelete: 'cascade' }),
    ruleId: varchar('rule_id', { length: 40 }).notNull(),
    ruleVersion: varchar('rule_version', { length: 20 }).notNull(),
    order: smallint('sort_order').notNull(),
    type: findingType('type').notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    marginalValue12mCents: bigint('marginal_value_12m_cents', { mode: 'number' }).notNull(),
    annualRegimeValueCents: bigint('annual_regime_value_cents', { mode: 'number' }),
    regimeFrom: char('regime_from', { length: 7 }),
    rangeMinCents: bigint('range_min_cents', { mode: 'number' }),
    rangeMaxCents: bigint('range_max_cents', { mode: 'number' }),
    byDestination: jsonb('by_destination').$type<NonNullable<Finding['byDestination']>>(), // recovery only (ARCHITECTURE §4.2)
    confidence: confidence('confidence').notNull(),
    countsInTotal: boolean('counts_in_total').notNull(),
    deadline: date('deadline', { mode: 'string' }),
    trace: jsonb('trace').$type<Step[]>().notNull(),
    refs: jsonb('refs').$type<LegalRef[]>().notNull(),
    refIds: text('ref_ids').array().notNull().default(emptyArray), // index for "law changed"
    assumptionsUsed: text('assumptions_used').array().notNull().default(emptyArray),
    doNot: text('do_not').array().notNull().default(emptyArray),
    tradeoffs: text('tradeoffs').array().notNull().default(emptyArray),
    explanation: text('explanation'),
    explanationOrigin: explanationOrigin('explanation_origin'),
    status: findingStatus('status').notNull().default('new'),
    outdated: boolean('outdated').notNull().default(false),
    lawChangeId: uuid('law_change_id'), // logical FK to law_changes (constraint in migration 0002)
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('findings_analysis_rule_uk').on(t.analysisId, t.ruleId),
    index('findings_ref_ids_gin').using('gin', t.refIds),
  ],
);
