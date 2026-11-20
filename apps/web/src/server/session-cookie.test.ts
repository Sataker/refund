import { describe, expect, it } from 'vitest';
import {
  cookieSecure,
  newSession,
  SESSION_COOKIE_OPTIONS,
  SESSION_MAX_AGE_S,
  signSession,
  verifySession,
} from './session-cookie.ts';

const SECRET = Buffer.from('s'.repeat(32));
const NOW = Date.UTC(2026, 10, 14, 12);

describe('rf_sid (ARCHITECTURE §9.2)', () => {
  it('signs and verifies { userId, issuedAt }', () => {
    const { payload, value } = newSession(SECRET, NOW);
    expect(verifySession(value, SECRET, NOW)).toEqual(payload);
    expect(payload.issuedAt).toBe(NOW / 1000);
  });

  it('rejects tampering, another secret, a bad shape and expiry', () => {
    const { payload, value } = newSession(SECRET, NOW);
    const [body, sig] = value.split('.');
    const forged = Buffer.from(
      JSON.stringify({ ...payload, userId: '22222222-2222-4222-8222-222222222222' }),
    ).toString('base64url');
    expect(verifySession(`${forged}.${sig}`, SECRET, NOW)).toBeNull();
    expect(verifySession(value, Buffer.from('o'.repeat(32)), NOW)).toBeNull();
    expect(verifySession(`${body}`, SECRET, NOW)).toBeNull();
    expect(verifySession(undefined, SECRET, NOW)).toBeNull();
    expect(verifySession(`${value}.x`, SECRET, NOW)).toBeNull();
    const badId = signSession({ userId: 'x', issuedAt: NOW / 1000 }, SECRET);
    expect(verifySession(badId, SECRET, NOW)).toBeNull();
    const notJson = Buffer.from('{').toString('base64url');
    const signedGarbage = signSession({ userId: '', issuedAt: 0 }, SECRET).replace(
      /^[^.]+/,
      notJson,
    );
    expect(verifySession(signedGarbage, SECRET, NOW)).toBeNull();
    expect(verifySession(value, SECRET, NOW + (SESSION_MAX_AGE_S + 1) * 1000)).toBeNull();
    expect(verifySession(value, SECRET, NOW - 120_000)).toBeNull();
  });

  it('Secure is off only under next dev off Vercel (Safari drops Secure cookies on http://localhost)', () => {
    expect(cookieSecure({ NODE_ENV: 'production' })).toBe(true);
    expect(cookieSecure({ NODE_ENV: 'test' })).toBe(true);
    expect(cookieSecure({ NODE_ENV: 'development', VERCEL: '1' })).toBe(true);
    expect(cookieSecure({ NODE_ENV: 'development' })).toBe(false);
  });

  it('cookie is HttpOnly, Secure, SameSite=Lax, 90 days', () => {
    expect(SESSION_COOKIE_OPTIONS).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 7_776_000,
    });
  });
});
