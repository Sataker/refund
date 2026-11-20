import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db, DbHandle } from '../src/client.ts';
import {
  analysisEventsAfter,
  appendAnalysisEvent,
  claimAnalysis,
  markFindingsOutdated,
} from '../src/repos/analyses.ts';
import { findConnectionByItemHash } from '../src/repos/connections.ts';
import { deleteRateLimitsBefore, hitRateLimit } from '../src/repos/rate-limits.ts';
import { activeSubscriptions } from '../src/repos/subscriptions.ts';
import {
  cleanupTechnical,
  databaseSizeBytes,
  insertSystemEvent,
  touchHeartbeat,
} from '../src/repos/system.ts';
import { consumeUsage } from '../src/repos/usage.ts';
import {
  deleteInactiveAnonymousUsers,
  deleteUser,
  ensureAnonymousUser,
  findUser,
} from '../src/repos/users.ts';
import { addToWaitlist } from '../src/repos/waitlist.ts';
import { finishWebhookEvent, recordWebhookEvent } from '../src/repos/webhooks.ts';
import {
  analyses,
  companyLinks,
  connections,
  externalCache,
  lawChanges,
  monitoredRegulations,
  systemEvents,
  webhookEvents,
} from '../src/schema/index.ts';
import {
  makeAnalysis,
  makeCompany,
  makeFinding,
  makeSubscription,
  makeUser,
  memoryDb,
} from './factories.ts';

let h: DbHandle;
let db: Db;
beforeAll(async () => {
  h = await memoryDb();
  db = h.db;
});
afterAll(() => h.close());

describe('users', () => {
  it('materializes the anonymous user idempotently', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const first = await ensureAnonymousUser(db, id);
    const second = await ensureAnonymousUser(db, id);
    expect(first.id).toBe(id);
    expect(second.anonymous).toBe(true);
    expect(second.lastAccessAt.getTime()).toBeGreaterThanOrEqual(first.lastAccessAt.getTime());
    expect((await findUser(db, id))?.id).toBe(id);
  });

  it('deletes the user and everything personal in cascade', async () => {
    const user = await makeUser(db);
    const company = await makeCompany(db, 'RFCASC01000188');
    await db
      .insert(companyLinks)
      .values({ userId: user.id, companyId: company.id, role: 'partner' });
    await makeAnalysis(db, user.id, company.id);
    expect(await deleteUser(db, user.id)).toBe(true);
    expect(await findUser(db, user.id)).toBeNull();
    expect(await db.select().from(analyses).where(eq(analyses.userId, user.id))).toEqual([]);
    expect(await deleteUser(db, user.id)).toBe(false);
  });

  it('LGPD cleanup removes anonymous users at 31 days and keeps them at 29', async () => {
    const old = await makeUser(db, { lastAccessAt: new Date(Date.now() - 31 * 86_400_000) });
    const recent = await makeUser(db, { lastAccessAt: new Date(Date.now() - 29 * 86_400_000) });
    const named = await makeUser(db, {
      anonymous: false,
      lastAccessAt: new Date(Date.now() - 90 * 86_400_000),
    });
    expect(await deleteInactiveAnonymousUsers(db, 30)).toBeGreaterThanOrEqual(1);
    expect(await findUser(db, old.id)).toBeNull();
    expect(await findUser(db, recent.id)).not.toBeNull();
    expect(await findUser(db, named.id)).not.toBeNull();
  });
});

describe('monthly usage (atomic quota)', () => {
  it('20 concurrent calls with limit 10 → exactly 10 successes', async () => {
    const user = await makeUser(db);
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        consumeUsage(db, {
          userId: user.id,
          month: '2026-11',
          resource: 'live_analyses_month',
          n: 1,
          limit: 10,
        }),
      ),
    );
    const ok = results.filter((r) => r !== null);
    expect(ok).toHaveLength(10);
    expect(Math.max(...(ok as number[]))).toBe(10);
  });

  it('a new month starts from zero and n > limit is refused up front', async () => {
    const user = await makeUser(db);
    const base = { userId: user.id, resource: 'ask_law', limit: 2 };
    expect(await consumeUsage(db, { ...base, month: '2026-11', n: 2 })).toBe(2);
    expect(await consumeUsage(db, { ...base, month: '2026-11', n: 1 })).toBeNull();
    expect(await consumeUsage(db, { ...base, month: '2026-12', n: 1 })).toBe(1);
    expect(await consumeUsage(db, { ...base, month: '2027-01', n: 3 })).toBeNull();
    await expect(consumeUsage(db, { ...base, month: '2027-01', n: 0 })).rejects.toThrow(RangeError);
  });
});

describe('rate limits', () => {
  it('counts hits per key and window and cleans old windows', async () => {
    const w1 = new Date('2026-11-14T10:00:00Z');
    const w2 = new Date('2026-11-14T11:00:00Z');
    expect(await hitRateLimit(db, 'cnpj:u:a', w1)).toBe(1);
    expect(await hitRateLimit(db, 'cnpj:u:a', w1)).toBe(2);
    expect(await hitRateLimit(db, 'cnpj:u:a', w2)).toBe(1);
    expect(await hitRateLimit(db, 'cnpj:u:b', w1)).toBe(1);
    expect(await deleteRateLimitsBefore(db, w2)).toBe(2);
  });
});

describe('system', () => {
  it('heartbeat upserts row 1 with the origin', async () => {
    const seen = await touchHeartbeat(db, 'health');
    expect(seen).toBeInstanceOf(Date);
    const rows = await db.execute(sql`SELECT origin FROM refund.system_heartbeat WHERE id = 1`);
    expect((rows as unknown as { rows: { origin: string }[] }).rows[0]?.origin).toBe('health');
  });

  it('reports the database size', async () => {
    expect(await databaseSizeBytes(db)).toBeGreaterThan(0);
  });

  it('writes system events and the technical cleanup drops what expired', async () => {
    await insertSystemEvent(db, { level: 'warn', event: 'limit.rate', route: '/api/x' });
    await db.insert(systemEvents).values({
      level: 'error',
      event: 'old',
      createdAt: new Date(Date.now() - 15 * 86_400_000),
    });
    await db.insert(webhookEvents).values({
      provider: 'pluggy',
      eventId: 'old-1',
      type: 'item/updated',
      payload: { a: 1 },
      receivedAt: new Date(Date.now() - 31 * 86_400_000),
    });
    const cleaned = await cleanupTechnical(db);
    expect(cleaned.systemEvents).toBe(1);
    expect(cleaned.webhookPayloads).toBe(1);
    const remaining = await db.select().from(systemEvents);
    expect(remaining.map((e) => e.event)).toEqual(['limit.rate']);
  });

  it('a CNPJ copy is gone within 14 days of its fetch: deleted once more than 6 days past expiry', async () => {
    const day = 86_400_000;
    const now = Date.now();
    const row = (key: string, fetchedDaysAgo: number) => ({
      source: 'cnpj',
      key,
      payload: {},
      fetchedAt: new Date(now - fetchedDaysAgo * day),
      expiresAt: new Date(now - (fetchedDaysAgo - 7) * day),
    });
    // 13 days 1 hour after the fetch it is deleted, so the next daily run cannot leave it past day 14.
    await db.insert(externalCache).values([row('kept', 12.9), row('gone', 13 + 1 / 24)]);
    await cleanupTechnical(db);
    const keys = (await db.select().from(externalCache)).map((r) => r.key);
    expect(keys).toContain('kept');
    expect(keys).not.toContain('gone');
  });
});

describe('webhooks', () => {
  it('records each (provider, event_id) once and finishes it once', async () => {
    const input = {
      provider: 'abacatepay' as const,
      eventId: 'log_1',
      type: 'transparent.completed',
    };
    const id = await recordWebhookEvent(db, input);
    expect(id).not.toBeNull();
    expect(await recordWebhookEvent(db, input)).toBeNull();
    expect(await recordWebhookEvent(db, { ...input, provider: 'pluggy' })).not.toBeNull();
    await finishWebhookEvent(db, id as number, 'processed');
    await finishWebhookEvent(db, id as number, 'error', 'late retry');
    const [row] = await db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.id, id as number));
    expect(row?.status).toBe('processed');
    expect(row?.error).toBeNull();
  });
});

describe('waitlist', () => {
  it('is idempotent on the e-mail hash', async () => {
    const entry = {
      emailEncrypted: 'v1.a.b.c',
      emailHash: 'hash-1',
      hasCnpj: true,
      origin: 'landing',
      consentedAt: new Date(),
    };
    expect(await addToWaitlist(db, entry)).toBe(true);
    expect(await addToWaitlist(db, { ...entry, hasCnpj: false })).toBe(false);
  });
});

describe('analyses', () => {
  it('only one caller claims a pending analysis; a stuck one is claimed again', async () => {
    const user = await makeUser(db);
    const company = await makeCompany(db, 'RFCLAI01000177');
    const a = await makeAnalysis(db, user.id, company.id);
    const claims = await Promise.all([claimAnalysis(db, a.id), claimAnalysis(db, a.id)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(await claimAnalysis(db, a.id)).toBe(false);
    await db
      .update(analyses)
      .set({ claimedAt: new Date(Date.now() - 7 * 60_000) })
      .where(eq(analyses.id, a.id));
    expect(await claimAnalysis(db, a.id)).toBe(true);
  });

  it('event log ignores a replayed seq and resends after Last-Event-ID', async () => {
    const user = await makeUser(db);
    const company = await makeCompany(db, 'RFEVNT01000166');
    const a = await makeAnalysis(db, user.id, company.id);
    for (let seq = 1; seq <= 7; seq++) {
      expect(await appendAnalysisEvent(db, a.id, { seq, type: 'stage', payload: { seq } })).toBe(
        true,
      );
    }
    expect(await appendAnalysisEvent(db, a.id, { seq: 3, type: 'stage', payload: {} })).toBe(false);
    const after = await analysisEventsAfter(db, a.id, 5);
    expect(after.map((e) => e.seq)).toEqual([6, 7]);
  });

  it('"law changed" marks only findings that cite the changed provision', async () => {
    const user = await makeUser(db);
    const company = await makeCompany(db, 'RFLAWC01000155');
    const a1 = await makeAnalysis(db, user.id, company.id);
    const a2 = await makeAnalysis(db, user.id, company.id);
    await makeFinding(db, a1.id, 'R01', ['lc123-2006/art18/p5-j']);
    await makeFinding(db, a2.id, 'R04', ['lei9250-1995/art3-a']);
    await db.insert(monitoredRegulations).values({ regulationId: 'lc123-2006', url: 'https://x' });
    const [change] = await db
      .insert(lawChanges)
      .values({ regulationId: 'lc123-2006', url: 'https://x', eventId: 'e1', diffText: 'diff' })
      .returning();
    const affected = await markFindingsOutdated(
      db,
      ['lc123-2006/art18/p5-j'],
      change?.id as string,
    );
    expect(affected).toEqual([a1.id]);
    expect(await markFindingsOutdated(db, ['lc123-2006/art18/p5-j'], change?.id as string)).toEqual(
      [],
    );
    expect(await markFindingsOutdated(db, [], change?.id as string)).toEqual([]);
  });
});

describe('subscriptions and connections', () => {
  it('lists only active, unexpired subscriptions, latest first', async () => {
    const user = await makeUser(db);
    const future = new Date(Date.now() + 10 * 86_400_000);
    const later = new Date(Date.now() + 20 * 86_400_000);
    await makeSubscription(db, user.id, 'personal', future);
    await makeSubscription(db, user.id, 'business', later);
    await makeSubscription(db, user.id, 'mei', new Date(Date.now() - 1000));
    await makeSubscription(db, user.id, 'business', later, 'expired');
    const active = await activeSubscriptions(db, user.id);
    expect(active.map((s) => s.planId)).toEqual(['business', 'personal']);
  });

  it('finds a connection by the item HMAC', async () => {
    const user = await makeUser(db);
    await db
      .insert(connections)
      .values({ userId: user.id, provider: 'pluggy', holder: 'PJ', itemIdHash: 'hmac-item-1' });
    expect((await findConnectionByItemHash(db, 'hmac-item-1'))?.userId).toBe(user.id);
    expect(await findConnectionByItemHash(db, 'nope')).toBeNull();
  });
});
