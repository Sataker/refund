// Analysis aggregate: claim, SSE event log, "law changed" marking (SCHEMA §6; ADR-007, ADR-013).
import { and, arrayOverlaps, asc, eq, gt, lt, or, sql } from 'drizzle-orm';
import type { Db } from '../client.ts';
import { analyses, analysisEvents, findings } from '../schema/index.ts';

/** A run older than this is considered stuck and may be claimed again (SCHEMA §6). */
export const CLAIM_TIMEOUT_MINUTES = 6;

/**
 * Claims an analysis for execution: only one instance runs it. True if this caller got it
 * (status was 'pending', or 'running' with a claim older than the timeout).
 */
export async function claimAnalysis(db: Db, analysisId: string): Promise<boolean> {
  const rows = await db
    .update(analyses)
    .set({ status: 'running', claimedAt: sql`now()`, startedAt: sql`now()` })
    .where(
      and(
        eq(analyses.id, analysisId),
        or(
          eq(analyses.status, 'pending'),
          and(
            eq(analyses.status, 'running'),
            lt(analyses.claimedAt, sql`now() - make_interval(mins => ${CLAIM_TIMEOUT_MINUTES})`),
          ),
        ),
      ),
    )
    .returning({ id: analyses.id });
  return rows.length > 0;
}

export interface AnalysisEventInput {
  seq: number;
  type: string;
  payload: unknown;
}

/** The executor owns `seq` after the claim; a replayed write is ignored. True if inserted. */
export async function appendAnalysisEvent(
  db: Db,
  analysisId: string,
  event: AnalysisEventInput,
): Promise<boolean> {
  const rows = await db
    .insert(analysisEvents)
    .values({ analysisId, seq: event.seq, type: event.type, payload: event.payload })
    .onConflictDoNothing({ target: [analysisEvents.analysisId, analysisEvents.seq] })
    .returning({ seq: analysisEvents.seq });
  return rows.length > 0;
}

/** Resend after `Last-Event-ID`, in order. */
export async function analysisEventsAfter(
  db: Db,
  analysisId: string,
  afterSeq: number,
): Promise<{ seq: number; type: string; payload: unknown }[]> {
  return db
    .select({ seq: analysisEvents.seq, type: analysisEvents.type, payload: analysisEvents.payload })
    .from(analysisEvents)
    .where(and(eq(analysisEvents.analysisId, analysisId), gt(analysisEvents.seq, afterSeq)))
    .orderBy(asc(analysisEvents.seq));
}

/**
 * "Law changed": marks as outdated the findings that cite any of `refIds` (GIN on ref_ids) and
 * returns the affected analysis ids (distinct).
 */
export async function markFindingsOutdated(
  db: Db,
  refIds: string[],
  lawChangeId: string,
): Promise<string[]> {
  if (refIds.length === 0) return [];
  const rows = await db
    .update(findings)
    .set({ outdated: true, lawChangeId })
    .where(and(arrayOverlaps(findings.refIds, refIds), eq(findings.outdated, false)))
    .returning({ analysisId: findings.analysisId });
  return [...new Set(rows.map((r) => r.analysisId))];
}
