import { createMemoryDb, type DbHandle, schema } from '@refund/db';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { REPLAY_COMPANIES } from '@/server/company/replay-companies.ts';
import { migrationsFolder } from '@/server/db.ts';
import {
  activePlanWith,
  consumeQuotaWith,
  entitlementsWith,
  requireLiveRoomWith,
} from '@/server/entitlements.ts';
import {
  abacatePaySignature,
  type KeyMode,
  type PixGateway,
  type ProviderPixStatus,
} from '@/server/payments/abacatepay.ts';
import {
  getChargeWith,
  RECONCILE_AFTER_MS,
  simulateDevPaymentWith,
  startPixCheckoutWith,
} from '@/server/payments/checkout.ts';
import { liveAnalysesPerMonth } from '@/server/plans/catalog.ts';
import { insertConsent, linkCompany } from '@/server/track/state.ts';
import { receiveAbacatePayWebhook } from '@/server/webhooks/abacatepay.ts';

// E17 (TESTS §4; ARCHITECTURE §2.5, §4.9, §8.4): charge → simulate-payment → webhook → Empresa unlocked, against PGlite
// and a fake AbacatePay behind the PixGateway port (no keys exist yet; the real Test Mode run is step N8).

const SECRET = 'whsec-integration-test-secret-0123456789';
const URL_BASE = 'http://localhost/api/webhooks/abacatepay';

let fakeSeq = 0;

/** In-memory AbacatePay: what simulate-payment would do, plus the delivery it would send to our webhook. */
class FakeAbacatePay implements PixGateway {
  readonly charges = new Map<
    string,
    { amount: number; status: ProviderPixStatus; externalId: string }
  >();
  readonly deliveries: string[] = [];
  constructor(readonly keyMode: KeyMode) {}

  async createPix(input: Parameters<PixGateway['createPix']>[0]) {
    fakeSeq += 1;
    const id = `pix_char_fake${fakeSeq}`;
    this.charges.set(id, {
      amount: input.amountCents,
      status: 'PENDING',
      externalId: input.externalId,
    });
    return {
      ok: true as const,
      value: {
        id,
        amountCents: input.amountCents,
        status: 'PENDING' as const,
        devMode: this.keyMode === 'test',
        brCode: `00020101FAKE${fakeSeq}`,
        brCodeBase64: 'data:image/png;base64,AAAA',
        expiresAt: new Date(Date.now() + 900_000).toISOString(),
      },
    };
  }
  async checkPix(id: string) {
    const c = this.charges.get(id);
    if (!c) return { ok: false as const, error: { code: 'REJECTED' as const } };
    return { ok: true as const, value: { id, status: c.status, expiresAt: null } };
  }
  async simulatePayment(id: string) {
    const c = this.charges.get(id);
    if (this.keyMode !== 'test' || !c || c.status !== 'PENDING') {
      return { ok: false as const, error: { code: 'REJECTED' as const } };
    }
    c.status = 'PAID';
    this.deliveries.push(completedEvent(`log_${id}`, id, c.amount, true));
    return { ok: true as const, value: undefined };
  }
}

function completedEvent(
  eventId: string,
  chargeId: string,
  amount: number,
  devMode: boolean,
  status = 'PAID',
) {
  return JSON.stringify({
    id: eventId,
    event: status === 'REFUNDED' ? 'transparent.refunded' : 'transparent.completed',
    apiVersion: 2,
    devMode,
    data: {
      transparent: { id: chargeId, externalId: null, amount, status, devMode, metadata: {} },
      customer: { id: '', name: null, email: null, taxId: null },
      payerInformation: { method: 'PIX' },
    },
  });
}

function deliver(
  body: string,
  opts: { secret?: string; signature?: string | null; viaQuery?: boolean } = {},
): Request {
  const secret = opts.secret ?? SECRET;
  const headers = new Headers({ 'content-type': 'application/json' });
  const signature = opts.signature === undefined ? abacatePaySignature(body) : opts.signature;
  if (signature !== null) headers.set('x-webhook-signature', signature);
  if (!opts.viaQuery) headers.set('x-webhook-secret', secret);
  const url = opts.viaQuery ? `${URL_BASE}?webhookSecret=${encodeURIComponent(secret)}` : URL_BASE;
  return new Request(url, { method: 'POST', headers, body });
}

let h: DbHandle;
beforeAll(async () => {
  const folder = migrationsFolder();
  if (!folder) throw new Error('migrations folder not found');
  h = await createMemoryDb({ migrationsFolder: folder });
});
afterAll(() => h.close());
beforeEach(() => {
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});
afterEach(() => vi.restoreAllMocks());

async function newUserId(): Promise<string> {
  const [u] = await h.db.insert(schema.users).values({}).returning();
  return u?.id as string;
}

const webhook = (req: Request, keyMode: KeyMode = 'test') =>
  receiveAbacatePayWebhook(req, h.db, { secret: SECRET, keyMode });

async function subscriptionsOf(userId: string) {
  return h.db.select().from(schema.subscriptions).where(eq(schema.subscriptions.userId, userId));
}

describe('Pix checkout → simulate-payment → webhook → plan (Test Mode, fake port)', () => {
  it('Empresa yearly: the charge is the catalog price, the webhook grants 366 days and unlocks the trace', async () => {
    const userId = await newUserId();
    const gateway = new FakeAbacatePay('test');
    const deps = { db: h.db, userId, gateway };
    expect((await entitlementsWith(h.db, userId)).ent.calcTraceUnlocked).toBe(1);

    const started = await startPixCheckoutWith({ planId: 'business', period: 'yearly' }, deps);
    if (!started.ok) throw new Error(started.error.code);
    expect(started.value).toMatchObject({ amountCents: 59900, devMode: true });
    // The client cannot pick the price: an extra field is ignored, the amount still comes from the catalog.
    const tampered = await startPixCheckoutWith(
      { planId: 'business', period: 'yearly', amountCents: 1 },
      deps,
    );
    expect(tampered.ok && tampered.value.amountCents).toBe(59900);

    expect(await getChargeWith({ chargeId: started.value.chargeId }, deps)).toMatchObject({
      ok: true,
      value: { status: 'pending' },
    });
    expect((await simulateDevPaymentWith({ chargeId: started.value.chargeId }, deps)).ok).toBe(
      true,
    );
    const body = gateway.deliveries.at(-1) as string;
    const res = await webhook(deliver(body));
    expect(res.status).toBe(200);

    const plan = await activePlanWith(h.db, userId);
    expect(plan.plan).toBe('business');
    expect(plan.origin).toBe('subscription');
    const days = ((plan.until?.getTime() ?? 0) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(365.9);
    expect(days).toBeLessThanOrEqual(366);
    expect((await entitlementsWith(h.db, userId)).ent.calcTraceUnlocked).toBe('all');
    expect(await getChargeWith({ chargeId: started.value.chargeId }, deps)).toMatchObject({
      ok: true,
      value: { status: 'paid', plan: 'business' },
    });
    // The paid plan lifts the monthly analysis quota from 3 to 30.
    expect(liveAnalysesPerMonth(plan.plan)).toBe(30);
  });

  it('a repeated delivery (same id) and a manual resend (new id) grant nothing twice', async () => {
    const userId = await newUserId();
    const gateway = new FakeAbacatePay('test');
    const deps = { db: h.db, userId, gateway };
    const started = await startPixCheckoutWith({ planId: 'business', period: 'monthly' }, deps);
    if (!started.ok) throw new Error(started.error.code);
    await simulateDevPaymentWith({ chargeId: started.value.chargeId }, deps);
    const body = gateway.deliveries.at(-1) as string;
    const [a, b] = await Promise.all([webhook(deliver(body)), webhook(deliver(body))]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const providerId = [...gateway.charges.keys()].at(-1) as string;
    const resend = await webhook(
      deliver(completedEvent('log_manual_resend', providerId, 6990, true)),
    );
    expect(resend.status).toBe(200);
    const subs = await subscriptionsOf(userId);
    expect(subs).toHaveLength(1);
    const days =
      ((subs[0]?.endsAt.getTime() ?? 0) - (subs[0]?.startsAt.getTime() ?? 0)) / 86_400_000;
    expect(days).toBe(31);
    const events = await h.db
      .select()
      .from(schema.webhookEvents)
      .where(eq(schema.webhookEvents.eventId, JSON.parse(body).id));
    expect(events).toHaveLength(1);
    expect(events[0]?.status).toBe('processed');
    // Only ids and the outcome are stored, never the customer block.
    expect(JSON.stringify(events[0]?.payload)).not.toMatch(/customer|taxId|email/);
  });

  it('webhook: wrong secret, bad or missing signature → 401 and nothing changes; secret in the query works', async () => {
    const userId = await newUserId();
    const gateway = new FakeAbacatePay('test');
    const deps = { db: h.db, userId, gateway };
    const started = await startPixCheckoutWith({ planId: 'personal', period: 'yearly' }, deps);
    if (!started.ok) throw new Error(started.error.code);
    await simulateDevPaymentWith({ chargeId: started.value.chargeId }, deps);
    const body = gateway.deliveries.at(-1) as string;

    expect((await webhook(deliver(body, { secret: 'wrong-secret' }))).status).toBe(401);
    expect(
      (await webhook(deliver(body, { signature: abacatePaySignature(`${body} `) }))).status,
    ).toBe(401);
    expect((await webhook(deliver(body, { signature: null }))).status).toBe(401);
    const forged = body.replace('"amount":19900', '"amount":100');
    expect((await webhook(deliver(forged, { signature: abacatePaySignature(body) }))).status).toBe(
      401,
    );
    expect(await subscriptionsOf(userId)).toHaveLength(0);
    expect((await webhook(deliver(body, { viaQuery: true }))).status).toBe(200);
    expect((await activePlanWith(h.db, userId)).plan).toBe('personal');
  });

  it('devMode event with a production key → 401; a charge of another environment or amount is never granted', async () => {
    const userId = await newUserId();
    const gateway = new FakeAbacatePay('test');
    const deps = { db: h.db, userId, gateway };
    const started = await startPixCheckoutWith({ planId: 'business', period: 'yearly' }, deps);
    if (!started.ok) throw new Error(started.error.code);
    const providerId = [...gateway.charges.keys()].at(-1) as string;
    const devEvent = completedEvent('log_dev_on_prod', providerId, 59900, true);
    expect((await webhook(deliver(devEvent), 'production')).status).toBe(401);
    expect(await subscriptionsOf(userId)).toHaveLength(0);

    const wrongAmount = completedEvent('log_amount', providerId, 100, true);
    expect((await webhook(deliver(wrongAmount))).status).toBe(200);
    const wrongEnv = completedEvent('log_env', providerId, 59900, false);
    expect((await webhook(deliver(wrongEnv))).status).toBe(200);
    expect(await subscriptionsOf(userId)).toHaveLength(0);
    expect((await activePlanWith(h.db, userId)).plan).toBe('free');
  });

  it('simulate-payment is refused with a production key', async () => {
    const userId = await newUserId();
    const gateway = new FakeAbacatePay('production');
    const deps = { db: h.db, userId, gateway };
    const started = await startPixCheckoutWith({ planId: 'business', period: 'yearly' }, deps);
    if (!started.ok) throw new Error(started.error.code);
    expect(started.value.devMode).toBe(false);
    expect(await simulateDevPaymentWith({ chargeId: started.value.chargeId }, deps)).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });
  });

  it('getCharge reconciles with /transparents/check after 20 s when the webhook never came', async () => {
    const userId = await newUserId();
    const gateway = new FakeAbacatePay('test');
    const started = await startPixCheckoutWith(
      { planId: 'business', period: 'yearly' },
      { db: h.db, userId, gateway },
    );
    if (!started.ok) throw new Error(started.error.code);
    await simulateDevPaymentWith(
      { chargeId: started.value.chargeId },
      { db: h.db, userId, gateway },
    );
    // Webhook lost. Before 20 s the server does not ask AbacatePay; after, it reconciles.
    const early = await getChargeWith(
      { chargeId: started.value.chargeId },
      { db: h.db, userId, gateway },
    );
    expect(early).toMatchObject({ ok: true, value: { status: 'pending' } });
    const late = await getChargeWith(
      { chargeId: started.value.chargeId },
      { db: h.db, userId, gateway, nowMs: Date.now() + RECONCILE_AFTER_MS + 1_000 },
    );
    expect(late).toMatchObject({ ok: true, value: { status: 'paid', plan: 'business' } });
    // The late webhook then finds the charge paid: still one period.
    expect((await webhook(deliver(gateway.deliveries.at(-1) as string))).status).toBe(200);
    expect(await subscriptionsOf(userId)).toHaveLength(1);
  });

  it("another user's charge is not found; an expired QR at AbacatePay closes the charge", async () => {
    const userId = await newUserId();
    const other = await newUserId();
    const gateway = new FakeAbacatePay('test');
    const started = await startPixCheckoutWith(
      { planId: 'mei', period: 'monthly' },
      { db: h.db, userId, gateway },
    );
    if (!started.ok) throw new Error(started.error.code);
    expect(
      await getChargeWith(
        { chargeId: started.value.chargeId },
        { db: h.db, userId: other, gateway },
      ),
    ).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    const providerId = [...gateway.charges.keys()].at(-1) as string;
    const c = gateway.charges.get(providerId);
    if (c) c.status = 'EXPIRED';
    expect(
      await getChargeWith(
        { chargeId: started.value.chargeId },
        { db: h.db, userId, gateway, nowMs: Date.now() + 60_000 },
      ),
    ).toMatchObject({ ok: true, value: { status: 'expired' } });
  });

  it('refund (transparent.refunded) cancels the granted period', async () => {
    const userId = await newUserId();
    const gateway = new FakeAbacatePay('test');
    const deps = { db: h.db, userId, gateway };
    const started = await startPixCheckoutWith({ planId: 'business', period: 'monthly' }, deps);
    if (!started.ok) throw new Error(started.error.code);
    await simulateDevPaymentWith({ chargeId: started.value.chargeId }, deps);
    await webhook(deliver(gateway.deliveries.at(-1) as string));
    expect((await activePlanWith(h.db, userId)).plan).toBe('business');
    const providerId = [...gateway.charges.keys()].at(-1) as string;
    const refund = completedEvent('log_refund', providerId, 6990, true, 'REFUNDED');
    expect((await webhook(deliver(refund))).status).toBe(200);
    expect((await activePlanWith(h.db, userId)).plan).toBe('free');
  });

  it('paying again before the end extends the period instead of overlapping it', async () => {
    const userId = await newUserId();
    const gateway = new FakeAbacatePay('test');
    const deps = { db: h.db, userId, gateway };
    for (let i = 0; i < 2; i++) {
      const s = await startPixCheckoutWith({ planId: 'business', period: 'monthly' }, deps);
      if (!s.ok) throw new Error(s.error.code);
      await simulateDevPaymentWith({ chargeId: s.value.chargeId }, deps);
      await webhook(deliver(gateway.deliveries.at(-1) as string));
    }
    const until = (await activePlanWith(h.db, userId)).until?.getTime() ?? 0;
    const days = (until - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(61.9);
    expect(days).toBeLessThanOrEqual(62);
  });
});

describe('validation offer (R$ 1,00 = Empresa for 7 days, at most 5)', () => {
  it('grants business for 7 days with origin validation_offer; the 6th sale is refused', async () => {
    await h.db.delete(schema.charges).where(eq(schema.charges.period, 'validation'));
    const gateway = new FakeAbacatePay('test');
    const first = await newUserId();
    const deps = { db: h.db, userId: first, gateway };
    const s = await startPixCheckoutWith({ planId: 'business', period: 'validation' }, deps);
    if (!s.ok) throw new Error(s.error.code);
    expect(s.value.amountCents).toBe(100);
    await simulateDevPaymentWith({ chargeId: s.value.chargeId }, deps);
    await webhook(deliver(gateway.deliveries.at(-1) as string));
    const plan = await activePlanWith(h.db, first);
    expect(plan).toMatchObject({ plan: 'business', origin: 'validation_offer' });
    const days = ((plan.until?.getTime() ?? 0) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);

    expect(
      await startPixCheckoutWith({ planId: 'personal', period: 'validation' }, deps),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    for (let i = 0; i < 4; i++) {
      const u = await newUserId();
      const r = await startPixCheckoutWith(
        { planId: 'business', period: 'validation' },
        { db: h.db, userId: u, gateway },
      );
      expect(r.ok).toBe(true);
    }
    const sixth = await startPixCheckoutWith(
      { planId: 'business', period: 'validation' },
      { db: h.db, userId: await newUserId(), gateway },
    );
    expect(sixth).toMatchObject({ ok: false, error: { code: 'SOLD_OUT' } });
  });
});

describe('capability, rate limit and input (ARCHITECTURE §4.7, §9.4)', () => {
  it('without the gateway (no keys) → NOT_CONFIGURED; 11th checkout in the hour → RATE_LIMITED', async () => {
    const userId = await newUserId();
    expect(
      await startPixCheckoutWith(
        { planId: 'business', period: 'yearly' },
        { db: h.db, userId, gateway: null },
      ),
    ).toMatchObject({ ok: false, error: { code: 'NOT_CONFIGURED' } });
    const gateway = new FakeAbacatePay('test');
    expect(
      await startPixCheckoutWith(
        { planId: 'free', period: 'yearly' },
        { db: h.db, userId, gateway },
      ),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    for (let i = 0; i < 9; i++) {
      const r = await startPixCheckoutWith(
        { planId: 'business', period: 'yearly' },
        { db: h.db, userId, gateway },
      );
      expect(r.ok).toBe(true);
    }
    expect(
      await startPixCheckoutWith(
        { planId: 'business', period: 'yearly' },
        { db: h.db, userId, gateway },
      ),
    ).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });
  });
});

describe('plan limits on the server (ARCHITECTURE §8.2)', () => {
  it('free: the 4th live analysis of the month → PLAN_LIMIT with the upgrade hint', async () => {
    const userId = await newUserId();
    const limit = liveAnalysesPerMonth((await activePlanWith(h.db, userId)).plan);
    for (let i = 0; i < 3; i++)
      expect((await consumeQuotaWith(h.db, userId, 'live_analyses_month', limit)).ok).toBe(true);
    expect(await consumeQuotaWith(h.db, userId, 'live_analyses_month', limit)).toMatchObject({
      ok: false,
      error: { code: 'PLAN_LIMIT', upgrade: { suggestedPlan: 'business', url: '/app/plano' } },
    });
  });

  it('countLive: Pessoal has no PJ connection; free allows one of each', async () => {
    const userId = await newUserId();
    expect((await requireLiveRoomWith(h.db, userId, 'connections_pj')).ok).toBe(true);
    const gateway = new FakeAbacatePay('test');
    const deps = { db: h.db, userId, gateway };
    const s = await startPixCheckoutWith({ planId: 'personal', period: 'monthly' }, deps);
    if (!s.ok) throw new Error(s.error.code);
    await simulateDevPaymentWith({ chargeId: s.value.chargeId }, deps);
    await webhook(deliver(gateway.deliveries.at(-1) as string));
    expect(await requireLiveRoomWith(h.db, userId, 'connections_pj')).toMatchObject({
      ok: false,
      error: { code: 'PLAN_LIMIT', upgrade: { resource: 'connections_pj' } },
    });
    expect((await requireLiveRoomWith(h.db, userId, 'connections_pf')).ok).toBe(true);
  });
});

describe('review fixes (code review E17)', () => {
  function event(
    type: string,
    eventId: string,
    chargeId: string,
    amount: number,
    status: string,
    meta: Record<string, unknown> = {},
  ) {
    return JSON.stringify({
      id: eventId,
      event: type,
      apiVersion: 2,
      devMode: true,
      data: {
        transparent: {
          id: chargeId,
          externalId: null,
          amount,
          status,
          devMode: true,
          metadata: meta,
        },
        customer: { id: '', name: null, email: null, taxId: null },
      },
    });
  }

  async function pending() {
    const userId = await newUserId();
    const gateway = new FakeAbacatePay('test');
    const s = await startPixCheckoutWith(
      { planId: 'business', period: 'monthly' },
      { db: h.db, userId, gateway },
    );
    if (!s.ok) throw new Error(s.error.code);
    const providerId = [...gateway.charges.keys()].at(-1) as string;
    return { userId, providerId };
  }

  it('a refund that arrives before the completion wins: the late completion grants nothing', async () => {
    const { userId, providerId } = await pending();
    const refund = event('transparent.refunded', 'log_r1', providerId, 6990, 'REFUNDED');
    expect((await webhook(deliver(refund))).status).toBe(200);
    const paid = event('transparent.completed', 'log_c1', providerId, 6990, 'PAID');
    expect((await webhook(deliver(paid))).status).toBe(200);
    expect((await activePlanWith(h.db, userId)).plan).toBe('free');
  });

  it('a lost dispute (transparent.lost, or disputed with REFUNDED) takes the period back', async () => {
    for (const [type, status] of [
      ['transparent.lost', 'PAID'],
      ['transparent.disputed', 'REFUNDED'],
    ] as const) {
      const { userId, providerId } = await pending();
      await webhook(
        deliver(event('transparent.completed', `log_ok_${type}`, providerId, 6990, 'PAID')),
      );
      expect((await activePlanWith(h.db, userId)).plan).toBe('business');
      await webhook(deliver(event(type, `log_lost_${type}`, providerId, 6990, status)));
      expect((await activePlanWith(h.db, userId)).plan).toBe('free');
    }
  });

  it('a dispute still open (UNDER_DISPUTE) changes nothing', async () => {
    const { userId, providerId } = await pending();
    await webhook(deliver(event('transparent.completed', 'log_ok_open', providerId, 6990, 'PAID')));
    await webhook(
      deliver(event('transparent.disputed', 'log_open', providerId, 6990, 'UNDER_DISPUTE')),
    );
    expect((await activePlanWith(h.db, userId)).plan).toBe('business');
  });

  it('a webhook that beats our own update finds the charge by the chargeId sent as metadata', async () => {
    const userId = await newUserId();
    const [row] = await h.db
      .insert(schema.charges)
      .values({
        userId,
        planId: 'business',
        period: 'monthly',
        amountCents: 6990,
        devMode: true,
        expiresAt: new Date(Date.now() + 900_000),
      })
      .returning();
    const early = event(
      'transparent.completed',
      'log_meta',
      'pix_char_not_attached',
      6990,
      'PAID',
      {
        chargeId: row?.id,
      },
    );
    expect((await webhook(deliver(early))).status).toBe(200);
    expect((await activePlanWith(h.db, userId)).plan).toBe('business');
  });

  it('validation offer: once per person; an expired reservation frees its slot; no race at the ceiling', async () => {
    await h.db.delete(schema.charges).where(eq(schema.charges.period, 'validation'));
    const gateway = new FakeAbacatePay('test');
    const userId = await newUserId();
    const deps = { db: h.db, userId, gateway };
    const input = { planId: 'business', period: 'validation' } as const;
    expect((await startPixCheckoutWith(input, deps)).ok).toBe(true);
    expect(await startPixCheckoutWith(input, deps)).toMatchObject({
      ok: false,
      error: { code: 'SOLD_OUT', message: 'Esta oferta vale uma vez por pessoa.' },
    });
    await h.db
      .update(schema.charges)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.charges.userId, userId));
    expect((await startPixCheckoutWith(input, deps)).ok).toBe(true);
    const buyers = await Promise.all(Array.from({ length: 5 }, () => newUserId()));
    const results = await Promise.all(
      buyers.map((u) => startPixCheckoutWith(input, { db: h.db, userId: u, gateway })),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(4);
  });

  it('a PJ connection of a company no longer linked does not count against the plan', async () => {
    const userId = await newUserId();
    const [hero, other] = REPLAY_COMPANIES;
    if (!hero || !other) throw new Error('replay companies missing');
    const companyId = await linkCompany(h.db, userId, hero);
    const consentId = await insertConsent(h.db, {
      userId,
      scopes: ['accounts'],
      termsVersion: 'test',
      ipHash: null,
    });
    await h.db.insert(schema.connections).values({
      userId,
      companyId,
      consentId,
      provider: 'persona',
      holder: 'PJ',
      status: 'active',
    });
    expect((await requireLiveRoomWith(h.db, userId, 'connections_pj')).ok).toBe(false);
    await linkCompany(h.db, userId, other);
    expect((await requireLiveRoomWith(h.db, userId, 'connections_pj')).ok).toBe(true);
  });
});
