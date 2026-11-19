import { waitUntil } from '@vercel/functions';
import { capabilities } from '@/server/capabilities.ts';
import { serverSecrets } from '@/server/crypto.ts';
import { getDb } from '@/server/db.ts';
import { readEnv } from '@/server/env.ts';
import { lawProcessDeps } from '@/server/law/deps.ts';
import { processFirecrawlEvent } from '@/server/law/process.ts';
import { logger } from '@/server/log.ts';
import { firecrawlVerifier } from '@/server/webhooks/firecrawl.ts';
import { receiveWebhook } from '@/server/webhooks/types.ts';

// ARCHITECTURE §4.8: Firecrawl `monitor.page` and `monitor.check.completed`. 2xx within 10 s: the summary and the
// alert run in waitUntil. Off without FIRECRAWL_WEBHOOK_SECRET (capability `lawMonitor`): 401, like a bad signature.

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request): Promise<Response> {
  const caps = capabilities();
  const secrets = serverSecrets();
  if (!caps.lawMonitor || !secrets) return Response.json({ ok: false }, { status: 401 });
  let handle: Awaited<ReturnType<typeof getDb>> = null;
  try {
    handle = await getDb();
  } catch (err) {
    logger.error('webhook.error', { provider: 'firecrawl', error: err });
    return Response.json({ ok: false }, { status: 500 });
  }
  if (!handle) return Response.json({ ok: false }, { status: 401 });
  const db = handle.db;
  const verifier = firecrawlVerifier({ secret: readEnv().values.FIRECRAWL_WEBHOOK_SECRET });
  const deps = lawProcessDeps(db, secrets, caps);
  return receiveWebhook(verifier, req, { db, defer: waitUntil }, (ev) =>
    processFirecrawlEvent(ev, deps),
  );
}
