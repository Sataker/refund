import { type AnalysisEvent, toSseFrame } from '@refund/pipeline';
import { z } from 'zod';
import { demoAnalysis } from '@/demo/analysis.ts';
import { demoPersona } from '@/demo/catalog.ts';
import { ipKey, memoryRateLimit } from '@/server/rate-limit.ts';

// ARCHITECTURE §4.8 `GET /api/demo/analise?persona=&pace=` and §4.6 (wire format; ADR-007): the personas'
// analysis as SSE, with no database and no variable. The pipeline really runs; `pace` only changes the
// interval between events (REVISAO B9). No persistence: a reconnection restarts at the instant pace and the
// client skips the ids it already has (§4.6, "Demo").
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PING_MS = 15_000;

const query = z.object({
  persona: z.string().min(1).max(64),
  pace: z.enum(['instant', 'fast', 'scripted']).default('scripted'),
  accounts: z.enum(['all', 'pj']).default('all'),
  session: z
    .string()
    .regex(/^[\w-]{1,64}$/)
    .optional(),
});

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  'X-Accel-Buffering': 'no',
};

function problem(status: number, code: string, message: string, extra?: HeadersInit): Response {
  return Response.json(
    { error: { code, message } },
    { status, headers: { 'Cache-Control': 'no-store', ...extra } },
  );
}

/** A wait that ends early when the visitor leaves (the pipeline then stops at the next event). */
function abortableWait(signal: AbortSignal) {
  return (ms: number) =>
    new Promise<void>((resolve) => {
      if (signal.aborted) return resolve();
      const timer = setTimeout(done, ms);
      function done() {
        clearTimeout(timer);
        signal.removeEventListener('abort', done);
        resolve();
      }
      signal.addEventListener('abort', done, { once: true });
    });
}

export async function GET(request: Request): Promise<Response> {
  if (
    !memoryRateLimit({ key: ipKey('demo-analysis', request.headers), limit: 30, windowMs: 60_000 })
  )
    return problem(
      429,
      'RATE_LIMITED',
      'Muitas análises em pouco tempo. Espere um minuto e tente de novo.',
      { 'Retry-After': '60' },
    );

  const params = query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!params.success) return problem(400, 'INVALID_INPUT', 'Parâmetros inválidos.');
  const persona = demoPersona(params.data.persona);
  if (!persona) return problem(404, 'PERSONA_NOT_FOUND', 'Essa persona não existe na demo.');

  const signal = request.signal;
  const generator = await demoAnalysis(persona, {
    accounts: params.data.accounts,
    pace: params.data.pace,
    wait: abortableWait(signal),
    sessionId: params.data.session ?? 'anon',
  });
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let seq = 0;
      let closed = false;
      const send = (text: string) => {
        if (!closed) controller.enqueue(encoder.encode(text));
      };
      const ping = setInterval(() => send(': ping\n\n'), PING_MS);
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        controller.close();
      };
      signal.addEventListener('abort', () => {
        void generator.return(undefined as never);
        close();
      });
      // Opens the stream right away (first SSE byte ≤ 300 ms, ARCHITECTURE §11.1).
      send(': ok\n\n');
      try {
        for (;;) {
          const next = await generator.next();
          if (next.done || signal.aborted) break;
          seq += 1;
          send(toSseFrame(next.value, seq));
        }
      } catch {
        const failure: AnalysisEvent = {
          type: 'error',
          code: 'ANALYSIS_FAILED',
          message: 'A análise parou no meio. Mostramos o que já achamos; tente de novo.',
          recoverable: false,
        };
        seq += 1;
        send(toSseFrame(failure, seq));
      }
      close();
    },
    cancel() {
      void generator.return(undefined as never);
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
