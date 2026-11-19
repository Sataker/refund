import { describe, expect, it } from 'vitest';
import { capabilitiesFrom, requireCapability } from './capabilities.ts';
import { parseEnv } from './env.ts';

const KEY32 = Buffer.alloc(32, 7).toString('base64');
const SECRET = 'x'.repeat(32);
const LIVE = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://u:p@host:6543/postgres',
  SESSION_SECRET: SECRET,
  ENCRYPTION_KEY: KEY32,
  PII_PEPPER: SECRET,
};

describe('parseEnv (INFRA-CI §1: everything optional)', () => {
  it('zero env → no values, no problems', () => {
    const env = parseEnv({});
    expect(env.values).toEqual({});
    expect(env.problems).toEqual([]);
    expect(env.present.size).toBe(0);
  });

  it('treats blank as absent and trims', () => {
    const env = parseEnv({ CRON_SECRET: '   ', DATA_MODE: ' live ' });
    expect(env.values).toEqual({ DATA_MODE: 'live' });
  });

  it('a malformed variable becomes a problem with a reason and never its value', () => {
    const shortKey = Buffer.alloc(31, 1).toString('base64');
    const env = parseEnv({ ENCRYPTION_KEY: shortKey, SESSION_SECRET: 'curto', DATA_MODE: 'x' });
    expect(env.values).toEqual({});
    expect(env.problems.map((p) => p.name).sort()).toEqual([
      'DATA_MODE',
      'ENCRYPTION_KEY',
      'SESSION_SECRET',
    ]);
    expect(JSON.stringify(env.problems)).not.toContain(shortKey);
    expect(env.present.has('ENCRYPTION_KEY')).toBe(true);
  });
});

describe('capabilities (ARCHITECTURE §4.10)', () => {
  it('zero env in production: everything off, no PGlite', () => {
    const caps = capabilitiesFrom(parseEnv({ NODE_ENV: 'production' }));
    expect(Object.values(caps).every((v) => v === false)).toBe(true);
    expect(requireCapability('database', caps)).toMatchObject({
      ok: false,
      error: { code: 'NOT_CONFIGURED' },
    });
  });

  it('zero env outside production → memoryDatabase, which satisfies "database"', () => {
    const caps = capabilitiesFrom(parseEnv({ NODE_ENV: 'development' }));
    expect(caps.memoryDatabase).toBe(true);
    expect(caps.database).toBe(false);
    expect(requireCapability('database', caps).ok).toBe(true);
    expect(requireCapability('payments', caps).ok).toBe(false);
  });

  it('live database needs the URL and the three secrets', () => {
    expect(capabilitiesFrom(parseEnv(LIVE)).database).toBe(true);
    const bad = capabilitiesFrom(
      parseEnv({ ...LIVE, ENCRYPTION_KEY: Buffer.alloc(31).toString('base64') }),
    );
    expect(bad.database).toBe(false);
    expect(bad.memoryDatabase).toBe(false);
  });

  it('a DATABASE_URL, even malformed, disables the PGlite fallback', () => {
    const caps = capabilitiesFrom(parseEnv({ NODE_ENV: 'test', DATABASE_URL: 'mysql://x' }));
    expect(caps.memoryDatabase).toBe(false);
  });

  it('e-mail stays off without NEXT_PUBLIC_SITE_URL (the link origin)', () => {
    const caps = capabilitiesFrom(parseEnv({ RESEND_API_KEY: 'r', RESEND_FROM: 'Refund <a@b.c>' }));
    expect(caps.email).toBe(false);
  });

  it('derives the other capabilities from their variables', () => {
    const caps = capabilitiesFrom(
      parseEnv({
        DATA_MODE: 'live',
        PLUGGY_CLIENT_ID: 'id',
        PLUGGY_CLIENT_SECRET: 's',
        VERCEL_OIDC_TOKEN: 't',
        RESEND_API_KEY: 'r',
        RESEND_FROM: 'Refund <a@b.c>',
        NEXT_PUBLIC_SITE_URL: 'https://userefund.com.br',
        ABACATEPAY_API_KEY: 'k',
        ABACATEPAY_WEBHOOK_SECRET: 'w',
        FIRECRAWL_WEBHOOK_SECRET: 'f',
        WORKOS_CLIENT_ID: 'c',
        WORKOS_COOKIE_PASSWORD: SECRET,
        NEXT_PUBLIC_WORKOS_REDIRECT_URI: 'http://localhost:3000/auth/callback',
        CRON_SECRET: 'c',
      }),
    );
    expect(caps).toMatchObject({
      liveData: true,
      pluggy: true,
      ai: true,
      email: true,
      payments: true,
      lawMonitor: true,
      login: true,
      cron: true,
    });
  });
});
