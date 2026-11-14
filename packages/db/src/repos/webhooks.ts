// Webhook idempotency (ARCHITECTURE §4.9; ADR-010).
import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '../client.ts';
import { webhookEvents } from '../schema/index.ts';

export type WebhookProvider = (typeof webhookEvents.provider.enumValues)[number];
export type WebhookStatus = (typeof webhookEvents.status.enumValues)[number];

export interface WebhookEventInput {
  provider: WebhookProvider;
  eventId: string;
  type: string;
  /** Minimal (whitelisted) payload; nulled by the cron after 30 days. */
  payload?: unknown;
}

/**
 * `INSERT … ON CONFLICT (provider, event_id) DO NOTHING RETURNING id`. Returns the new row id, or
 * null when the event was already received (respond 200 without reprocessing).
 */
export async function recordWebhookEvent(db: Db, input: WebhookEventInput): Promise<number | null> {
  const rows = await db
    .insert(webhookEvents)
    .values({
      provider: input.provider,
      eventId: input.eventId,
      type: input.type,
      payload: input.payload ?? null,
    })
    .onConflictDoNothing({ target: [webhookEvents.provider, webhookEvents.eventId] })
    .returning({ id: webhookEvents.id });
  return rows[0]?.id ?? null;
}

export async function finishWebhookEvent(
  db: Db,
  id: number,
  status: Exclude<WebhookStatus, 'received'>,
  error?: string,
): Promise<void> {
  await db
    .update(webhookEvents)
    .set({ status, error: error?.slice(0, 500) ?? null, processedAt: sql`now()` })
    .where(and(eq(webhookEvents.id, id), eq(webhookEvents.status, 'received')));
}
