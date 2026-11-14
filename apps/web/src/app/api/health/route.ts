import { basicHealth } from '@/lib/health.ts';

export const dynamic = 'force-dynamic';

export function GET(): Response {
  const health = basicHealth({
    VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA,
    VERCEL_ENV: process.env.VERCEL_ENV,
    REFUND_BUILT_AT: process.env.REFUND_BUILT_AT,
  });
  return Response.json(health, { headers: { 'Cache-Control': 'no-store' } });
}
