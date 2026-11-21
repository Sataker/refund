import { createMemoryDb, type DbHandle, linkIdentity, schema } from '@refund/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMAIL_UNVERIFIED, linkWorkosUserWith, type WorkosIdentity } from '@/server/auth/link.ts';
import { decrypt, hashEmail, type Secrets } from '@/server/crypto.ts';
import { migrationsFolder } from '@/server/db.ts';
import { offerClickedWith, recordFunnelWith } from '@/server/funnel.ts';
import type { PixGateway } from '@/server/payments/abacatepay.ts';
import { grantPaidCharge, startPixCheckoutWith } from '@/server/payments/checkout.ts';
import { type CookieJar, resolveSession } from '@/server/session.ts';
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

function jarFor(userId?: string, wid?: string): CookieJar & { written?: string } {
  const initial = userId
    ? signSession(
        { userId, issuedAt: Math.floor(Date.now() / 1000), ...(wid ? { wid } : {}) },
        secrets.session,
      )
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
function workosUser(over: Partial<WorkosIdentity> = {}): WorkosIdentity {
  seq += 1;
  return {
    id: `user_01TEST${seq}`,
    email: `  Marina.Dev${seq}@Example.com `,
    emailVerified: true,
    ...over,
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
  it('fresh link: the anonymous session user becomes the account in place; rf_sid is rotated and bound', async () => {
    const userId = await newUserId();
    const jar = jarFor(userId);
    const before = jar.get(SESSION_COOKIE)?.value;
    const user = workosUser();
    const linked = await linkWorkosUserWith(user, { db: h.db, secrets, jar });
    expect(linked).toEqual({ ok: true, value: { userId, merged: false, switched: false } });
    // Session fixation: even the in-place link issues a new cookie, bound to the WorkOS user.
    expect(jar.written).toBeDefined();
    expect(jar.written).not.toBe(before);
    expect(verifySession(jar.written, secrets.session)).toMatchObject({ userId, wid: user.id });
    const row = await userRow(userId);
    expect(row).toMatchObject({
      anonymous: false,
      workosUserId: user.id,
      emailHash: hashEmail(user.email, secrets.pepper),
      displayName: null,
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
    expect(verifySession(jar.written, secrets.session)).toMatchObject({
      userId: accountId,
      wid: user.id,
    });
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

  it('a verified e-mail finds the account even under a new WorkOS id', async () => {
    const accountId = await newUserId();
    const user = workosUser();
    await linkWorkosUserWith(user, { db: h.db, secrets, jar: jarFor(accountId) });
    const anonId = await newUserId();
    const linked = await linkWorkosUserWith(
      { id: 'user_01RECREATED', email: user.email, emailVerified: true },
      { db: h.db, secrets, jar: jarFor(anonId) },
    );
    expect(linked).toMatchObject({ ok: true, value: { userId: accountId, merged: true } });
    expect((await userRow(accountId))?.workosUserId).toBe('user_01RECREATED');
  });

  it('account takeover is refused: an unverified e-mail that another account holds is never linked', async () => {
    const victimId = await newUserId();
    const victim = workosUser();
    await linkWorkosUserWith(victim, { db: h.db, secrets, jar: jarFor(victimId) });
    const attackerId = await newUserId();
    const jar = jarFor(attackerId);
    const before = (await h.db.select().from(schema.users)).length;
    const r = await linkWorkosUserWith(
      { id: 'user_01ATTACKER', email: victim.email, emailVerified: false },
      { db: h.db, secrets, jar },
    );
    expect(r).toEqual({
      ok: false,
      error: {
        code: EMAIL_UNVERIFIED,
        message:
          'Este e-mail já tem uma conta no Refund. Confirme o e-mail no login para entrar nela.',
        recoverable: true,
      },
    });
    expect(jar.written).toBeUndefined();
    expect((await h.db.select().from(schema.users)).length).toBe(before);
    expect(await userRow(attackerId)).toMatchObject({ anonymous: true, workosUserId: null });
    expect(await userRow(victimId)).toMatchObject({ workosUserId: victim.id });
  });

  it('an unverified e-mail nobody holds links by WorkOS id only, without claiming the e-mail', async () => {
    const userId = await newUserId();
    const user = workosUser({ emailVerified: false });
    const r = await linkWorkosUserWith(user, { db: h.db, secrets, jar: jarFor(userId) });
    expect(r.ok).toBe(true);
    expect(await userRow(userId)).toMatchObject({
      anonymous: false,
      workosUserId: user.id,
      emailHash: null,
    });
  });

  it('a changed e-mail that another account holds: the account keeps its e-mail and the login succeeds', async () => {
    const aId = await newUserId();
    const a = workosUser();
    await linkWorkosUserWith(a, { db: h.db, secrets, jar: jarFor(aId) });
    const bId = await newUserId();
    const b = workosUser();
    await linkWorkosUserWith(b, { db: h.db, secrets, jar: jarFor(bId) });

    const jar = jarFor(aId, a.id);
    const r = await linkWorkosUserWith({ ...a, email: b.email }, { db: h.db, secrets, jar });
    expect(r).toMatchObject({ ok: true, value: { userId: aId, merged: false } });
    expect((await userRow(aId))?.emailHash).toBe(hashEmail(a.email, secrets.pepper));
    expect((await userRow(bId))?.emailHash).toBe(hashEmail(b.email, secrets.pepper));
    expect(out.join('')).toContain('auth.email_kept');
    expect(out.join('').toLowerCase()).not.toContain(b.email.trim().toLowerCase());
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
      select: () => {
        throw new Error('down');
      },
    } as unknown as DbHandle['db'];
    expect(await linkWorkosUserWith(workosUser(), { db: broken, secrets, jar })).toMatchObject({
      ok: false,
      error: { code: 'UNAVAILABLE' },
    });
  });
});

describe('resolveSession binds an account to its sign-in (security review D58, item 2)', () => {
  it('honours the rotated cookie, refuses a pre-sign-in copy (fixation) and mints a fresh one in actions', async () => {
    const userId = await newUserId();
    const preLogin = jarFor(userId);
    const user = workosUser();
    const jar = jarFor(userId);
    await linkWorkosUserWith(user, { db: h.db, secrets, jar });
    const deps = { db: h.db, secret: secrets.session };

    const bound: CookieJar = { get: () => ({ value: jar.written as string }) };
    expect(await resolveSession(bound, deps)).toEqual({
      ok: true,
      value: { userId, anonymous: false },
    });
    // The attacker's copy from before the sign-in: no account, ever.
    expect(await resolveSession({ get: preLogin.get }, deps)).toMatchObject({
      ok: false,
      error: { code: 'UNAUTHENTICATED' },
    });
    const fresh = await resolveSession(preLogin, deps, { create: true });
    expect(fresh.ok && fresh.value.userId).not.toBe(userId);
    expect(fresh.ok && fresh.value.anonymous).toBe(true);
    expect(verifySession(preLogin.written, secrets.session)?.userId).not.toBe(userId);
    // A cookie bound to another WorkOS user does not open this account either.
    expect(await resolveSession(jarFor(userId, 'user_01SOMEONEELSE'), deps)).toMatchObject({
      ok: false,
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
      email: { hash: `gate-${userId}`, encrypted: 'v1.x' },
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
