import 'server-only';
import { type Db, latestAnalysis } from '@refund/db';
import { estimateStop } from '@/features/company/scope.ts';
import { estimateFor } from '../company/lookup.ts';
import { completeAnswers } from '../company/profile.ts';
import { activePlanWith } from '../entitlements.ts';
import type { TrackSnapshot } from '../track/state.ts';

// D58 (PLAN §18, 21/11): the server side of the ROI offer. The terms come from the catalog; the savings basis is the
// latest confirmed total or, before any analysis, the estimate's minimum (never the maximum).

/** The offer is for the free plan only: anyone with a paid plan (or the validation offer) never sees it. */
export async function offerShown(db: Db, userId: string): Promise<boolean> {
  return (await activePlanWith(db, userId)).plan === 'free';
}

export type RoiBasis = { kind: 'confirmed' | 'estimate'; cents: number };

/** The range's minimum of the track's estimate, or null (no company, no revenue answer, a stop, no range). */
export function estimateMinimum(track: TrackSnapshot, nowMs?: number): number | null {
  const { company, progress } = track;
  if (!company || progress.answers.monthlyRevenueBracket === undefined) return null;
  if (estimateStop(company.company) !== null) return null;
  const r = estimateFor(company.company, completeAnswers(progress.answers), nowMs);
  if (!r.ok || r.value.type !== 'range') return null;
  return r.value.total[0];
}

/** The plans page headline: the latest analysis's confirmed total when there is one, else the estimate's minimum. */
export async function roiBasis(
  db: Db,
  userId: string,
  track: TrackSnapshot,
): Promise<RoiBasis | null> {
  const last = await latestAnalysis(db, userId);
  const confirmed = last?.total?.byConfidence.confirmed ?? 0;
  if (confirmed > 0) return { kind: 'confirmed', cents: confirmed };
  const min = estimateMinimum(track);
  return min !== null && min > 0 ? { kind: 'estimate', cents: min } : null;
}
