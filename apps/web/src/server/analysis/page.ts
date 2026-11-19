import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { currentStep, stepPath } from '@/features/track/steps.ts';
import { type LiveContext, liveContext } from '../live.ts';
import { loadTrack } from '../track/state.ts';
import { type LiveAnalysis, loadLiveAnalysis } from './read.ts';

// The /app/analises/[id] pages: session, ownership and the shell lock (ARCHITECTURE §13, live: checked in the
// analysis layout from the anonymous session state). Memoized per request, so the layout and the page read once.

export type LivePage =
  | { kind: 'off'; message: string }
  | { kind: 'ok'; ctx: LiveContext; live: LiveAnalysis };

export const livePage = cache(async (id: string): Promise<LivePage> => {
  const ctx = await liveContext();
  if (!ctx.ok) return { kind: 'off', message: ctx.error.message };
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { progress } = await loadTrack(ctx.value.db, ctx.value.userId);
  const step = currentStep(progress);
  if (step !== 'done') redirect(stepPath(step) as never);
  const live = await loadLiveAnalysis(ctx.value.db, ctx.value.userId, id);
  if (!live) notFound();
  return { kind: 'ok', ctx: ctx.value, live };
});

/** Shell routes wait for the run: while it is pending or running they send the user to Screen 4. */
export async function shellPage(id: string): Promise<LivePage> {
  const page = await livePage(id);
  if (
    page.kind === 'ok' &&
    (page.live.analysis.status === 'pending' || page.live.analysis.status === 'running')
  )
    redirect(`/app/analises/${id}` as never);
  return page;
}
