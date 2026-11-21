import { createMemoryDb, type DbHandle, linkIdentity, schema } from '@refund/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { linkWorkosUserWith, type WorkosIdentity } from '@/server/auth/link.ts';
import { decrypt, hashEmail, type Secrets } from '@/server/crypto.ts';
import { migrationsFolder } from '@/server/db.ts';
import { offerClickedWith, recordFunnelWith } from '@/server/funnel.ts';
import type { PixGateway } from '@/server/payments/abacatepay.ts';
import { grantPaidCharge, startPixCheckoutWith } from '@/server/payments/checkout.ts';
import type { CookieJar } from '@/server/session.ts';
import { SESSION_COOKIE, signSession, verifySession } from '@/server/session-cookie.ts';

// D58 (ARCHITECTURE §9.2): login at payment intent. The WorkOS identity links to the rf_sid user in place, or merges
// it into the account that already exists and re-signs rf_sid; checkout asks an anonymous session to sign in only
// with the `login` capability; the funnel rows carry no PII. PGlite, no WorkOS call (the core gets the WorkOS user).

let h: DbHandle;
const secrets: Secrets = {
  session: Buffer.from('s'.repeat(32)),
  encryption: Buffer.alloc(32, 7),
  pepper: Buffer.from('p'.repeat(32)),
  ephemeral: false,
};

beforeAll(async () => {
  const folder = migrationsFolder();
  if (!folder) throw new Error('migrations folder not found');
  h = await createMemoryDb({ migrationsFolder: folder });
});
afterAll(() => h.close());
let out: string[];
beforeEach(() => {
  out = [];
  const capture = (chunk: unknown) => {
    out.push(String(chunk));
    return true;
  };
  vi.spyOn(process.stdout, 'write').mockImplementation(capture);
  vi.spyOn(process.stderr, 'write').mockImplementation(capture);
});
afterEach(() => vi.restoreAllMocks());

async function newUserId(): Promise<string> {
  const [u] = await h.db.insert(schema.users).values({}).returning();
  return u?.id as string;
}

function jarFor(userId?: string): CookieJar & { written?: string } {
  const initial = userId
    ? signSession({ userId, issuedAt: Math.floor(Date.now() / 1000) }, secrets.session)
    : undefined;
  const store: CookieJar & { written?: string } = {
    get: (name) => (name === SESSION_COOKIE && initial ? { value: initial } : undefined),
    set: (_name, value) => {
      store.written = value;
    },
  };
  return store;
}

let seq = 0;
function workosUser(): WorkosIdentity {
  seq += 1;
  return {
    id: `user_01TEST${seq}`,
    email: `  Marina.Dev${seq}@Example.com `,
    firstName: 'Marina',
    lastName: 'Dev',
  };
}

async function userRow(id: string) {
  const [row] = await h.db.select().from(schema.users).where(eq(schema.users.id, id));
  return row ?? null;
}

async function funnelRows(userId: string, action?: string) {
  const rows = await h.db
    .select()
    .from(schema.auditEvents)
    .where(
      and(eq(schema.auditEvents.actorUserId, userId), eq(schema.auditEvents.targetType, 'funnel')),
    );
  return action ? rows.filter((r) => r.action === action) : rows;
}

describe('linkWorkosUserWith', () => {
  it('fresh link: the anonymous session user becomes the account in place, rf_sid untouched', async () => {
    const userId = await newUserId();
    const jar = jarFor(userId);
    const user = workosUser();
    const linked = await linkWorkosUserWith(user, { db: h.db, secrets, jar });
    expect(linked).toEqual({ ok: true, value: { userId, merged: false, switched: false } });
    expect(jar.written).toBeUndefined();
    const row = await userRow(userId);
    expect(row).toMatchObject({
      anonymous: false,
      workosUserId: user.id,
      emailHash: hashEmail(user.email, secrets.pepper),
      displayName: 'Marina Dev',
    });
    expect(decrypt(row?.emailEncrypted ?? '', secrets.encryption)).toBe(user.email.trim());
    expect(await funnelRows(userId, 'funnel.login_completed')).toHaveLength(1);
    // Never the e-mail in a log line or a funnel row.
    const local = user.email.trim().split('@')[0] as string;
    expect(out.join('').toLowerCase()).not.toContain(local.toLowerCase());
    expect(JSON.stringify(await funnelRows(userId)).toLowerCase()).not.toContain(
      local.toLowerCase(),
    );
  });

  it('merge path: a returning owner on a new device keeps the account, its plan, and gets the session data', async () => {
    const accountId = await newUserId();
    const user = workosUser();
    await linkWorkosUserWith(user, { db: h.db, secrets, jar: jarFor(accountId) });
    const [charge] = await h.db
      .insert(schema.charges)
      .values({
        userId: accountId,
        planId: 'business',
        period: 'yearly',
        amountCents: 59900,
        devMode: true,
      })
      .returning();
    await grantPaidCharge(h.db, charge as NonNullable<typeof charge>, new Date());

    const anonId = await newUserId();
    await recordFunnelWith(h.db, anonId, 'funnel.estimate_seen', { where: 'estimativa' });
    const jar = jarFor(anonId);
    const linked = await linkWorkosUserWith(user, { db: h.db, secrets, jar });
    expect(linked).toEqual({
      ok: true,
      value: { userId: accountId, merged: true, switched: true },
    });
    expect(await userRow(anonId)).toBeNull();
    // rf_sid re-signed to the existing account.
    expect(verifySession(jar.written, secrets.session)?.userId).toBe(accountId);
    const subs = await h.db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, accountId));
    expect(subs.map((s) => [s.planId, s.status])).toEqual([['business', 'active']]);
    // The anonymous funnel rows follow the account, so the conversion query sees one person.
    expect(await funnelRows(accountId, 'funnel.estimate_seen')).toHaveLength(1);
    expect(await funnelRows(accountId, 'funnel.paid')).toHaveLength(1);
    expect((await funnelRows(accountId, 'funnel.login_completed')).at(-1)?.data).toEqual({
      merged: true,
    });
  });

  it('another account on the same browser is never merged: rf_sid just switches', async () => {
    const first = await newUserId();
    await linkWorkosUserWith(workosUser(), { db: h.db, secrets, jar: jarFor(first) });
    const second = await newUserId();
    const secondUser = workosUser();
    await linkWorkosUserWith(secondUser, { db: h.db, secrets, jar: jarFor(second) });

    const jar = jarFor(first);
    const linked = await linkWorkosUserWith(secondUser, { db: h.db, secrets, jar });
    expect(linked).toEqual({ ok: true, value: { userId: second, merged: false, switched: true } });
    expect(await userRow(first)).not.toBeNull();
    expect(verifySession(jar.written, secrets.session)?.userId).toBe(second);
  });

  it('an account signing in a new identity from someone else’s session gets its own row', async () => {
    const first = await newUserId();
    await linkWorkosUserWith(workosUser(), { db: h.db, secrets, jar: jarFor(first) });
    const jar = jarFor(first);
    const linked = await linkWorkosUserWith(workosUser(), { db: h.db, secrets, jar });
    if (!linked.ok) throw new Error(linked.error.code);
    expect(linked.value.userId).not.toBe(first);
    expect(linked.value.switched).toBe(true);
    expect((await userRow(linked.value.userId))?.anonymous).toBe(false);
    expect(verifySession(jar.written, secrets.session)?.userId).toBe(linked.value.userId);
  });

  it('no rf_sid at all: a new account, and rf_sid is signed for it', async () => {
    const jar = jarFor();
    const linked = await linkWorkosUserWith(workosUser(), { db: h.db, secrets, jar });
    if (!linked.ok) throw new Error(linked.error.code);
    expect(linked.value).toMatchObject({ merged: false, switched: true });
    expect(verifySession(jar.written, secrets.session)?.userId).toBe(linked.value.userId);
  });

  it('refuses a WorkOS user without a usable e-mail or id, and reports a database failure as a Result', async () => {
    const jar = jarFor(await newUserId());
    expect(
      await linkWorkosUserWith({ id: 'user_x', email: 'not-an-email' }, { db: h.db, secrets, jar }),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    expect(
      await linkWorkosUserWith(
        { id: '../x', email: 'owner@example.com' },
        { db: h.db, secrets, jar },
      ),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    const broken = {
      insert: () => {
        throw new Error('down');
      },
    } as unknown as DbHandle['db'];
    expect(await linkWorkosUserWith(workosUser(), { db: broken, secrets, jar })).toMatchObject({
      ok: false,
      error: { code: 'UNAVAILABLE' },
    });
  });
});

/** Just enough of AbacatePay for the gate: the charge is created and nothing else. */
const gateway: PixGateway = {
  keyMode: 'test',
  async createPix(input) {
    return {
      ok: true,
      value: {
        id: `pix_char_gate${input.externalId.slice(0, 8)}`,
        amountCents: input.amountCents,
        status: 'PENDING',
        devMode: true,
        brCode: '00020101GATE',
        brCodeBase64: 'data:image/png;base64,AAAA',
        expiresAt: new Date(Date.now() + 900_000).toISOString(),
      },
    };
  },
  async checkPix() {
    return { ok: false, error: { code: 'REJECTED' } };
  },
  async simulatePayment() {
    return { ok: false, error: { code: 'REJECTED' } };
  },
};

describe('checkout gate (D58)', () => {
  const input = { planId: 'business', period: 'yearly' } as const;

  it('login on + anonymous → UNAUTHENTICATED with the sign-in link back to the same plan, no charge', async () => {
    const userId = await newUserId();
    const r = await startPixCheckoutWith(input, {
      db: h.db,
      userId,
      gateway,
      requireLogin: true,
      anonymous: true,
    });
    expect(r).toEqual({
      ok: false,
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Entre para guardar o seu plano.',
        recoverable: true,
        login: `/auth/entrar?voltar=${encodeURIComponent('/app/plano?assinar=business-yearly')}`,
      },
    });
    const charges = await h.db
      .select()
      .from(schema.charges)
      .where(eq(schema.charges.userId, userId));
    expect(charges).toEqual([]);
    expect(await funnelRows(userId, 'funnel.checkout_started')).toEqual([]);
  });

  it('login on + signed in → the Pix is created and checkout_started is recorded', async () => {
    const userId = await newUserId();
    await linkIdentity(h.db, userId, {
      workosUserId: `user_gate${userId.slice(0, 8)}`,
      emailHash: `gate-${userId}`,
      emailEncrypted: 'v1.x',
      displayName: null,
    });
    const r = await startPixCheckoutWith(input, {
      db: h.db,
      userId,
      gateway,
      requireLogin: true,
      anonymous: false,
    });
    expect(r.ok).toBe(true);
    const rows = await funnelRows(userId, 'funnel.checkout_started');
    expect(rows.map((x) => x.data)).toEqual([{ plan: 'business', period: 'yearly' }]);
  });

  it('login off → unchanged: an anonymous session pays as before', async () => {
    const userId = await newUserId();
    const r = await startPixCheckoutWith(input, { db: h.db, userId, gateway });
    expect(r.ok && r.value.amountCents).toBe(59900);
    const off = await startPixCheckoutWith(input, {
      db: h.db,
      userId: await newUserId(),
      gateway,
      requireLogin: false,
      anonymous: true,
    });
    expect(off.ok).toBe(true);
  });

  it('the validation offer sends back to the plain plans page', async () => {
    const r = await startPixCheckoutWith(
      { planId: 'business', period: 'validation', code: 'x' },
      { db: h.db, userId: await newUserId(), gateway, requireLogin: true, anonymous: true },
    );
    expect(r.ok === false && r.error.login).toBe('/auth/entrar?voltar=%2Fapp%2Fplano');
  });
});

describe('funnel events', () => {
  it('offerClicked records where, refuses anything else and is rate-limited', async () => {
    const userId = await newUserId();
    expect((await offerClickedWith({ where: 'estimativa' }, { db: h.db, userId })).ok).toBe(true);
    expect(
      await offerClickedWith({ where: 'marina@example.com' }, { db: h.db, userId }),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    const rows = await funnelRows(userId, 'funnel.offer_clicked');
    expect(rows.map((r) => [r.actorType, r.data])).toEqual([['user', { where: 'estimativa' }]]);
    const nowMs = Date.now();
    let last: Awaited<ReturnType<typeof offerClickedWith>> | null = null;
    for (let i = 0; i < 31; i += 1) {
      last = await offerClickedWith({ where: 'painel' }, { db: h.db, userId, nowMs });
    }
    expect(last).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });
  });

  it('a failed funnel insert never fails the caller', async () => {
    const broken = {
      transaction: () => {
        throw new Error('down');
      },
    } as unknown as DbHandle['db'];
    await expect(
      recordFunnelWith(broken, '00000000-0000-4000-8000-000000000000', 'funnel.paid'),
    ).resolves.toBeUndefined();
  });

  it('only plan, period, where and merged reach the row', async () => {
    const userId = await newUserId();
    await recordFunnelWith(h.db, userId, 'funnel.paid', {
      plan: 'business',
      period: 'yearly',
      email: 'x@y.z',
    } as never);
    expect((await funnelRows(userId, 'funnel.paid'))[0]?.data).toEqual({
      plan: 'business',
      period: 'yearly',
    });
  });
});
