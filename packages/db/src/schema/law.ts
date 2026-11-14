// SCHEMA §2.7: regulation monitoring.
import { index, text, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import {
  createdAt,
  emptyArray,
  explanationOrigin,
  id,
  lawChangeStatus,
  refund,
  ts,
} from './base.ts';
import { users } from './identity.ts';

/** One row per monitored URL (the regulation catalog lives in @refund/law/regulations.ts). */
export const monitoredRegulations = refund.table('monitored_regulations', {
  regulationId: varchar('regulation_id', { length: 40 }).primaryKey(), // 'lc123-2006'
  url: text('url').notNull(),
  firecrawlMonitorId: varchar('firecrawl_monitor_id', { length: 80 }),
  lastCheckedAt: ts('last_checked_at'),
  lastChangedAt: ts('last_changed_at'),
});

export const lawChanges = refund.table(
  'law_changes',
  {
    id: id(),
    regulationId: varchar('regulation_id', { length: 40 })
      .notNull()
      .references(() => monitoredRegulations.regulationId),
    url: text('url').notNull(),
    eventId: varchar('event_id', { length: 80 }).notNull(), // sha256 of the webhook body
    detectedAt: ts('detected_at').notNull().defaultNow(),
    diffText: text('diff_text').notNull(), // law text is public
    judgment: text('judgment'), // Firecrawl's 'judgment'
    affectedArticles: text('affected_articles').array().notNull().default(emptyArray), // ids from @refund/law
    affectedRules: text('affected_rules').array().notNull().default(emptyArray),
    summary: text('summary'),
    summaryOrigin: explanationOrigin('summary_origin'),
    status: lawChangeStatus('status').notNull().default('new'),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: ts('reviewed_at'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('law_changes_event_uk').on(t.eventId),
    index('law_changes_regulation_idx').on(t.regulationId, t.detectedAt),
  ],
);
