// "Law changed" (SCHEMA §2.7; ARCHITECTURE §2.6; ADR-013). Writes to the database only: a change is reviewed by a
// person, and a parameter changes only through a commit in the engine.
import { and, desc, eq, inArray, isNotNull, or, sql } from 'drizzle-orm';
import type { Db } from '../client.ts';
import { analyses, findings, lawChanges, monitoredRegulations, users } from '../schema/index.ts';

export type LawChangeStatus = (typeof lawChanges.status.enumValues)[number];
export type LawChangeRow = typeof lawChanges.$inferSelect;

/** Makes sure the regulation is in `monitored_regulations` (the FK of `law_changes`) without touching its monitor id. */
export async function ensureMonitoredRegulation(
  db: Db,
  input: { regulationId: string; url: string },
): Promise<void> {
  await db
    .insert(monitoredRegulations)
    .values({ regulationId: input.regulationId, url: input.url })
    .onConflictDoNothing({ target: monitoredRegulations.regulationId });
}

/** `monitor.page` for this regulation: checked now and, when it changed, changed now. */
export async function touchMonitoredRegulation(
  db: Db,
  regulationId: string,
  changed: boolean,
): Promise<void> {
  await db
    .update(monitoredRegulations)
    .set(
      changed
        ? { lastCheckedAt: sql`now()`, lastChangedAt: sql`now()` }
        : { lastCheckedAt: sql`now()` },
    )
    .where(eq(monitoredRegulations.regulationId, regulationId));
}

/** `monitor.check.completed`: every regulation of that Firecrawl monitor was checked now. Returns the row count. */
export async function markMonitorChecked(db: Db, firecrawlMonitorId: string): Promise<number> {
  const rows = await db
    .update(monitoredRegulations)
    .set({ lastCheckedAt: sql`now()` })
    .where(eq(monitoredRegulations.firecrawlMonitorId, firecrawlMonitorId))
    .returning({ id: monitoredRegulations.regulationId });
  return rows.length;
}

/** `scripts/firecrawl-monitor.ts`: links each regulation to the monitor that watches its page. */
export async function setFirecrawlMonitorId(
  db: Db,
  regulationIds: readonly string[],
  firecrawlMonitorId: string,
): Promise<void> {
  if (regulationIds.length === 0) return;
  await db
    .update(monitoredRegulations)
    .set({ firecrawlMonitorId })
    .where(inArray(monitoredRegulations.regulationId, [...regulationIds]));
}

export interface LawChangeInput {
  regulationId: string;
  url: string;
  /** sha256 of the webhook body (+ `:<page index>` after the first page of a delivery). */
  eventId: string;
  diffText: string;
  judgment: string | null;
  affectedArticles: string[];
  affectedRules: string[];
}

/** Idempotent on `event_id`: null when that change was already recorded. */
export async function insertLawChange(db: Db, input: LawChangeInput): Promise<string | null> {
  const rows = await db
    .insert(lawChanges)
    .values(input)
    .onConflictDoNothing({ target: lawChanges.eventId })
    .returning({ id: lawChanges.id });
  return rows[0]?.id ?? null;
}

export interface RecordedLawChange {
  id: string;
  /** false when the same delivery (event id) or the same diff of the same regulation was already recorded. */
  created: boolean;
  /** Analyses whose findings this call marked as outdated (only newly marked ones). */
  analysisIds: string[];
}

/**
 * The durable half of "law changed" (code review E16, H1): the change and the outdated findings in ONE transaction,
 * before any summary or e-mail. Deduplicated on the event id and on (regulation, diff text) (L2). On a repeat it still
 * re-marks the findings of the affected rules: idempotent, and it covers findings saved after the first delivery.
 */
export async function recordLawChange(db: Db, input: LawChangeInput): Promise<RecordedLawChange> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: lawChanges.id, affectedRules: lawChanges.affectedRules })
      .from(lawChanges)
      .where(
        or(
          eq(lawChanges.eventId, input.eventId),
          and(
            eq(lawChanges.regulationId, input.regulationId),
            eq(lawChanges.diffText, input.diffText),
          ),
        ),
      )
      .limit(1);
    let id = existing?.id ?? null;
    let created = false;
    if (id === null) {
      const [row] = await tx
        .insert(lawChanges)
        .values(input)
        .onConflictDoNothing({ target: lawChanges.eventId })
        .returning({ id: lawChanges.id });
      id = row?.id ?? null;
      created = id !== null;
    }
    if (id === null) {
      // Lost a race on event_id with a concurrent delivery: the other transaction holds the row.
      const [row] = await tx
        .select({ id: lawChanges.id })
        .from(lawChanges)
        .where(eq(lawChanges.eventId, input.eventId));
      if (!row) throw new Error('law change vanished');
      id = row.id;
    }
    const rules = existing?.affectedRules ?? input.affectedRules;
    const analysisIds = await markRuleFindingsOutdated(tx as unknown as Db, rules, id);
    return { id, created, analysisIds };
  });
}

export async function setLawChangeSummary(
  db: Db,
  id: string,
  summary: string,
  origin: 'llm' | 'template',
): Promise<void> {
  await db.update(lawChanges).set({ summary, summaryOrigin: origin }).where(eq(lawChanges.id, id));
}

/**
 * Marks as outdated the not-yet-outdated findings of the affected rules (ARCHITECTURE §2.6 "findings.outdated = true
 * in analyses that use those rules") and returns the affected analysis ids (distinct).
 */
export async function markRuleFindingsOutdated(
  db: Db,
  ruleIds: readonly string[],
  lawChangeId: string,
): Promise<string[]> {
  if (ruleIds.length === 0) return [];
  const rows = await db
    .update(findings)
    .set({ outdated: true, lawChangeId })
    .where(and(inArray(findings.ruleId, [...ruleIds]), eq(findings.outdated, false)))
    .returning({ analysisId: findings.analysisId });
  return [...new Set(rows.map((r) => r.analysisId))];
}

/** Owners of those analyses who gave an e-mail (encrypted at rest; decrypted by the caller), one row per user. */
export async function lawAlertRecipients(
  db: Db,
  analysisIds: readonly string[],
): Promise<{ userId: string; emailEncrypted: string }[]> {
  if (analysisIds.length === 0) return [];
  const rows = await db
    .selectDistinct({ userId: users.id, emailEncrypted: users.emailEncrypted })
    .from(analyses)
    .innerJoin(users, eq(users.id, analyses.userId))
    .where(and(inArray(analyses.id, [...analysisIds]), isNotNull(users.emailEncrypted)));
  return rows.flatMap((r) =>
    r.emailEncrypted === null ? [] : [{ userId: r.userId, emailEncrypted: r.emailEncrypted }],
  );
}

/** Human review (EXECUTION §9, E16: a query on `law_changes` while there is no admin screen). Newest first. */
export async function listLawChanges(
  db: Db,
  options: { status?: LawChangeStatus; limit?: number } = {},
): Promise<LawChangeRow[]> {
  const q = db.select().from(lawChanges);
  const filtered = options.status ? q.where(eq(lawChanges.status, options.status)) : q;
  return filtered.orderBy(desc(lawChanges.detectedAt)).limit(options.limit ?? 50);
}

/** Records the person's decision. 'applied' means a commit with the new parameter period went in (ADR-013). */
export async function reviewLawChange(
  db: Db,
  id: string,
  status: Exclude<LawChangeStatus, 'new'>,
  reviewedBy: string | null,
): Promise<boolean> {
  const rows = await db
    .update(lawChanges)
    .set({ status, reviewedBy, reviewedAt: sql`now()` })
    .where(eq(lawChanges.id, id))
    .returning({ id: lawChanges.id });
  return rows.length > 0;
}
