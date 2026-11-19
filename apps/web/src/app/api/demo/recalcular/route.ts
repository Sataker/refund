import { z } from 'zod';
import { recalculateDemo } from '@/demo/recalculate.ts';
import { ipKey, memoryRateLimit } from '@/server/rate-limit.ts';

// Screen 7 on /demo (EXECUTION §9, 16/11): `POST /api/demo/recalcular` runs the persona's real pipeline again with
// the visitor's card answers and returns the dashboard model. Nothing is stored (ARCHITECTURE §4.7 note: /demo has
// no writing server action); zero env, no database, no external call.
export const dynamic = 'force-dynamic';

const body = z.object({
  persona: z.string().min(1).max(64),
  choices: z
    .record(z.string().max(64), z.string().max(32))
    .refine((r) => Object.keys(r).length <= 32),
});

function problem(status: number, code: string, message: string, extra?: HeadersInit): Response {
  return Response.json(
    { error: { code, message } },
    { status, headers: { 'Cache-Control': 'no-store', ...extra } },
  );
}

export async function POST(request: Request): Promise<Response> {
  if (
    !memoryRateLimit({ key: ipKey('demo-recalc', request.headers), limit: 120, windowMs: 60_000 })
  )
    return problem(429, 'RATE_LIMITED', 'Muitas respostas em pouco tempo. Espere um minuto.', {
      'Retry-After': '60',
    });
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return problem(400, 'INVALID_INPUT', 'Respostas inválidas.');
  }
  const parsed = body.safeParse(json);
  if (!parsed.success) return problem(400, 'INVALID_INPUT', 'Respostas inválidas.');
  try {
    const r = await recalculateDemo(parsed.data.persona, parsed.data.choices);
    if (!r.ok)
      return r.error === 'UNKNOWN_PERSONA'
        ? problem(404, 'PERSONA_NOT_FOUND', 'Essa persona não existe na demo.')
        : problem(500, 'ANALYSIS_FAILED', 'Não conseguimos recalcular agora. Tente de novo.');
    return Response.json(r.value, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return problem(500, 'ANALYSIS_FAILED', 'Não conseguimos recalcular agora. Tente de novo.');
  }
}
