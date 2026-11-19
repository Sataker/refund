// Reports to the accountant (SCHEMA §2.6, §6 "Report"). The caller hashes the token and encrypts the e-mail.
import { and, desc, eq, gt, sql } from 'drizzle-orm';
import type { Db } from '../client.ts';
import { analyses, reports } from '../schema/index.ts';

export type ReportRow = typeof reports.$inferSelect;
export type ReportInsert = typeof reports.$inferInsert;
export type ReportDecisionItem = NonNullable<ReportRow['decisionsByFinding']>[number];

export async function insertReport(db: Db, input: ReportInsert): Promise<ReportRow> {
  const [row] = await db.insert(reports).values(input).returning();
  if (!row) throw new Error('insertReport: no row returned');
  return row;
}

export async function markReportSent(
  db: Db,
  reportId: string,
  resendEmailId: string | null,
): Promise<void> {
  await db
    .update(reports)
    .set({ sentAt: sql`now()`, resendEmailId })
    .where(eq(reports.id, reportId));
}

/** A report reachable by its token: the hash matches and it has not expired (the token itself is never stored). */
export async function findReportByTokenHash(
  db: Db,
  tokenHash: string,
): Promise<{ report: ReportRow; userId: string } | null> {
  const [row] = await db
    .select({ report: reports, userId: analyses.userId })
    .from(reports)
    .innerJoin(analyses, eq(analyses.id, reports.analysisId))
    .where(and(eq(reports.tokenHash, tokenHash), gt(reports.expiresAt, sql`now()`)))
    .limit(1);
  return row ?? null;
}

/** First visit to `/r/[token]`: stamps `opened_at` once. */
export async function markReportOpened(db: Db, reportId: string): Promise<void> {
  await db
    .update(reports)
    .set({ openedAt: sql`now()` })
    .where(and(eq(reports.id, reportId), sql`${reports.openedAt} is null`));
}

/** The final decision is written once: a second call changes nothing and returns false. */
export async function decideReportRow(
  db: Db,
  reportId: string,
  decision: 'approved' | 'adjustments',
  items: ReportDecisionItem[],
): Promise<boolean> {
  const rows = await db
    .update(reports)
    .set({ decision, decisionsByFinding: items, decidedAt: sql`now()` })
    .where(and(eq(reports.id, reportId), eq(reports.decision, 'pending')))
    .returning({ id: reports.id });
  return rows.length > 0;
}

/** The report only when its analysis belongs to `userId`. */
export async function findOwnedReport(
  db: Db,
  userId: string,
  reportId: string,
): Promise<ReportRow | null> {
  const [row] = await db
    .select({ report: reports })
    .from(reports)
    .innerJoin(analyses, eq(analyses.id, reports.analysisId))
    .where(and(eq(reports.id, reportId), eq(analyses.userId, userId)))
    .limit(1);
  return row?.report ?? null;
}

export async function latestReport(db: Db, analysisId: string): Promise<ReportRow | null> {
  const [row] = await db
    .select()
    .from(reports)
    .where(eq(reports.analysisId, analysisId))
    .orderBy(desc(reports.createdAt))
    .limit(1);
  return row ?? null;
}
