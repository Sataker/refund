import { emptyRecordings, recordingsFor } from '@refund/ai';
import { createMemoryDb } from '@refund/db';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/health/route.ts';
import { recordingsComplete } from '@/demo/analysis.ts';
import { DEMO_PERSONAS } from '@/demo/catalog.ts';
import { demoHealth, screenNumbers, videoNumbersOf } from '@/demo/health.ts';
import { migrationsFolder, resetDb } from '@/server/db.ts';
import { checkDatabase, checkDemo } from '@/server/health.ts';

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
    // ARCHITECTURE §10.2: the demo assembles, every AI call it makes is recorded, every video number holds.
    expect(body.demo).toEqual({ personas: 1, recordingsComplete: true, videoNumbers: 'ok' });
  });

  it('deep without any database (backup deployment): ok, database not configured', async () => {
    stub({ NODE_ENV: 'production', DATABASE_URL: '' });
    const { status, body } = await call('?deep=1');
    expect(status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.checks.database).toMatchObject({ ok: false, reason: 'not_configured' });
    // E21: the six CNPJ sources, state only (no CNPJ, no message, no secret).
    expect(body.checks.cnpjSources.map((s: { source: string }) => s.source)).toEqual([
      'brasilapi',
      'opencnpj',
      'cnpja',
      'minhareceita',
      'cnpjws',
      'receitaws',
    ]);
    for (const s of body.checks.cnpjSources) {
      expect(Object.keys(s).sort()).toEqual([
        'consecutiveFailures',
        'lastFailure',
        'lastOkAt',
        'source',
        'state',
      ]);
    }
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

  it('migrations: database behind the build → failed; ahead (migrate before merge) → degraded', async () => {
    const folder = migrationsFolder();
    if (!folder) throw new Error('migrations folder not found');
    const h = await createMemoryDb({ migrationsFolder: folder });
    try {
      const ahead = await checkDatabase(async () => h);
      expect(ahead.status).toBe('ok');

      await h.db.execute(
        `INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES ('next', 9999999999999)`,
      );
      const newer = await checkDatabase(async () => h);
      expect(newer.status).toBe('degraded');
      expect(newer.check).toMatchObject({ ok: true, reason: 'migrations_ahead' });

      await h.db.execute(
        `DELETE FROM "drizzle"."__drizzle_migrations" WHERE created_at >= (SELECT max(created_at) - 1 FROM "drizzle"."__drizzle_migrations" WHERE hash <> 'next')`,
      );
      const behind = await checkDatabase(async () => h);
      expect(behind.status).toBe('failed');
      expect(behind.check).toMatchObject({ ok: false, reason: 'migrations_behind' });
      expect(behind.check.migrations?.applied).toBeLessThan(behind.check.migrations?.expected ?? 0);
    } finally {
      await h.close();
    }
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

// TESTS §6.4 P3 locked locally (ENGINE-SPEC F.4): the numbers the screens render are the video numbers. A change in
// the engine that moves any of them turns health `failed` and breaks this test before it reaches production.
describe('demo health and the video numbers', () => {
  const hero = DEMO_PERSONAS.find((p) => p.hero);
  if (!hero) throw new Error('no hero persona');

  it('the video numbers are exactly F.4 (R$ 62.318,92 · 74.006,28 · 39.787,68–198.938,40 · R02 1.111,70)', () => {
    expect(hero.videoNumbers).toEqual([
      { screen: 'analysis', testId: 'analysis/money-hero', cents: 6_231_892 },
      { screen: 'dashboard', testId: 'dashboard/money-hero', cents: 6_231_892 },
      { screen: 'dashboard', testId: 'dashboard/regime-total', cents: 7_400_628 },
      { screen: 'dashboard', testId: 'dashboard/recovery-min', cents: 3_978_768 },
      { screen: 'dashboard', testId: 'dashboard/recovery-max', cents: 19_893_840 },
      { screen: 'dashboard', testId: 'dashboard/alert-R02-cost', cents: 111_170 },
    ]);
  });

  it('every screen number equals its video number', async () => {
    const shown = await screenNumbers(hero);
    for (const v of hero.videoNumbers) expect(shown?.[v.testId], v.testId).toBe(v.cents);
    expect(await videoNumbersOf(hero)).toEqual({ status: 'ok', mismatches: [] });
  }, 60_000);

  it('a moved video number is reported by testId', async () => {
    const moved = {
      ...hero,
      videoNumbers: hero.videoNumbers.map((v) =>
        v.testId === 'dashboard/regime-total'
          ? { ...v, cents: (v.cents + 1) as typeof v.cents }
          : v,
      ),
    };
    expect(await videoNumbersOf(moved)).toEqual({
      status: 'mismatch',
      mismatches: ['dashboard/regime-total'],
    });
  }, 60_000);

  it('demo health: 1 persona, recordings complete, video numbers ok', async () => {
    expect(await demoHealth()).toEqual({
      personas: 1,
      recordingsComplete: true,
      videoNumbers: 'ok',
    });
  }, 60_000);

  it('a persona whose recordings are missing is not complete', async () => {
    expect(await recordingsComplete(hero)).toBe(true);
    expect(await recordingsComplete(hero, emptyRecordings(hero.id))).toBe(false);
    const full = recordingsFor(hero.id);
    const [dropped] = Object.keys(full.items);
    const partial = {
      ...full,
      items: Object.fromEntries(Object.entries(full.items).filter(([k]) => k !== dropped)),
    };
    expect(await recordingsComplete(hero, partial)).toBe(false);
  }, 60_000);

  it('status: mismatch or no persona → failed; missing recording → degraded; a throw → failed', async () => {
    const ok = { personas: 1, recordingsComplete: true, videoNumbers: 'ok' as const };
    expect((await checkDemo(async () => ok)).status).toBe('ok');
    expect((await checkDemo(async () => ({ ...ok, recordingsComplete: false }))).status).toBe(
      'degraded',
    );
    expect(
      (await checkDemo(async () => ({ ...ok, videoNumbers: 'mismatch' as const }))).status,
    ).toBe('failed');
    expect((await checkDemo(async () => ({ ...ok, personas: 0 }))).status).toBe('failed');
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const thrown = await checkDemo(async () => {
      throw new Error('boom');
    });
    expect(thrown).toEqual({
      demo: { personas: 0, recordingsComplete: false, videoNumbers: 'unavailable' },
      status: 'failed',
    });
  });
});
