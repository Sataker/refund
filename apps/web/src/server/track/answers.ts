import 'server-only';
import type { Db } from '@refund/db';
import { z } from 'zod';
import { regimeStop } from '@/features/company/scope.ts';
import { nextAfter, type Step, stepPath } from '@/features/track/steps.ts';
import { type ActionResult, fail, ok } from '../result.ts';
import { trackLimit } from './limits.ts';
import { loadTrack, setAssumption, TRACK_KEYS, type TrackKey, unlinkCompany } from './state.ts';

// Track answers (IDENTITY-AND-UI §5 "First-access track"): each tap saves on the server and returns
// where to go next, so a user who leaves resumes at the right step (ARCHITECTURE §13).

export interface Next {
  next: string;
}

export const answerInput = z.discriminatedUnion('step', [
  z.object({
    step: z.literal('faturamento'),
    value: z.enum([
      'up_to_15k',
      'from_15k_to_30k',
      'from_30k_to_60k',
      'from_60k_to_150k',
      'from_150k_to_300k',
      'from_300k_to_400k',
      'above_400k',
      'dont_know',
    ]),
  }),
  z.object({ step: z.literal('funcionarios'), value: z.enum(['yes', 'no', 'dont_know']) }),
  z.object({
    step: z.literal('exterior'),
    value: z.enum(['no', 'less_than_half', 'half_or_more', 'dont_know']),
  }),
]);

const KEY_OF: Record<z.infer<typeof answerInput>['step'], TrackKey> = {
  faturamento: TRACK_KEYS.revenue,
  funcionarios: TRACK_KEYS.employees,
  exterior: TRACK_KEYS.abroad,
};

const NO_COMPANY = 'Comece pelo CNPJ da sua empresa.';

async function nextOf(db: Db, userId: string, step: Step): Promise<Next> {
  const { progress } = await loadTrack(db, userId);
  return { next: stepPath(nextAfter(step, progress)) };
}

export async function saveAnswerWith(
  db: Db,
  userId: string,
  input: unknown,
  nowMs?: number,
): Promise<ActionResult<Next>> {
  const limited = await trackLimit(db, userId, nowMs);
  if (!limited.ok) return limited;
  const parsed = answerInput.safeParse(input);
  if (!parsed.success) return fail('INVALID_INPUT', 'Escolha uma das opções.');
  const { company, progress } = await loadTrack(db, userId);
  if (!company || !progress.company?.confirmed) return fail('FORBIDDEN', NO_COMPANY);
  const { step, value } = parsed.data;
  if (
    (step === 'funcionarios' && !progress.questions?.employees) ||
    (step === 'exterior' && !progress.questions?.abroad)
  ) {
    return fail('INVALID_INPUT', 'Essa pergunta não vale para a sua empresa.');
  }
  await setAssumption(db, userId, company.id, KEY_OF[step], value);
  return ok(await nextOf(db, userId, step));
}

/** "Sou eu". */
export async function confirmCompanyWith(
  db: Db,
  userId: string,
  nowMs?: number,
): Promise<ActionResult<Next>> {
  const limited = await trackLimit(db, userId, nowMs);
  if (!limited.ok) return limited;
  const { company } = await loadTrack(db, userId);
  if (!company) return fail('FORBIDDEN', NO_COMPANY);
  // H3: a company outside the Simples/MEI stops here (the page shows why and the ways out).
  const stop = regimeStop(company.company);
  if (stop !== null) return fail('FORBIDDEN', stop.message);
  await setAssumption(db, userId, company.id, TRACK_KEYS.confirmed, true);
  return ok(await nextOf(db, userId, 'confirmar-empresa'));
}

/** "Não é minha empresa": back to the CNPJ step. */
export async function rejectCompanyWith(
  db: Db,
  userId: string,
  nowMs?: number,
): Promise<ActionResult<Next>> {
  const limited = await trackLimit(db, userId, nowMs);
  if (!limited.ok) return limited;
  await unlinkCompany(db, userId);
  return ok({ next: stepPath('cnpj') });
}

/** [Ver o número exato →] on the estimate (the estimate was shown before asking for the bank). */
export async function markEstimateSeenWith(
  db: Db,
  userId: string,
  nowMs?: number,
): Promise<ActionResult<Next>> {
  const limited = await trackLimit(db, userId, nowMs);
  if (!limited.ok) return limited;
  const { company, progress } = await loadTrack(db, userId);
  if (!company || progress.answers.monthlyRevenueBracket === undefined) {
    return fail('FORBIDDEN', 'Responda o faturamento para ver a estimativa.');
  }
  await setAssumption(db, userId, company.id, TRACK_KEYS.estimateSeen, true);
  return ok(await nextOf(db, userId, 'estimativa'));
}

/** "Pular: só a PJ" (Screen 3: the pró-labore stays estimated). Requires the PJ account. */
export async function skipPersonalAccountWith(
  db: Db,
  userId: string,
  nowMs?: number,
): Promise<ActionResult<Next>> {
  const limited = await trackLimit(db, userId, nowMs);
  if (!limited.ok) return limited;
  const { company, progress } = await loadTrack(db, userId);
  if (!company || progress.pj?.status !== 'active') {
    return fail('FORBIDDEN', 'Conecte a conta da empresa primeiro.');
  }
  await setAssumption(db, userId, company.id, TRACK_KEYS.pfSkipped, true);
  return ok(await nextOf(db, userId, 'conta-pf'));
}
