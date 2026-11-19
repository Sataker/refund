import 'server-only';
import { randomUUID } from 'node:crypto';
import { createLlmPort, DEFAULT_BUDGET } from '@refund/ai';
import {
  type ClassificationInput,
  claimAnalysis,
  type Db,
  findAnalysis,
  findingRow,
  type RunOutcome,
  saveRun,
} from '@refund/db';
import type { CivilDate, Finding } from '@refund/engine';
import { article as lawArticle } from '@refund/law';
import {
  type AnalysisEvent,
  type Classification,
  type PipelineResult,
  runAnalysis,
} from '@refund/pipeline';
import type { FinancialProvider } from '@refund/sources';
import type { Capabilities } from '../capabilities.ts';
import type { Secrets } from '../crypto.ts';
import { entitlementsWith } from '../entitlements.ts';
import { logger } from '../log.ts';
import { largestRuleId, serializeFinding } from '../plans/serialize.ts';
import { buildLiveInput } from './input.ts';

// The live run (ADR-007): claim → the real pipeline at the instant pace → paywall serialization → ONE transaction with
// the findings, the classifications and the whole event log. The SSE route then plays the log at a human pace, so a
// reload or a second tab reads the same events and nothing is computed twice.

export interface RunDeps {
  db: Db;
  secrets: Secrets;
  caps: Capabilities;
  today: CivilDate;
  pluggy: FinancialProvider | null;
}

const NO_DATA: Extract<AnalysisEvent, { type: 'error' }> = {
  type: 'error',
  code: 'NO_DATA',
  message: 'Não encontramos transações nas contas conectadas. Conecte uma conta e tente de novo.',
  recoverable: false,
};

const confidenceBp = (c: number): number => Math.min(1000, Math.max(0, Math.round(c * 1000)));

function classificationRows(
  list: readonly Classification[],
  ids: ReadonlyMap<string, string>,
): ClassificationInput[] {
  const out: ClassificationInput[] = [];
  for (const c of list) {
    const transactionId = ids.get(c.transactionId);
    if (transactionId === undefined) continue;
    out.push({
      transactionId,
      category: c.category,
      confidenceBp: confidenceBp(c.confidence),
      origin: c.origin,
      ruleId: c.ruleId?.slice(0, 40) ?? null,
      reason: c.reason.slice(0, 300),
      status: c.status,
    });
  }
  return out;
}

async function drain(
  gen: AsyncGenerator<AnalysisEvent, PipelineResult, void>,
): Promise<{ events: AnalysisEvent[]; result: PipelineResult }> {
  const events: AnalysisEvent[] = [];
  for (;;) {
    const next = await gen.next();
    if (next.done) return { events, result: next.value };
    events.push(next.value);
  }
}

/**
 * Runs the analysis if this caller can claim it. Returns false when another instance has it (or it already ran):
 * the caller then only reads the event log.
 */
export async function executeAnalysis(analysisId: string, deps: RunDeps): Promise<boolean> {
  if (!(await claimAnalysis(deps.db, analysisId))) return false;
  const analysis = await findAnalysis(deps.db, analysisId);
  if (!analysis) return false;
  try {
    const built = await buildLiveInput(analysis, deps);
    if (!built.ok) {
      await saveRun(deps.db, analysisId, {
        ...emptyRun('error'),
        error: { code: NO_DATA.code, message: NO_DATA.message },
        events: [{ seq: 1, type: 'error', payload: NO_DATA }],
      });
      return true;
    }
    const { input, ids } = built.value;
    const { events, result } = await drain(
      runAnalysis(input, {
        llm: deps.caps.ai
          ? createLlmPort({ mode: 'gateway', budget: DEFAULT_BUDGET })
          : createLlmPort({ mode: 'template' }),
        article: (id) => {
          const a = lawArticle(id);
          return a === undefined ? undefined : { id: a.id, label: a.label, text: a.text };
        },
        clock: { today: () => deps.today, now: () => Date.now() },
        pace: 'instant',
      }),
    );
    const outcome = await outcomeOf(analysisId, analysis.userId, events, result, ids, deps.db);
    // false: another instance finished it first (its log stands; nothing to report here).
    if (!(await saveRun(deps.db, analysisId, outcome))) return true;
    logger.info('analysis.completed', {
      status: outcome.status,
      findings: outcome.findings.length,
      transactions: result.metrics.transactions,
    });
    return true;
  } catch (err) {
    logger.error('analysis.failed', { error: err });
    const failed: Extract<AnalysisEvent, { type: 'error' }> = {
      type: 'error',
      code: 'ANALYSIS_FAILED',
      message: 'A análise parou no meio. Tente de novo em instantes.',
      recoverable: false,
    };
    await saveRun(deps.db, analysisId, {
      ...emptyRun('error'),
      error: { code: failed.code, message: failed.message },
      events: [{ seq: 1, type: 'error', payload: failed }],
    });
    return true;
  }
}

function emptyRun(status: RunOutcome['status']): RunOutcome {
  return {
    status,
    engineVersion: null,
    parametersVersion: null,
    parametersHash: null,
    inputsHash: null,
    total: null,
    metrics: { transactions: 0, byOrigin: {}, durationMs: 0 },
    error: null,
    findings: [],
    classifications: [],
    events: [],
  };
}

/** Serializes every finding with the user's plan BEFORE it is written to the log (ARCHITECTURE §8.3). */
async function outcomeOf(
  analysisId: string,
  userId: string,
  events: readonly AnalysisEvent[],
  result: PipelineResult,
  ids: ReadonlyMap<string, string>,
  db: Db,
): Promise<RunOutcome> {
  const { ent } = await entitlementsWith(db, userId);
  const engine = result.engineResult;
  const engineFindings: Finding[] = engine?.findings ?? [];
  const largest = largestRuleId(engineFindings);
  const rowIds = new Map(engineFindings.map((f) => [f.ruleId, randomUUID()]));
  const explanationOf = (ruleId: string) => {
    const e = result.explanations[ruleId];
    return e ? { text: e.text, origin: e.origin } : null;
  };
  const dto = (f: Finding) =>
    serializeFinding(f, {
      ent,
      isLargest: f.ruleId === largest,
      id: rowIds.get(f.ruleId) ?? f.ruleId,
      explanation: explanationOf(f.ruleId),
    });
  const byRule = new Map(engineFindings.map((f) => [f.ruleId, f]));
  const wire: RunOutcome['events'] = [];
  for (const e of events) {
    if (e.type === 'ping') continue;
    let payload: AnalysisEvent = e;
    if (e.type === 'finding' || e.type === 'alert') {
      const full = byRule.get(e.finding.ruleId);
      if (full) payload = { ...e, finding: dto(full) };
      else {
        // Not in the engine result (never expected): send no trace and no recovery list (code review E14, L6).
        const { recoveryItems: _items, ...rest } = e.finding;
        payload = { ...e, finding: { ...rest, trace: null, traceLocked: true } };
      }
    }
    wire.push({ seq: wire.length + 1, type: e.type, payload });
  }
  const end = events.findLast((e) => e.type === 'end');
  const failed = engine === null ? events.findLast((e) => e.type === 'error') : undefined;
  return {
    status:
      failed !== undefined
        ? 'error'
        : end?.type === 'end' && end.status === 'awaiting_confirmation'
          ? 'awaiting_confirmation'
          : 'completed',
    engineVersion: engine?.engineVersion ?? null,
    parametersVersion: engine?.parametersVersion ?? null,
    parametersHash: engine?.parametersHash ?? null,
    inputsHash: engine?.inputsHash ?? null,
    total: engine?.total ?? null,
    metrics: result.metrics,
    error:
      failed?.type === 'error'
        ? {
            code: failed.code,
            message: failed.message,
            ...(failed.stage ? { stage: failed.stage } : {}),
          }
        : null,
    findings: engineFindings.map((f) => ({
      ...findingRow(analysisId, f, explanationOf(f.ruleId)),
      id: rowIds.get(f.ruleId) ?? randomUUID(),
    })),
    classifications: classificationRows(result.classifications, ids),
    events: wire,
  };
}
