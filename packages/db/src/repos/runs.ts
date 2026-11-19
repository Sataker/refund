// Live analysis runs (SCHEMA §2.5, §6; ADR-007): ownership, the persisted result of one pipeline run, the
// findings round-trip and the Finanças ledger. Data access only: the paywall and every number stay outside.
import type { Finding, Total } from '@refund/engine';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../client.ts';
import {
  accounts,
  analyses,
  analysisEvents,
  classifications,
  findings,
  transactions,
} from '../schema/index.ts';

export type AnalysisRow = typeof analyses.$inferSelect;
export type FindingRow = typeof findings.$inferSelect;

export async function createAnalysis(
  db: Db,
  input: { userId: string; companyId: string; referenceMonth: string },
): Promise<AnalysisRow> {
  const [row] = await db
    .insert(analyses)
    .values({ ...input, origin: 'live', status: 'pending' })
    .returning();
  if (!row) throw new Error('createAnalysis: no row returned');
  return row;
}

/** The analysis only when it belongs to `userId` (authorization by owning session, ARCHITECTURE §4.8). */
export async function findOwnedAnalysis(
  db: Db,
  userId: string,
  analysisId: string,
): Promise<AnalysisRow | null> {
  const [row] = await db
    .select()
    .from(analyses)
    .where(and(eq(analyses.id, analysisId), eq(analyses.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function findAnalysis(db: Db, analysisId: string): Promise<AnalysisRow | null> {
  const [row] = await db.select().from(analyses).where(eq(analyses.id, analysisId)).limit(1);
  return row ?? null;
}

/** The user's newest analysis (any status), for "/app" to resume. */
export async function latestAnalysis(db: Db, userId: string): Promise<AnalysisRow | null> {
  const [row] = await db
    .select()
    .from(analyses)
    .where(eq(analyses.userId, userId))
    .orderBy(desc(analyses.createdAt))
    .limit(1);
  return row ?? null;
}

// ---------- findings round-trip ----------

const stripHash = (h: string): string => h.replace(/^sha256:/, '');

export function findingRow(
  analysisId: string,
  f: Finding,
  explanation: { text: string; origin: FindingRow['explanationOrigin'] } | null,
): typeof findings.$inferInsert {
  return {
    analysisId,
    ruleId: f.ruleId,
    ruleVersion: f.ruleVersion,
    order: f.order,
    type: f.type,
    title: f.title.slice(0, 200),
    marginalValue12mCents: f.marginalValue12m,
    annualRegimeValueCents: f.annualRegimeValue ?? null,
    regimeFrom: f.regimeFrom ?? null,
    rangeMinCents: f.range?.[0] ?? null,
    rangeMaxCents: f.range?.[1] ?? null,
    byDestination: f.byDestination ?? null,
    confidence: f.confidence,
    countsInTotal: f.countsInTotal,
    deadline: f.deadline ?? null,
    trace: f.trace,
    refs: f.refs,
    refIds: [
      ...new Set([
        ...f.refs.map((r) => r.id),
        ...f.trace.flatMap((s) => (s.ref ? [s.ref.id] : [])),
      ]),
    ],
    assumptionsUsed: f.assumptionsUsed,
    doNot: f.doNot,
    tradeoffs: f.tradeoffs,
    explanation: explanation?.text ?? null,
    explanationOrigin: explanation?.origin ?? null,
    actionPlan: f.actionPlan,
    howToReceive: f.howToReceive,
    recoveryItems: f.recoveryItems ?? null,
  };
}

/** Row → the engine's `Finding`, exactly as it was written (optional fields stay absent, not undefined). */
export function findingOf(row: FindingRow): Finding {
  const f: Finding = {
    ruleId: row.ruleId,
    ruleVersion: row.ruleVersion,
    order: row.order,
    type: row.type,
    title: row.title,
    marginalValue12m: row.marginalValue12mCents as Finding['marginalValue12m'],
    confidence: row.confidence,
    trace: row.trace,
    refs: row.refs,
    doNot: row.doNot,
    tradeoffs: row.tradeoffs,
    assumptionsUsed: row.assumptionsUsed,
    countsInTotal: row.countsInTotal,
    actionPlan: row.actionPlan ?? [],
    howToReceive: row.howToReceive ?? [],
  };
  if (row.annualRegimeValueCents !== null)
    f.annualRegimeValue = row.annualRegimeValueCents as NonNullable<Finding['annualRegimeValue']>;
  if (row.regimeFrom !== null) f.regimeFrom = row.regimeFrom as NonNullable<Finding['regimeFrom']>;
  if (row.rangeMinCents !== null && row.rangeMaxCents !== null)
    f.range = [row.rangeMinCents, row.rangeMaxCents] as NonNullable<Finding['range']>;
  if (row.byDestination !== null) f.byDestination = row.byDestination;
  if (row.deadline !== null) f.deadline = row.deadline as NonNullable<Finding['deadline']>;
  if (row.recoveryItems !== null) f.recoveryItems = row.recoveryItems;
  return f;
}

export async function listFindings(db: Db, analysisId: string): Promise<FindingRow[]> {
  return db
    .select()
    .from(findings)
    .where(eq(findings.analysisId, analysisId))
    .orderBy(asc(findings.order));
}

// ---------- one run, persisted at once ----------

export interface ClassificationInput {
  transactionId: string;
  category: (typeof classifications.$inferInsert)['category'];
  confidenceBp: number;
  origin: (typeof classifications.$inferInsert)['origin'];
  ruleId: string | null;
  reason: string;
  status: (typeof classifications.$inferInsert)['status'];
}

export interface RunOutcome {
  status: 'completed' | 'awaiting_confirmation' | 'error';
  engineVersion: string | null;
  parametersVersion: string | null;
  parametersHash: string | null;
  inputsHash: string | null;
  total: Total | null;
  metrics: { transactions: number; byOrigin: Record<string, number>; durationMs: number };
  error: { code: string; message: string; stage?: string } | null;
  findings: (typeof findings.$inferInsert)[];
  classifications: ClassificationInput[];
  /** Already serialized for the wire (the paywall ran before this), seq from 1. */
  events: { seq: number; type: string; payload: unknown }[];
}

const CHUNK = 500;

/**
 * Writes the whole run in one transaction (findings, classifications, the event log, the final status). Only the
 * claimer calls it; if the analysis is no longer `running` (another instance finished it), nothing is written.
 */
export async function saveRun(db: Db, analysisId: string, run: RunOutcome): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [owned] = await tx
      .update(analyses)
      .set({
        status: run.status,
        engineVersion: run.engineVersion,
        parametersVersion: run.parametersVersion,
        parametersHash: run.parametersHash === null ? null : stripHash(run.parametersHash),
        inputsHash: run.inputsHash === null ? null : stripHash(run.inputsHash),
        total: run.total,
        metrics: run.metrics,
        error: run.error,
        completedAt: sql`now()`,
      })
      .where(and(eq(analyses.id, analysisId), eq(analyses.status, 'running')))
      .returning({ id: analyses.id });
    if (!owned) return false;
    if (run.findings.length > 0) await tx.insert(findings).values(run.findings);
    for (let i = 0; i < run.classifications.length; i += CHUNK) {
      const rows = run.classifications.slice(i, i + CHUNK).map((c) => ({ analysisId, ...c }));
      if (rows.length > 0) await tx.insert(classifications).values(rows);
    }
    for (let i = 0; i < run.events.length; i += CHUNK) {
      const rows = run.events.slice(i, i + CHUNK).map((e) => ({ analysisId, ...e }));
      if (rows.length > 0) await tx.insert(analysisEvents).values(rows).onConflictDoNothing();
    }
    return true;
  });
}

export async function setFindingStatus(
  db: Db,
  analysisId: string,
  findingId: string,
  status: FindingRow['status'],
): Promise<boolean> {
  const rows = await db
    .update(findings)
    .set({ status })
    .where(and(eq(findings.id, findingId), eq(findings.analysisId, analysisId)))
    .returning({ id: findings.id });
  return rows.length > 0;
}

/** [D31] The owner's exclusions in Finanças, replaced as a whole (sorted, unique). */
export async function setExcludedTransactions(
  db: Db,
  analysisId: string,
  ids: readonly string[],
): Promise<void> {
  await db
    .update(analyses)
    .set({ excludedTransactionIds: [...new Set(ids)].sort() })
    .where(eq(analyses.id, analysisId));
}

// ---------- Finanças ledger (E14b task 6) ----------

export interface LedgerRow {
  transaction: typeof transactions.$inferSelect;
  account: Pick<
    typeof accounts.$inferSelect,
    'id' | 'holder' | 'type' | 'productName' | 'institution' | 'currency' | 'balanceCents'
  >;
  classification: typeof classifications.$inferSelect;
}

/**
 * Every transaction the analysis classified, with its account and its classification: one join over
 * `classifications_analysis_transaction_uk` and the transactions primary key. Transactions of a revoked connection
 * are gone (cascade), so they drop out here too.
 */
export async function listAnalysisLedger(db: Db, analysisId: string): Promise<LedgerRow[]> {
  return db
    .select({
      transaction: transactions,
      account: {
        id: accounts.id,
        holder: accounts.holder,
        type: accounts.type,
        productName: accounts.productName,
        institution: accounts.institution,
        currency: accounts.currency,
        balanceCents: accounts.balanceCents,
      },
      classification: classifications,
    })
    .from(classifications)
    .innerJoin(transactions, eq(transactions.id, classifications.transactionId))
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(eq(classifications.analysisId, analysisId))
    .orderBy(asc(transactions.date), asc(transactions.id));
}
