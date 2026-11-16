import { waitUntil } from '@vercel/functions';
import { capabilities } from '@/server/capabilities.ts';
import { serverSecrets } from '@/server/crypto.ts';
import { getDb } from '@/server/db.ts';
import { readEnv } from '@/server/env.ts';
import { pluggyProvider } from '@/server/financial/availability.ts';
import { logger } from '@/server/log.ts';
import { pluggyVerifier, processPluggyEvent } from '@/server/webhooks/pluggy.ts';
import { receiveWebhook } from '@/server/webhooks/types.ts';

// ARCHITECTURE §4.8: Pluggy `item/*` and `transactions/*`; 200 in < 1 s, sync in waitUntil.

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request): Promise<Response> {
  const env = readEnv().values;
  const secrets = serverSecrets();
  const verifier = pluggyVerifier({
    secret: env.PLUGGY_WEBHOOK_SECRET,
    clientId: env.PLUGGY_CLIENT_ID,
  });
  let handle: Awaited<ReturnType<typeof getDb>> = null;
  try {
    handle = secrets ? await getDb() : null;
  } catch (err) {
    logger.error('webhook.error', { provider: 'pluggy', error: err });
    return Response.json({ ok: false }, { status: 500 });
  }
  if (!secrets || !handle) {
    // Nothing to write to: same answer as an unknown sender (Pluggy does not retry on 4xx).
    return Response.json({ ok: false }, { status: 401 });
  }
  const db = handle.db;
  const provider = pluggyProvider(capabilities(), secrets);
  return receiveWebhook(verifier, req, { db, defer: waitUntil }, (ev) =>
    processPluggyEvent(ev, { db, secrets, provider }),
  );
}
