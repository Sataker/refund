import type { AnswerKey } from '@refund/personas';
import answerKeyJson from '@refund/personas/data/dev-exportador.answer-key.json' with {
  type: 'json',
};
import { expect, test, unlockShell } from '../fixtures.ts';

// TESTS §6.4 (production-*): runs against E2E_BASE_URL, daily from production.yml and by hand on publication day.
// E2E_TARGET says what is on the other side: `production` (database configured), `backup` (zero app variables,
// INFRA-CI §6.1) or nothing (a local `next start`, which behaves like the backup).
// E2E_SHA, when given, is the commit the deployment must report.

const HERO = 'dev-exportador';
const key = answerKeyJson as unknown as AnswerKey;
const TOTAL = String(key.total.savings12m);
const TARGET = process.env.E2E_TARGET ?? 'local';
const withDatabase = TARGET === 'production';
const SCREENS: Record<string, string> = {
  analysis: `/demo/${HERO}/analise?pace=instant`,
  dashboard: `/demo/${HERO}/painel`,
};

test.describe('production @production', () => {
  test('P1: /api/health?deep=1 is ok, the demo assembles and the database answers', async ({
    request,
  }) => {
    const res = await request.get('/api/health?deep=1');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.demo).toEqual({ personas: 1, recordingsComplete: true, videoNumbers: 'ok' });
    if (process.env.E2E_SHA) expect(body.version).toBe(process.env.E2E_SHA.slice(0, 7));
    if (withDatabase) {
      const db = body.checks.database;
      expect(db.ok).toBe(true);
      expect(db.migrations.applied).toBe(db.migrations.expected);
      expect(Date.now() - Date.parse(db.heartbeat)).toBeLessThan(26 * 60 * 60 * 1000);
      expect(body.capabilities.database).toBe(true);
    } else {
      // The backup has no database on purpose (ARCHITECTURE §7.1): not configured is ok, never failed.
      expect(body.checks.database).toMatchObject({ ok: false, reason: 'not_configured' });
    }
  });

  test('P2: D1 landing → /demo → hero → company card in < 2 s with the seal', async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('link', { name: 'Ver demo com a Marina, dev que exporta' })
      .first()
      .click();
    await expect(page).toHaveURL(/\/demo$/);
    await expect(page.getByTestId(`demo/persona-total-${HERO}`)).toHaveAttribute(
      'data-cents',
      TOTAL,
    );
    const started = Date.now();
    await page.getByTestId(`persona-${HERO}`).click();
    await expect(page.getByLabel('CNPJ da sua empresa')).toHaveValue('RF.DEV.001/0001-58');
    await page.getByTestId('track-advance').click();
    await expect(page.getByTestId('company-card')).toBeVisible();
    expect(Date.now() - started).toBeLessThan(2000);
    await expect(page.getByTestId('sandbox-seal').filter({ visible: true }).first()).toBeVisible();
  });

  test('P2: D4 live analysis ends at the answer key total with zero errors', async ({ page }) => {
    const sse = await page.request.get(`/api/demo/analise?persona=${HERO}&pace=instant`);
    expect(sse.headers()['content-type']).toContain('text/event-stream');
    const body = await sse.text();
    expect(body).not.toContain('"type":"error"');
    expect(body).toContain('"type":"end"');
    await page.goto(SCREENS.analysis as string);
    const hero = page.getByTestId('analysis/money-hero');
    await expect(hero).toHaveAttribute('data-settled', 'true', { timeout: 20_000 });
    await expect(hero).toHaveAttribute('data-cents', TOTAL);
    await expect(page.getByTestId('analysis-error')).toHaveCount(0);
  });

  test('P2: D6 dashboard total, recovery apart, findings by R$', async ({ page }) => {
    await unlockShell(page);
    await page.goto(SCREENS.dashboard as string);
    await expect(page.getByTestId('dashboard/money-hero')).toHaveAttribute('data-cents', TOTAL);
    const order = await page
      .getByTestId('savings-list')
      .locator(':scope > li')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-rule')));
    expect(order).toEqual(['R05', 'R01']);
    await expect(page.getByTestId('alerts').getByTestId('alert-R02')).toBeVisible();
  });

  test('P2: D7 R01 detail → "Ver cálculo" → source transactions; article with an official link', async ({
    page,
  }) => {
    await unlockShell(page);
    await page.goto(`/demo/${HERO}/achados/R01`);
    await page.getByTestId('calc-trace').locator('summary').first().click();
    const revenue = page.getByTestId('trace-sources/R01.RBT12_REGIME');
    await revenue.locator('summary').click();
    await expect(revenue.getByTestId('source-row')).toHaveCount(12);
    await expect(
      page
        .getByTestId('law')
        .getByTestId('ref-sheet')
        .first()
        .getByRole('link', {
          name: /Abrir a fonte oficial/,
        }),
    ).toHaveAttribute('href', /planalto\.gov\.br/);
  });

  test('P3: every video number on its screen equals the answer key', async ({ page, request }) => {
    expect(key.videoNumbers.length).toBeGreaterThan(0);
    const health = await (await request.get('/api/health')).json();
    expect(health.demo.videoNumbers).toBe('ok');
    await unlockShell(page);
    for (const screen of [...new Set(key.videoNumbers.map((v) => v.screen))]) {
      const path = SCREENS[screen];
      expect(path, `no route for the video screen "${screen}"`).toBeDefined();
      await page.goto(path as string);
      if (screen === 'analysis')
        await expect(page.getByTestId('analysis/money-hero')).toHaveAttribute(
          'data-settled',
          'true',
          { timeout: 20_000 },
        );
      for (const v of key.videoNumbers.filter((n) => n.screen === screen))
        await expect(page.getByTestId(v.testId), v.testId).toHaveAttribute(
          'data-cents',
          String(v.cents),
        );
    }
  });

  test('P4: security headers on the landing, /demo, /app and the health check', async ({
    request,
  }) => {
    for (const path of ['/', '/demo', '/app/comecar/cnpj', '/api/health']) {
      const h = (await request.get(path, { maxRedirects: 0 })).headers();
      expect(h['content-security-policy'], path).toContain("frame-ancestors 'none'");
      expect(h['content-security-policy'], path).toContain("object-src 'none'");
      expect(h['strict-transport-security'], path).toContain('max-age=63072000');
      expect(h['x-content-type-options'], path).toBe('nosniff');
      expect(h['x-frame-options'], path).toBe('DENY');
      expect(h['referrer-policy'], path).toBe('strict-origin-when-cross-origin');
      expect(h['x-powered-by'], path).toBeUndefined();
    }
    const app = (await request.get('/app/comecar/cnpj')).headers();
    expect(app['cache-control']).toContain('no-store');
    expect(app['x-robots-tag']).toBe('noindex');
  });

  test('P5: /app shows the live track or the "modo ao vivo indisponível" fallback, never an error', async ({
    page,
  }) => {
    const res = await page.goto('/app/comecar/cnpj');
    expect(res?.status() ?? 500).toBeLessThan(500);
    const live = page.getByLabel('CNPJ da sua empresa');
    const offline = page.getByRole('heading', { name: 'Modo ao vivo indisponível' });
    await expect(live.or(offline).first()).toBeVisible();
    if (!withDatabase) await expect(offline).toBeVisible();
    await expect(page.getByText('Application error')).toHaveCount(0);
  });
});
