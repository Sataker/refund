import { healthReport } from '@/server/health.ts';
import { ipKey, memoryRateLimit } from '@/server/rate-limit.ts';

// ARCHITECTURE §4.8 and §10.2. `?deep=1` touches the database (SELECT + UPDATE system_heartbeat) and is
// limited to 30/min per IP in memory; the basic check never opens the database.
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(request: Request): Promise<Response> {
  const deep = new URL(request.url).searchParams.get('deep') === '1';
  if (
    deep &&
    !memoryRateLimit({ key: ipKey('health', request.headers), limit: 30, windowMs: 60_000 })
  ) {
    return Response.json(
      { status: 'failed', error: { code: 'RATE_LIMITED' } },
      { status: 429, headers: { ...NO_STORE, 'Retry-After': '60' } },
    );
  }
  const { httpStatus, body } = await healthReport({ deep });
  return Response.json(body, { status: httpStatus, headers: NO_STORE });
}
