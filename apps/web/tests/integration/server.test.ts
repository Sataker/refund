import { createMemoryDb, type DbHandle, schema } from '@refund/db';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { decrypt, hashEmail, type Secrets } from '@/server/crypto.ts';
import { migrationsFolder } from '@/server/db.ts';
import { consumeQuotaWith } from '@/server/entitlements.ts';
import { rateLimit } from '@/server/rate-limit.ts';
import { type CookieJar, resolveSession } from '@/server/session.ts';
import { SESSION_COOKIE } from '@/server/session-cookie.ts';
import { joinWaitlistWith } from '@/server/waitlist.ts';

// TESTS §4: quotas, rate limit, session and the waitlist action against PGlite.

let h: DbHandle;
const secrets: Secrets = {
  session: Buffer.from('s'.repeat(32)),
  encryption: Buffer.alloc(32, 5),
  pepper: Buffer.from('p'.repeat(32)),
  ephemeral: false,
};

beforeAll(async () => {
  const folder = migrationsFolder();
  if (!folder) throw new Error('migrations folder not found');
  h = await createMemoryDb({ migrationsFolder: folder });
});
afterAll(() => h.close());
// The JSON log lines are asserted in log.test.ts; keep the test output clean here.
beforeEach(() => {
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});
afterEach(() => vi.restoreAllMocks());

async function newUserId(): Promise<string> {
  const [u] = await h.db.insert(schema.users).values({}).returning();
  return u?.id as string;
}

describe('consumeQuota (ARCHITECTURE §8.2)', () => {
  it('20 concurrent calls with limit 10 → exactly 10 successes, the rest PLAN_LIMIT', async () => {
    const userId = await newUserId();
    const results = await Promise.all(
      Array.from({ length: 20 }, () => consumeQuotaWith(h.db, userId, 'live_analyses_month', 10)),
    );
    const ok = results.filter((r) => r.ok);
    expect(ok).toHaveLength(10);
    const denied = results.find((r) => !r.ok);
    expect(denied).toMatchObject({
      ok: false,
      error: {
        code: 'PLAN_LIMIT',
        upgrade: { resource: 'live_analyses_month', suggestedPlan: 'business', url: '/app/plano' },
      },
    });
  });

  it('the accrual-month rollover (BRT) resets the count', async () => {
    const userId = await newUserId();
    const nov = Date.parse('2026-12-01T02:00:00Z'); // still 30/11 in São Paulo
    const dec = Date.parse('2026-12-01T03:00:00Z');
    expect(await consumeQuotaWith(h.db, userId, 'ask_law', 1, 1, nov)).toMatchObject({
      ok: true,
      value: { remaining: 0 },
    });
    expect((await consumeQuotaWith(h.db, userId, 'ask_law', 1, 1, nov)).ok).toBe(false);
    expect((await consumeQuotaWith(h.db, userId, 'ask_law', 1, 1, dec)).ok).toBe(true);
  });
});

describe('rateLimit in Postgres (ARCHITECTURE §9.4)', () => {
  it('21st CNPJ lookup in the hour → RATE_LIMITED; the next window frees it', async () => {
    const rule = { key: 'cnpj:u:test', limit: 20, windowMs: 3_600_000 };
    const t0 = Date.parse('2026-11-14T10:00:00Z');
    for (let i = 0; i < 20; i++) expect((await rateLimit(rule, h.db, t0)).ok).toBe(true);
    expect(await rateLimit(rule, h.db, t0)).toMatchObject({
      ok: false,
      error: { code: 'RATE_LIMITED' },
    });
    expect((await rateLimit(rule, h.db, t0 + 3_600_000)).ok).toBe(true);
  });

  it('fails open (logged) when the store is down', async () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const broken = {
      insert: () => {
        throw new Error('down');
      },
    } as unknown as DbHandle['db'];
    expect((await rateLimit({ key: 'x', limit: 1, windowMs: 1000 }, broken)).ok).toBe(true);
  });
});

describe('anonymous session (ARCHITECTURE §9.2)', () => {
  function jar(initial?: string): CookieJar & { written?: string } {
    const store: CookieJar & { written?: string } = {
      get: (name) => (name === SESSION_COOKIE && initial ? { value: initial } : undefined),
      set: (_name, value) => {
        store.written = value;
      },
    };
    return store;
  }

  it('without a cookie: UNAUTHENTICATED, or a new session + users row with create', async () => {
    const deps = { db: h.db, secret: secrets.session };
    expect(await resolveSession(jar(), deps)).toMatchObject({
      ok: false,
      error: { code: 'UNAUTHENTICATED' },
    });
    const j = jar();
    const created = await resolveSession(j, deps, { create: true });
    expect(created.ok).toBe(true);
    expect(j.written).toBeDefined();
    const userId = created.ok ? created.value.userId : '';
    const row = (await h.db.select().from(schema.users)).find((u) => u.id === userId);
    expect(row?.anonymous).toBe(true);

    const again = await resolveSession(jar(j.written), deps);
    expect(again).toEqual({ ok: true, value: { userId } });
  });

  it('a tampered cookie is not accepted', async () => {
    const deps = { db: h.db, secret: secrets.session };
    expect((await resolveSession(jar('abc.def'), deps)).ok).toBe(false);
  });
});

describe('joinWaitlist (E4)', () => {
  const headers = new Headers({ 'x-forwarded-for': '203.0.113.50' });
  const deps = () => ({ db: h.db, secrets, headers: new Headers(headers) });

  it('stores the e-mail only encrypted + HMAC, and is idempotent', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const input = { email: 'Ana@Exemplo.com.br', hasCnpj: true, consent: true };
    expect(await joinWaitlistWith(input, deps())).toEqual({ ok: true, value: { joined: true } });
    expect(await joinWaitlistWith(input, deps())).toEqual({ ok: true, value: { joined: true } });
    const rows = await h.db.select().from(schema.waitlist);
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row?.emailHash).toBe(hashEmail('ana@exemplo.com.br', secrets.pepper));
    expect(row?.emailEncrypted).not.toContain('Exemplo');
    expect(decrypt(row?.emailEncrypted as string, secrets.encryption)).toBe('Ana@Exemplo.com.br');
    expect(row?.origin).toBe('landing');
  });

  it('malformed input → INVALID_INPUT without a stack', async () => {
    const res = await joinWaitlistWith(
      { email: 'nao-e-email', hasCnpj: true, consent: true },
      {
        ...deps(),
        headers: new Headers({ 'x-forwarded-for': '203.0.113.51' }),
      },
    );
    expect(res).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    expect(JSON.stringify(res)).not.toMatch(/stack|at .*\.ts/);
    const noConsent = await joinWaitlistWith(
      { email: 'b@exemplo.com.br', hasCnpj: false, consent: false },
      { ...deps(), headers: new Headers({ 'x-forwarded-for': '203.0.113.51' }) },
    );
    expect(noConsent.ok).toBe(false);
  });

  it('6th attempt in the hour from the same IP → RATE_LIMITED', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const ipHeaders = () => new Headers({ 'x-forwarded-for': '203.0.113.52' });
    const results = [];
    for (let i = 0; i < 6; i++) {
      results.push(
        await joinWaitlistWith(
          { email: `p${i}@exemplo.com.br`, hasCnpj: false, consent: true },
          { db: h.db, secrets, headers: ipHeaders() },
        ),
      );
    }
    expect(results.slice(0, 5).every((r) => r.ok)).toBe(true);
    expect(results[5]).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });
  });
});
