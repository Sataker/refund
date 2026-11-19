import { getDb } from '@/server/db.ts';
import { logger } from '@/server/log.ts';
import { paymentsConfig } from '@/server/payments/gateway.ts';
import { receiveAbacatePayWebhook } from '@/server/webhooks/abacatepay.ts';

// ARCHITECTURE §4.8: `transparent.completed` and friends; `webhookSecret` + HMAC; processed before answering (payment
// is short and must be durable). 200 / 401; our error → 500 (AbacatePay retries). Never 410 (it disables the webhook).

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: Request): Promise<Response> {
  const config = paymentsConfig();
  if (!config) return Response.json({ ok: false }, { status: 401 });
  let handle: Awaited<ReturnType<typeof getDb>> = null;
  try {
    handle = await getDb();
  } catch (err) {
    logger.error('webhook.error', { provider: 'abacatepay', error: err });
    return Response.json({ ok: false }, { status: 500 });
  }
  if (!handle) return Response.json({ ok: false }, { status: 401 });
  return receiveAbacatePayWebhook(req, handle.db, {
    secret: config.webhookSecret,
    keyMode: config.keyMode,
  });
}
