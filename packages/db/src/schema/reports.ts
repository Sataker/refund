// SCHEMA §2.6: report sent to the accountant.
import { index, jsonb, text, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { analyses } from './analyses.ts';
import { createdAt, id, refund, reportDecision, ts } from './base.ts';

export const reports = refund.table(
  'reports',
  {
    id: id(),
    analysisId: uuid('analysis_id')
      .notNull()
      .references(() => analyses.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(), // sha256(token)
    accountantEmailEncrypted: text('accountant_email_encrypted').notNull(),
    accountantEmailHash: text('accountant_email_hash').notNull(),
    message: varchar('message', { length: 1000 }),
    include: jsonb('include')
      .$type<{ calculations: boolean; laws: boolean; transactions: boolean }>()
      .notNull(),
    resendEmailId: varchar('resend_email_id', { length: 80 }),
    sentAt: ts('sent_at'),
    deliveredAt: ts('delivered_at'),
    openedAt: ts('opened_at'), // 1st visit to /r/[token]
    decision: reportDecision('decision').notNull().default('pending'),
    decisionsByFinding:
      jsonb('decisions_by_finding').$type<
        { findingId: string; decision: 'approved' | 'adjustment'; comment?: string }[]
      >(),
    decidedAt: ts('decided_at'),
    expiresAt: ts('expires_at').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('reports_token_uk').on(t.tokenHash),
    index('reports_analysis_idx').on(t.analysisId),
    index('reports_resend_idx').on(t.resendEmailId),
  ],
);
