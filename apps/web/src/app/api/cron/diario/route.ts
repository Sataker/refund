import { capabilities } from '@/server/capabilities.ts';
import { cronAuthorized, runDailyCron } from '@/server/cron/daily.ts';
import { serverSecrets } from '@/server/crypto.ts';
import { getDb } from '@/server/db.ts';
import { readEnv } from '@/server/env.ts';
import { pluggyProvider } from '@/server/financial/availability.ts';
import { logger } from '@/server/log.ts';

// ARCHITECTURE §4.8 `GET /api/cron/diario`: `Authorization: Bearer ${CRON_SECRET}` (sent by Vercel Cron, vercel.ts).
// Without CRON_SECRET every call is 401 (the backup deployment). LGPD cleanup, heartbeat, Pluggy revoke retry,
// snapshot TTL, consent expiry, subscription expiry (§9.6, §10.4).
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const json = (status: number, body: unknown) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request: Request): Promise<Response> {
  if (!cronAuthorized(request.headers.get('authorization'), readEnv().values.CRON_SECRET))
    return json(401, { error: { code: 'UNAUTHENTICATED', message: 'Não autorizado.' } });
  const secrets = serverSecrets();
  const handle = secrets ? await getDb().catch(() => null) : null;
  if (!secrets || !handle)
    return json(503, {
      error: { code: 'NOT_CONFIGURED', message: 'Banco de dados indisponível.' },
    });
  const caps = capabilities();
  const report = await runDailyCron({
    db: handle.db,
    secrets,
    caps,
    pluggy: pluggyProvider(caps, secrets),
  });
  logger.info('cron.daily', { ...report.cleaned, ...report.expired, failed: report.failed.length });
  return json(report.failed.length === 0 ? 200 : 500, report);
}
