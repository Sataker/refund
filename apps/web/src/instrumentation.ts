import type { Instrumentation } from 'next';

// ARCHITECTURE §10.1: every unhandled server error becomes one redacted `level:'error'` JSON line with
// the route and the digest (and a row in refund.system_events when the database is already open).
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { logger } = await import('@/server/log.ts');
  const digest =
    typeof err === 'object' && err !== null && 'digest' in err ? String(err.digest) : undefined;
  logger.error(
    'request.error',
    {
      error: err,
      digest,
      method: request.method,
      routeType: context.routeType,
      routePath: context.routePath,
    },
    {
      route: request.path.split('?')[0],
      requestId: headerValue(request.headers['x-vercel-id']),
    },
  );
};

function headerValue(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
