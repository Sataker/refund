import 'server-only';
import { type Db, findConnectionByItemHash } from '@refund/db';
import type { FinancialProvider } from '@refund/sources';
import { refreshPluggyConnection } from '../connection/connections.ts';
import { hmac, type Secrets, safeEqual } from '../crypto.ts';
import { logger } from '../log.ts';
import type { VerifiedEvent, WebhookVerifier } from './types.ts';

// ARCHITECTURE §4.9, Pluggy: it does not sign. The global webhook (scripts/pluggy-webhook.ts) sends
// `x-refund-webhook-secret`; we compare it in constant time and check `clientId`. The event is only a
// signal: the item is always refetched with our own key before anything changes.

export const PLUGGY_SECRET_HEADER = 'x-refund-webhook-secret';

export function pluggyVerifier(config: {
  secret: string | undefined;
  clientId: string | undefined;
}): WebhookVerifier {
  return {
    provider: 'pluggy',
    async verify({ body, headers }) {
      if (!config.secret || !config.clientId)
        return { ok: false, error: { code: 'NOT_CONFIGURED' } };
      const given = headers.get(PLUGGY_SECRET_HEADER) ?? '';
      if (!safeEqual(given, config.secret)) {
        return { ok: false, error: { code: 'INVALID_SIGNATURE' } };
      }
      let payload: unknown;
      try {
        payload = JSON.parse(body);
      } catch {
        return { ok: false, error: { code: 'INVALID_PAYLOAD' } };
      }
      const p = (payload ?? {}) as Record<string, unknown>;
      // Another application's event carries another clientId: same answer as a bad secret.
      if (typeof p.clientId !== 'string' || !safeEqual(p.clientId, config.clientId)) {
        return { ok: false, error: { code: 'INVALID_SIGNATURE' } };
      }
      if (typeof p.eventId !== 'string' || typeof p.event !== 'string') {
        return { ok: false, error: { code: 'INVALID_PAYLOAD' } };
      }
      return { ok: true, value: { eventId: p.eventId, type: p.event, payload } };
    },
  };
}

const ITEM_EVENTS = new Set(['item/created', 'item/updated', 'item/error', 'item/login_succeeded']);
const TX_EVENTS = new Set(['transactions/created', 'transactions/updated']);

export interface PluggyProcessDeps {
  db: Db;
  secrets: Secrets;
  provider: FinancialProvider | null;
}

/** Item and transaction events → refetch the item and sync (idempotent: rows are keyed). */
export async function processPluggyEvent(
  ev: VerifiedEvent,
  deps: PluggyProcessDeps,
): Promise<'processed' | 'ignored'> {
  const itemId = (ev.payload as { itemId?: unknown }).itemId;
  if (typeof itemId !== 'string' || !(ITEM_EVENTS.has(ev.type) || TX_EVENTS.has(ev.type))) {
    return 'ignored';
  }
  const row = await findConnectionByItemHash(deps.db, hmac(itemId, deps.secrets.pepper));
  if (!row || row.revokedAt || !deps.provider) return 'ignored';
  // Item or transaction event alike: refetch the item and, when UPDATED, resync (keyed rows).
  const status = await refreshPluggyConnection(row, {
    db: deps.db,
    secrets: deps.secrets,
    provider: deps.provider,
  });
  logger.info('pluggy.webhook_processed', { type: ev.type, status });
  return 'processed';
}
