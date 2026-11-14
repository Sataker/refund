import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/health/route.ts';
import { resetDb } from '@/server/db.ts';

// ARCHITECTURE §10.2; TESTS §4 "deep health with and without a database".

const SECRETS = {
  SESSION_SECRET: 's'.repeat(32),
  ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
  PII_PEPPER: 'p'.repeat(32),
};

function stub(vars: Record<string, string>) {
  for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v);
}

async function call(query = '', ip = '198.51.100.1') {
  const res = await GET(
    new Request(`http://localhost/api/health${query}`, {
      headers: { 'x-forwarded-for': ip },
    }),
  );
  return { status: res.status, body: await res.json() };
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await resetDb();
});

describe('GET /api/health', () => {
  it('basic: never opens the database, reports capabilities', async () => {
    stub({ NODE_ENV: 'production', DATABASE_URL: '' });
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.capabilities.database).toBe(false);
    expect(body.checks).toBeUndefined();
  });

  it('deep without any database (backup deployment): ok, database not configured', async () => {
    stub({ NODE_ENV: 'production', DATABASE_URL: '' });
    const { status, body } = await call('?deep=1');
    expect(status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.checks.database).toMatchObject({ ok: false, reason: 'not_configured' });
  });

  it('deep with the database (PGlite): heartbeat written, migrations match', async () => {
    stub({ NODE_ENV: 'test', DATABASE_URL: '' });
    const { status, body } = await call('?deep=1');
    expect(status).toBe(200);
    expect(body.status).toBe('ok');
    expect(JSON.stringify(body)).toContain('"database":{"ok":true');
    expect(body.checks.database.driver).toBe('pglite');
    expect(body.checks.database.migrations.applied).toBe(body.checks.database.migrations.expected);
    expect(Date.parse(body.checks.database.heartbeat)).not.toBeNaN();
  });

  it('deep with a configured but unreachable database: failed (503)', async () => {
    stub({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://refund:refund@127.0.0.1:1/refund',
      DB_SSL: 'disable',
      ...SECRETS,
    });
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const { status, body } = await call('?deep=1');
    expect(status).toBe(503);
    expect(body.status).toBe('failed');
    expect(body.checks.database).toMatchObject({ ok: false, reason: 'unreachable' });
    expect(JSON.stringify(body)).not.toContain('refund:refund');
  });

  it('ENCRYPTION_KEY with 31 bytes: database off and degraded, without the value', async () => {
    const bad = Buffer.alloc(31, 1).toString('base64');
    stub({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://u:p@127.0.0.1:1/x',
      ...SECRETS,
      ENCRYPTION_KEY: bad,
    });
    const { status, body } = await call('?deep=1');
    expect(status).toBe(200);
    expect(body.status).toBe('degraded');
    expect(body.capabilities.database).toBe(false);
    expect(body.problems).toEqual([{ name: 'ENCRYPTION_KEY', reason: expect.any(String) }]);
    expect(body.checks.database.reason).toBe('missing_secrets');
    expect(JSON.stringify(body)).not.toContain(bad);
  });

  it('deep is limited to 30/min per IP', async () => {
    stub({ NODE_ENV: 'production', DATABASE_URL: '' });
    const ip = '198.51.100.99';
    for (let i = 0; i < 30; i++) expect((await call('?deep=1', ip)).status).toBe(200);
    const limited = await call('?deep=1', ip);
    expect(limited.status).toBe(429);
    expect((await call('', ip)).status).toBe(200);
  });
});
