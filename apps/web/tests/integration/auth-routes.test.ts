import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// D58 security review: the proxy with login off (unchanged) and on (AuthKit + rf_sid rules), the sign-in route's
// `voltar` validation, the callback's error landing and the POST-only sign-out. No WorkOS call: AuthKit reads its env
// at import, so each test stubs the env and imports the modules fresh.

const SESSION_SECRET = 's'.repeat(40);
const LOGIN_ENV = {
  WORKOS_CLIENT_ID: 'client_01ROUTETEST',
  WORKOS_API_KEY: 'sk_test_route',
  WORKOS_COOKIE_PASSWORD: 'c'.repeat(40),
  NEXT_PUBLIC_WORKOS_REDIRECT_URI: 'http://localhost:3000/auth/callback',
};
const BASE_ENV = {
  SESSION_SECRET,
  ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64'),
  PII_PEPPER: 'p'.repeat(40),
  DATABASE_URL: 'postgres://unused/refund',
};

function stubEnv(login: boolean) {
  for (const [k, v] of Object.entries(BASE_ENV)) vi.stubEnv(k, v);
  for (const [k, v] of Object.entries(LOGIN_ENV)) vi.stubEnv(k, login ? v : '');
}

async function load(login: boolean) {
  vi.resetModules();
  stubEnv(login);
  const proxy = await import('@/proxy.ts');
  const cookie = await import('@/server/session-cookie.ts');
  return { proxy, cookie, secret: Buffer.from(SESSION_SECRET, 'utf8') };
}

function req(path: string, init: { cookie?: string; headers?: Record<string, string> } = {}) {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set('cookie', init.cookie);
  return new NextRequest(new URL(path, 'http://localhost:3000'), { headers });
}

function setCookie(res: Response, name: string): string | null {
  const all = res.headers.getSetCookie?.() ?? [];
  const hit = all.find((c) => c.startsWith(`${name}=`));
  return hit ? (hit.split(';')[0]?.slice(name.length + 1) ?? '') : null;
}

beforeEach(() => {
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('proxy', () => {
  it('login off: mints rf_sid on /app, keeps a valid one, and leaves /auth alone', async () => {
    const { proxy, cookie, secret } = await load(false);
    const first = await proxy.proxy(req('/app'));
    const minted = setCookie(first, 'rf_sid');
    expect(cookie.verifySession(minted ?? undefined, secret)).not.toBeNull();
    const again = await proxy.proxy(req('/app/plano', { cookie: `rf_sid=${minted}` }));
    expect(setCookie(again, 'rf_sid')).toBeNull();
    expect(setCookie(await proxy.proxy(req('/auth/entrar')), 'rf_sid')).toBeNull();
  });

  it('login on: mints on /app, never on /auth, and drops an account session without a WorkOS session', async () => {
    const { proxy, cookie, secret } = await load(true);
    const minted = setCookie(await proxy.proxy(req('/app')), 'rf_sid');
    expect(cookie.verifySession(minted ?? undefined, secret)).not.toBeNull();
    // An anonymous rf_sid stays as it is.
    expect(
      setCookie(await proxy.proxy(req('/app', { cookie: `rf_sid=${minted}` })), 'rf_sid'),
    ).toBeNull();
    // On /auth only AuthKit runs: the callback's re-signed cookie is the only rf_sid set there.
    expect(setCookie(await proxy.proxy(req('/auth/callback')), 'rf_sid')).toBeNull();

    // rf_sid bound to a WorkOS user, but no wos-session (signed out or expired): a fresh anonymous session.
    const account = cookie.signSession(
      {
        userId: '3c5b01fe-c11a-48df-a57d-df3d5c3ef79c',
        issuedAt: Math.floor(Date.now() / 1000),
        wid: 'user_01ACCOUNT',
      },
      secret,
    );
    const res = await proxy.proxy(req('/app/plano', { cookie: `rf_sid=${account}` }));
    const replaced = cookie.verifySession(setCookie(res, 'rf_sid') ?? undefined, secret);
    expect(replaced).not.toBeNull();
    expect(replaced?.userId).not.toBe('3c5b01fe-c11a-48df-a57d-df3d5c3ef79c');
    expect(replaced?.wid).toBeUndefined();
  });

  it('login on: a client-sent x-workos-session header never reaches the page', async () => {
    const { proxy } = await load(true);
    const res = await proxy.proxy(req('/app', { headers: { 'x-workos-session': 'forged' } }));
    const forwarded = res.headers.get('x-middleware-request-x-workos-session');
    expect(forwarded).not.toBe('forged');
  });
});

describe('/auth routes', () => {
  it('entrar: an outside voltar falls back to /app/plano; login off goes to /app', async () => {
    vi.resetModules();
    stubEnv(true);
    const getSignInUrl = vi.fn(async (_o: { returnTo?: string }) => 'https://api.workos.com/x');
    vi.doMock('@workos-inc/authkit-nextjs', () => ({ getSignInUrl }));
    const { GET } = await import('@/app/auth/entrar/route.ts');
    const res = await GET(req('/auth/entrar?voltar=https%3A%2F%2Fevil.example%2Fapp'));
    expect(res.headers.get('location')).toBe('https://api.workos.com/x');
    expect(getSignInUrl).toHaveBeenLastCalledWith({ returnTo: '/app/plano' });
    await GET(req('/auth/entrar?voltar=%2Fapp%2Fplano%3Fassinar%3Dbusiness-yearly'));
    expect(getSignInUrl).toHaveBeenLastCalledWith({
      returnTo: '/app/plano?assinar=business-yearly',
    });

    vi.resetModules();
    stubEnv(false);
    const off = await import('@/app/auth/entrar/route.ts');
    const r = await off.GET(req('/auth/entrar?voltar=%2Fapp'));
    expect(r.headers.get('location')).toBe('http://localhost:3000/app');
    vi.doUnmock('@workos-inc/authkit-nextjs');
  });

  it('callback: a failed sign-in lands on /app/plano?login=erro (onError)', async () => {
    vi.resetModules();
    stubEnv(true);
    const { GET } = await import('@/app/auth/callback/route.ts');
    const res = await GET(req('/auth/callback?code=bogus&state=bogus'));
    expect(res.headers.get('location')).toBe('http://localhost:3000/app/plano?login=erro');
  });

  it('sair: GET has no side effect; POST from another site is ignored', async () => {
    vi.resetModules();
    stubEnv(true);
    const { GET, POST } = await import('@/app/auth/sair/route.ts');
    const get = GET(req('/auth/sair', { cookie: 'rf_sid=x' }));
    expect(get.status).toBe(303);
    expect(get.headers.get('location')).toBe('http://localhost:3000/app');
    expect(get.headers.get('set-cookie')).toBeNull();
    const cross = await POST(req('/auth/sair', { headers: { 'sec-fetch-site': 'cross-site' } }));
    expect(cross.status).toBe(303);
    expect(cross.headers.get('set-cookie')).toBeNull();
  });
});
