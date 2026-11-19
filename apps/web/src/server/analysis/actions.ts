import 'server-only';
import {
  analysisEventsAfter,
  createAnalysis,
  type Db,
  findOwnedAnalysis,
  schema,
  setExcludedTransactions,
  setFindingStatus,
} from '@refund/db';
import type { CivilDate } from '@refund/engine';
import type { AnalysisEvent, ConfirmationQuestion, QuestionAnswer } from '@refund/pipeline';
import { validateCnpj } from '@refund/sources';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { currentStep } from '@/features/track/steps.ts';
import { consumeQuotaWith, entitlementsWith } from '../entitlements.ts';
import { liveAnalysesPerMonth } from '../plans/catalog.ts';
import { rateLimit } from '../rate-limit.ts';
import { type ActionResult, fail, ok } from '../result.ts';
import { trackLimit } from '../track/limits.ts';
import { loadTrack } from '../track/state.ts';
import { ANSWER_PREFIX, previousMonth } from './input.ts';

// Live analysis actions (ARCHITECTURE §4.7): after getSession → requireCapability (liveContext, in actions.ts), each
// core runs rateLimit → requireEntitlement/quota → zod, and returns a Result. Ownership is always by session.

const { userAssumptions, findings, analyses } = schema;

export interface AnalysisDeps {
  db: Db;
  userId: string;
  today: CivilDate;
  nowMs?: number;
}

const DAY_MS = 24 * 60 * 60_000;
/** ARCHITECTURE §9.4: startAnalysis 10/day per user, before the plan quota. */
export const START_RATE = { limit: 10, windowMs: DAY_MS } as const;
/** Re-running after card answers (not in §9.4): it costs a pipeline run, not a new analysis of the month. */
export const REANALYZE_RATE = { limit: 30, windowMs: DAY_MS } as const;

const NOT_FOUND = 'Análise não encontrada.';
const TRACK_OPEN = 'Termine o primeiro acesso (empresa e contas) antes da análise.';

export const startInput = z.object({ companyCnpj: z.string().min(14).max(18) });

export async function startAnalysisWith(
  input: unknown,
  deps: AnalysisDeps,
): Promise<ActionResult<{ analysisId: string }>> {
  const { db, userId } = deps;
  const limited = await rateLimit({ key: `analysis:u:${userId}`, ...START_RATE }, db, deps.nowMs);
  if (!limited.ok) return limited;
  const parsed = startInput.safeParse(input);
  if (!parsed.success) return fail('INVALID_INPUT', 'CNPJ inválido.');
  const cnpj = validateCnpj(parsed.data.companyCnpj);
  if (!cnpj.ok) return fail('INVALID_INPUT', 'CNPJ inválido.');
  const { company, progress } = await loadTrack(db, userId);
  if (!company || company.company.cnpj !== cnpj.value) return fail('FORBIDDEN', TRACK_OPEN);
  if (currentStep(progress) !== 'done') return fail('FORBIDDEN', TRACK_OPEN);
  const { plan } = await entitlementsWith(db, userId);
  const quota = await consumeQuotaWith(
    db,
    userId,
    'live_analyses_month',
    liveAnalysesPerMonth(plan),
    1,
    deps.nowMs,
  );
  if (!quota.ok) return quota;
  const row = await createAnalysis(db, {
    userId,
    companyId: company.id,
    referenceMonth: previousMonth(deps.today),
  });
  return ok({ analysisId: row.id });
}

export const analysisIdInput = z.object({ analysisId: z.uuid() });

/** After card answers: a new run of the same company (the answers are stored per user + company). */
export async function reanalyzeWith(
  input: unknown,
  deps: AnalysisDeps,
): Promise<ActionResult<{ analysisId: string }>> {
  const { db, userId } = deps;
  const limited = await rateLimit(
    { key: `reanalyze:u:${userId}`, ...REANALYZE_RATE },
    db,
    deps.nowMs,
  );
  if (!limited.ok) return limited;
  const parsed = analysisIdInput.safeParse(input);
  if (!parsed.success) return fail('INVALID_INPUT', NOT_FOUND);
  const base = await findOwnedAnalysis(db, userId, parsed.data.analysisId);
  if (!base) return fail('NOT_FOUND', NOT_FOUND);
  const row = await createAnalysis(db, {
    userId,
    companyId: base.companyId,
    referenceMonth: previousMonth(deps.today),
  });
  return ok({ analysisId: row.id });
}

/** The cards this analysis asked (its `question` events). */
export async function questionsOf(db: Db, analysisId: string): Promise<ConfirmationQuestion[]> {
  const rows = await analysisEventsAfter(db, analysisId, 0);
  return rows
    .filter((r) => r.type === 'question')
    .map((r) => (r.payload as Extract<AnalysisEvent, { type: 'question' }>).question);
}

const answerValue = z.union([
  z.enum(['yes', 'no', 'holder', 'dependent', 'distribution', 'pro_labore', 'pgbl', 'vgbl']),
  z.number().int().positive().max(100_000_000_00),
  z.object({ beneficiary: z.enum(['holder', 'dependent']), profession: z.string().max(80) }),
]);

export const answerInput = z.object({
  analysisId: z.uuid(),
  questionId: z
    .string()
    .min(1)
    .max(80 - ANSWER_PREFIX.length),
  answer: answerValue.nullable(),
});

/** `answer:<card id>`; user_assumptions keys hold 80 chars, so the card id may have 73 (`questionId` max). */
export function answerKey(questionId: string): string {
  return `${ANSWER_PREFIX}${questionId}`;
}

/** The answer must be one the card offers (or a typed amount on the pró-labore card, or the health pair). */
export function allowedAnswer(q: ConfirmationQuestion, value: QuestionAnswer['value']): boolean {
  if (typeof value === 'number') return q.type === 'monthly_pro_labore';
  if (typeof value === 'object') return q.options.some((o) => o.value === value.beneficiary);
  if (typeof value === 'boolean') return false;
  return q.options.some((o) => o.value === value);
}

async function saveAnswer(
  deps: AnalysisDeps,
  companyId: string,
  questionId: string,
  value: QuestionAnswer['value'] | null,
): Promise<void> {
  const key = answerKey(questionId);
  if (value === null) {
    await deps.db
      .delete(userAssumptions)
      .where(
        and(
          eq(userAssumptions.userId, deps.userId),
          eq(userAssumptions.companyId, companyId),
          eq(userAssumptions.key, key),
        ),
      );
    return;
  }
  // jsonb holds the object answers too (health: beneficiary + profession).
  const stored = value as unknown as number | string | boolean;
  await deps.db
    .insert(userAssumptions)
    .values({ userId: deps.userId, companyId, key, value: stored })
    .onConflictDoUpdate({
      target: [userAssumptions.userId, userAssumptions.companyId, userAssumptions.key],
      set: { value: stored, updatedAt: new Date() },
    });
}

export async function answerQuestionWith(
  input: unknown,
  deps: AnalysisDeps,
): Promise<ActionResult<{ reanalyze: boolean }>> {
  const limited = await trackLimit(deps.db, deps.userId, deps.nowMs);
  if (!limited.ok) return limited;
  const parsed = answerInput.safeParse(input);
  if (!parsed.success) return fail('INVALID_INPUT', 'Escolha uma das opções.');
  const analysis = await findOwnedAnalysis(deps.db, deps.userId, parsed.data.analysisId);
  if (!analysis) return fail('NOT_FOUND', NOT_FOUND);
  const q = (await questionsOf(deps.db, analysis.id)).find((x) => x.id === parsed.data.questionId);
  if (!q) return fail('NOT_FOUND', 'Essa pergunta não é desta análise.');
  const { answer } = parsed.data;
  if (answer !== null && !allowedAnswer(q, answer))
    return fail('INVALID_INPUT', 'Escolha uma das opções.');
  // Keyed by the card id, which is stable across runs, so the next run reads it back (loadAnswers).
  await saveAnswer(deps, analysis.companyId, q.id, answer);
  return ok({ reanalyze: true });
}

export const proLaboreInput = z.object({
  analysisId: z.uuid(),
  monthlyAmountCents: z.number().int().positive().max(100_000_000_00),
});

/** "Seu pró-labore bruto é R$ X?" answered with a typed amount (the `pro-labore-gross` card). */
export async function confirmProLaboreWith(
  input: unknown,
  deps: AnalysisDeps,
): Promise<ActionResult<{ reanalyze: boolean }>> {
  const parsed = proLaboreInput.safeParse(input);
  if (!parsed.success) return fail('INVALID_INPUT', 'Digite o valor bruto do pró-labore.');
  const analysis = await findOwnedAnalysis(deps.db, deps.userId, parsed.data.analysisId);
  if (!analysis) return fail('NOT_FOUND', NOT_FOUND);
  const q = (await questionsOf(deps.db, analysis.id)).find((x) => x.type === 'monthly_pro_labore');
  if (!q) return fail('NOT_FOUND', 'Esta análise não perguntou o pró-labore.');
  return answerQuestionWith(
    { analysisId: analysis.id, questionId: q.id, answer: parsed.data.monthlyAmountCents },
    deps,
  );
}

export const markInput = z.object({
  findingId: z.uuid(),
  status: z.enum(['marked', 'dismissed', 'new']),
});

export async function markFindingWith(
  input: unknown,
  deps: AnalysisDeps,
): Promise<ActionResult<void>> {
  const limited = await trackLimit(deps.db, deps.userId, deps.nowMs);
  if (!limited.ok) return limited;
  const parsed = markInput.safeParse(input);
  if (!parsed.success) return fail('INVALID_INPUT', 'Achado inválido.');
  const [row] = await deps.db
    .select({ analysisId: findings.analysisId })
    .from(findings)
    .innerJoin(analyses, eq(analyses.id, findings.analysisId))
    .where(and(eq(findings.id, parsed.data.findingId), eq(analyses.userId, deps.userId)))
    .limit(1);
  if (!row) return fail('NOT_FOUND', 'Achado não encontrado.');
  await setFindingStatus(deps.db, row.analysisId, parsed.data.findingId, parsed.data.status);
  return ok(undefined);
}

export const exclusionInput = z.object({
  analysisId: z.uuid(),
  excluded: z.array(z.string().min(1).max(26)).max(200),
});

/**
 * [D31] Stores the owner's Finanças exclusions. Only ids the view offers as a removal (`duplicateRemovals` of a
 * same-charge suspect, the same rule as /demo) are accepted; the analysis and its findings never change.
 */
export async function setFinanceExclusionsWith(
  input: unknown,
  deps: AnalysisDeps & { removable: (analysisId: string) => Promise<ReadonlySet<string>> },
): Promise<ActionResult<void>> {
  const limited = await trackLimit(deps.db, deps.userId, deps.nowMs);
  if (!limited.ok) return limited;
  const parsed = exclusionInput.safeParse(input);
  if (!parsed.success) return fail('INVALID_INPUT', 'Lançamento inválido.');
  const analysis = await findOwnedAnalysis(deps.db, deps.userId, parsed.data.analysisId);
  if (!analysis) return fail('NOT_FOUND', NOT_FOUND);
  const allowed = await deps.removable(analysis.id);
  if (!parsed.data.excluded.every((id) => allowed.has(id)))
    return fail('INVALID_INPUT', 'Esse lançamento não pode ser removido.');
  await setExcludedTransactions(deps.db, analysis.id, parsed.data.excluded);
  return ok(undefined);
}
