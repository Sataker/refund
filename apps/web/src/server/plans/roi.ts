import 'server-only';
import { type Db, schema } from '@refund/db';
import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import { estimateStop } from '@/features/company/scope.ts';
import { type DataOrigin, isExampleBank } from '@/features/live/data-origin';
import type { RoiBasis } from '@/features/plans/roi.ts';
import { analysisBankSource } from '../analysis/read.ts';
import { estimateFor } from '../company/lookup.ts';
import { completeAnswers } from '../company/profile.ts';
import { HERO_CNPJ } from '../company/replay-companies.ts';
import { activePlanWith } from '../entitlements.ts';
import type { TrackSnapshot } from '../track/state.ts';

// D58 (PLAN §18, 21/11): the server side of the ROI offer. The savings basis is the latest completed analysis of the
// company now linked or, only when there is none, the estimate's minimum (never the maximum).

/** The offer is for the free plan only: anyone with a paid plan (or the validation offer) never sees it. */
export async function offerShown(db: Db, userId: string): Promise<boolean> {
  return (await activePlanWith(db, userId)).plan === 'free';
}

/** The range's minimum of the track's estimate, or null (no company, no revenue answer, a stop, no range). */
export function estimateMinimum(track: TrackSnapshot, nowMs?: number): number | null {
  const { company, progress } = track;
  if (!company || progress.answers.monthlyRevenueBracket === undefined) return null;
  if (estimateStop(company.company) !== null) return null;
  const r = estimateFor(company.company, completeAnswers(progress.answers), nowMs);
  if (!r.ok || r.value.type !== 'range') return null;
  return r.value.total[0];
}

/** Statuses of a run that ended with a total (D36: open cards leave it awaiting confirmation, total included). */
const ENDED = ['completed', 'awaiting_confirmation'] as const;

/**
 * The plans page headline's basis. A completed analysis of the linked company wins, with its own origin (read.ts):
 * nothing confirmed there means no claim, never a fall back to the estimate. Only without any such analysis does the
 * estimate's minimum lead.
 */
export async function roiBasis(
  db: Db,
  userId: string,
  track: TrackSnapshot,
  nowMs?: number,
): Promise<RoiBasis | null> {
  const { company } = track;
  if (!company) return null;
  const { analyses } = schema;
  const [last] = await db
    .select()
    .from(analyses)
    .where(
      and(
        eq(analyses.userId, userId),
        eq(analyses.companyId, company.id),
        inArray(analyses.status, [...ENDED]),
        isNotNull(analyses.total),
      ),
    )
    .orderBy(desc(analyses.createdAt))
    .limit(1);
  if (last) {
    const confirmed = last.total?.byConfidence.confirmed ?? 0;
    if (confirmed <= 0) return null;
    const c = company.company;
    const origin: DataOrigin = {
      companySynthetic: c.source === 'persona' || c.source === 'replay',
      companyIsSample: c.cnpj === HERO_CNPJ,
      bank: await analysisBankSource(db, last),
    };
    return { kind: 'confirmed', cents: confirmed, example: isExampleBank(origin) };
  }
  const min = estimateMinimum(track, nowMs);
  return min !== null && min > 0 ? { kind: 'estimate', cents: min, example: false } : null;
}
