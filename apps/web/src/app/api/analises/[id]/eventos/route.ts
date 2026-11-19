import { findOwnedAnalysis } from '@refund/db';
import { z } from 'zod';
import { executeAnalysis } from '@/server/analysis/run.ts';
import { abortableWait, sseStream } from '@/server/analysis/sse.ts';
import { replayFrames, SSE_HEADERS } from '@/server/analysis/stream.ts';
import { todayBrt } from '@/server/company/profile.ts';
import { pluggyProvider } from '@/server/financial/availability.ts';
import { liveContext } from '@/server/live.ts';
import { logger } from '@/server/log.ts';

// ARCHITECTURE §4.8 `GET /api/analises/[id]/eventos` (ADR-007): only the session that owns the analysis. A `pending`
// analysis is claimed and run here (one instance: `UPDATE … WHERE status='pending'`); then the persisted log is
// played from `Last-Event-ID`. `?from=n` = events the tab already rendered (sent at once after a reload).
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const ids = z.object({ id: z.uuid() });
const seqParam = z.coerce.number().int().min(0).max(1_000_000).catch(0);

function problem(status: number, code: string, message: string): Response {
  return Response.json(
    { error: { code, message } },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const parsed = ids.safeParse(await params);
  if (!parsed.success) return problem(404, 'NOT_FOUND', 'Análise não encontrada.');
  const ctx = await liveContext();
  if (!ctx.ok)
    return problem(
      ctx.error.code === 'UNAUTHENTICATED' ? 401 : 503,
      ctx.error.code,
      ctx.error.message,
    );
  const { db, userId, secrets, caps } = ctx.value;
  const analysis = await findOwnedAnalysis(db, userId, parsed.data.id);
  if (!analysis) return problem(404, 'NOT_FOUND', 'Análise não encontrada.');

  const url = new URL(request.url);
  const after = seqParam.parse(
    request.headers.get('last-event-id') ?? url.searchParams.get('after') ?? 0,
  );
  const instantUntil = Math.max(after, seqParam.parse(url.searchParams.get('from') ?? 0));
  const signal = request.signal;
  const startedAt = Date.now();

  const stream = sseStream(signal, async function* () {
    if (analysis.status === 'pending' || analysis.status === 'running') {
      try {
        await executeAnalysis(analysis.id, {
          db,
          secrets,
          caps,
          today: todayBrt(),
          pluggy: pluggyProvider(caps, secrets),
        });
      } catch (err) {
        logger.error('analysis.stream_run_failed', { error: err });
      }
    }
    yield* replayFrames({
      db,
      analysisId: analysis.id,
      after,
      instantUntil,
      wait: abortableWait(signal),
      aborted: () => signal.aborted,
      deadlineMs: startedAt + 280_000,
    });
  });
  return new Response(stream, { headers: SSE_HEADERS });
}
