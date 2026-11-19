import { findOwnedReport } from '@refund/db';
import { z } from 'zod';
import { abortableWait, sseStream } from '@/server/analysis/sse.ts';
import { SSE_HEADERS } from '@/server/analysis/stream.ts';
import { liveContext } from '@/server/live.ts';
import { reportStatusFrames } from '@/server/report/report.ts';

// ARCHITECTURE §4.8 `GET /api/relatorios/[id]/status` (ADR-007): light SSE of the report status for the session that
// owns it, polling the database every 3 s for at most 5 minutes (the page reconnects after that).
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const ids = z.object({ id: z.uuid() });

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const notFound = () =>
    Response.json(
      { error: { code: 'NOT_FOUND', message: 'Relatório não encontrado.' } },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    );
  const parsed = ids.safeParse(await params);
  if (!parsed.success) return notFound();
  const ctx = await liveContext();
  if (!ctx.ok) return notFound();
  const { db, userId } = ctx.value;
  if (!(await findOwnedReport(db, userId, parsed.data.id))) return notFound();
  const signal = request.signal;
  const startedAt = Date.now();
  const stream = sseStream(signal, () =>
    reportStatusFrames({
      db,
      userId,
      reportId: parsed.data.id,
      wait: abortableWait(signal),
      aborted: () => signal.aborted,
      deadlineMs: startedAt + 290_000,
    }),
  );
  return new Response(stream, { headers: SSE_HEADERS });
}
