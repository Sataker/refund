import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures.ts';

// TESTS §6.2 @app (E14): A3–A7, A9 and A10 on the live /app with the hero's sample data (replay, no Pluggy keys, no
// e-mail). No fixed tax numbers here: the hero's values are pinned by the engine and pipeline tests; these check the
// flow, the persistence and the paywall on the wire.

const HERO_CNPJ = 'RF.DEV.001/0001-58';

async function tap(page: Page, label: string, nextUrl: RegExp): Promise<void> {
  await page.getByRole('button', { name: label, exact: true }).click();
  await expect(page).toHaveURL(nextUrl);
}

/** First-access track with the hero's sample PJ and PF accounts, ending on /app. */
async function finishTrack(page: Page): Promise<void> {
  await page.goto('/app');
  await page.getByLabel('CNPJ da sua empresa').fill(HERO_CNPJ);
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page).toHaveURL(/\/confirmar-empresa$/);
  await tap(page, 'Sou eu', /\/faturamento$/);
  await tap(page, 'R$ 30 mil a 60 mil', /\/funcionarios$/);
  await tap(page, 'Sim', /\/exterior$/);
  await tap(page, 'Sim, metade ou mais', /\/estimativa$/);
  await page.getByTestId('see-exact-number').click();
  await page.getByTestId('give-consent').click();
  await expect(page).toHaveURL(/\/conta-pj$/);
  await page.getByTestId('use-sample-data').click();
  await expect(
    page.getByTestId('account-card-PJ').getByTestId('connection-status'),
  ).toHaveAttribute('data-status', 'active');
  await page.getByTestId('track-continue').click();
  await expect(page).toHaveURL(/\/conta-pf$/);
  await page.getByTestId('use-sample-data').click();
  await expect(
    page.getByTestId('account-card-PF').getByTestId('connection-status'),
  ).toHaveAttribute('data-status', 'active');
  await page.getByTestId('track-continue').click();
  await expect(page).toHaveURL(/\/app$/);
}

/** Starts an analysis from /app and waits for Screen 4 to finish; returns its id. */
async function analyze(page: Page): Promise<string> {
  await page.goto('/app');
  await page.getByTestId('start-analysis').click();
  await expect(page).toHaveURL(/\/app\/analises\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId('analysis')).toHaveAttribute('data-status', 'done', {
    timeout: 60_000,
  });
  return new URL(page.url()).pathname.split('/').at(-1) as string;
}

/** The dashboard's confirmed total and its estimated line (all the engine's numbers on Screen 5). */
async function numbers(page: Page): Promise<string[]> {
  return page
    .locator('[data-testid="dashboard/money-hero"], [data-testid="dashboard/estimated"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-cents') ?? ''));
}

async function ruleIdsOnScreen(page: Page): Promise<string[]> {
  return page
    .getByTestId('analysis-cards')
    .locator('[data-testid="analysis-card"]')
    .evaluateAll((els) => els.map((e) => e.textContent ?? ''));
}

test.describe('live analysis @app', () => {
  test.describe.configure({ timeout: 180_000 });

  test('A3: start → SSE → dashboard with the stored findings', async ({ page }) => {
    await finishTrack(page);
    const id = await analyze(page);
    await expect(page.getByTestId('finding-R01')).toBeVisible();
    // D36: open cards → the first button leads to Confirmar, with N and X from the run; the dashboard comes after.
    const confirm = page.getByTestId('open-confirm');
    await expect(confirm).toHaveText(/^Responda \d+ perguntas? para confirmar/);
    const n = Number(await confirm.getAttribute('data-count'));
    expect(n).toBeGreaterThan(0);
    await confirm.click();
    await expect(page).toHaveURL(new RegExp(`/app/analises/${id}/confirmar$`));
    await expect(page.locator('[data-testid^="card-"]')).toHaveCount(n);
    await page.goto(`/app/analises/${id}`);
    await expect(page.getByTestId('analysis')).toHaveAttribute('data-status', 'done');
    await page.getByTestId('open-dashboard').click();
    await expect(page).toHaveURL(new RegExp(`/app/analises/${id}/painel$`));
    await expect(page.getByTestId('dashboard')).toBeVisible();
    // Before the cards are answered most savings are still "estimado": the big number may be R$ 0,00 (only the
    // confirmed count), never a guess.
    const total = Number(await page.getByTestId('dashboard/money-hero').getAttribute('data-cents'));
    expect(Number.isSafeInteger(total) && total >= 0).toBe(true);
    // Σ PJ + PF of the confirmed savings == the big number (the engine's own split).
    const pj = Number(
      await page
        .getByTestId('dashboard/pj')
        .locator('[data-cents]')
        .first()
        .getAttribute('data-cents'),
    );
    const pf = Number(
      await page
        .getByTestId('dashboard/pf')
        .locator('[data-cents]')
        .first()
        .getAttribute('data-cents'),
    );
    expect(pj + pf).toBe(total);
    await page.getByTestId('open-R01').click();
    await expect(page.getByTestId('detail-R01')).toBeVisible();
    await expect(page.getByTestId('calc-trace')).toBeVisible();
  });

  test('A4: reloading in the middle continues where it stopped, without duplicating cards', async ({
    page,
  }) => {
    await finishTrack(page);
    await page.goto('/app');
    await page.getByTestId('start-analysis').click();
    await expect(page).toHaveURL(/\/app\/analises\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId('analysis-card').first()).toBeVisible({ timeout: 60_000 });
    await page.reload();
    await expect(page.getByTestId('analysis')).toHaveAttribute('data-status', 'done', {
      timeout: 60_000,
    });
    const cards = await ruleIdsOnScreen(page);
    expect(cards.length).toBeGreaterThan(0);
    expect(new Set(cards).size).toBe(cards.length);
    // A second reload after the end replays at once, the same cards.
    await page.reload();
    await expect(page.getByTestId('analysis')).toHaveAttribute('data-status', 'done');
    expect(await ruleIdsOnScreen(page)).toEqual(cards);
  });

  test('A5: answering the pró-labore card and re-running changes the total', async ({ page }) => {
    await finishTrack(page);
    const id = await analyze(page);
    await page.goto(`/app/analises/${id}/painel`);
    const before = await numbers(page);
    await page.goto(`/app/analises/${id}/confirmar`);
    await page.getByTestId('other-pro-labore-gross').fill('5.000,00');
    await page.getByTestId('save-other-pro-labore-gross').click();
    await expect(page.getByTestId('card-pro-labore-gross')).toHaveAttribute(
      'data-choice',
      'other:500000',
    );
    await page.getByTestId('reanalyze-confirm').click();
    await expect(page).toHaveURL(/\/app\/analises\/[0-9a-f-]{36}$/);
    expect(page.url()).not.toContain(id);
    await expect(page.getByTestId('analysis')).toHaveAttribute('data-status', 'done', {
      timeout: 60_000,
    });
    await page.getByTestId('open-dashboard').click();
    await expect(page.getByTestId('dashboard')).toBeVisible();
    expect(await numbers(page)).not.toEqual(before);
  });

  test('A6: report without e-mail → copy link → the accountant approves → the owner sees it live', async ({
    page,
    context,
  }) => {
    await finishTrack(page);
    const id = await analyze(page);
    await page.goto(`/app/analises/${id}/relatorio`);
    await expect(page.getByTestId('report-sender')).toContainText('copie o link');
    await page.getByTestId('accountant-email').fill('contador@example.com');
    await page.getByTestId('create-report-link').click();
    const link = await page.getByTestId('report-link').textContent();
    expect(link).toMatch(/\/r\/[\w-]{20,}$/);
    await expect(page.getByTestId('report-status')).toHaveAttribute('data-status', 'created');

    const accountant = await context.browser()?.newContext();
    if (!accountant) throw new Error('no browser');
    const other = await accountant.newPage();
    await other.goto(new URL(link ?? '').pathname);
    await expect(other.getByTestId('accountant-page')).toBeVisible();
    await other.getByTestId('approve-report').click();
    await expect(other.getByTestId('accountant-done')).toHaveAttribute('data-decision', 'approved');
    await accountant.close();

    await expect(page.getByTestId('report-status')).toHaveAttribute('data-status', 'approved', {
      timeout: 15_000,
    });
  });

  test('A7: free plan, the locked trace is null on the wire; the 4th analysis of the month is refused', async ({
    page,
  }) => {
    await finishTrack(page);
    const id = await analyze(page);
    const sse = await page.request.get(`/api/analises/${id}/eventos?from=100000`);
    expect(sse.headers()['content-type']).toContain('text/event-stream');
    const findings = (await sse.text())
      .split('\n\n')
      .filter((f) => /^event: (finding|alert)$/m.test(f))
      .map((f) => JSON.parse(/^data: (.*)$/m.exec(f)?.[1] ?? 'null').finding);
    expect(findings.length).toBeGreaterThan(1);
    const open = findings.filter((f) => f.traceLocked === false);
    expect(open.map((f) => f.ruleId)).toEqual(['R01']);
    for (const f of findings.filter((x) => x.ruleId !== 'R01')) {
      expect(f.trace).toBeNull();
      expect(f.traceLocked).toBe(true);
    }
    // The detail of a locked finding has no calculation in the page, only the paywall.
    await page.goto(`/app/analises/${id}/painel`);
    const locked = findings.find((f) => f.ruleId !== 'R01');
    await page.goto(`/app/analises/${id}/achados/${locked.id}`);
    await expect(page.getByTestId('trace-locked')).toBeVisible();
    await expect(page.getByTestId('calc-trace')).toHaveCount(0);

    await analyze(page);
    await analyze(page);
    await page.goto('/app');
    await page.getByTestId('start-analysis').click();
    await expect(page.getByTestId('paywall-plan-limit')).toHaveAttribute('data-code', 'PLAN_LIMIT');
    await expect(page).toHaveURL(/\/app$/);
  });

  test('A10: Finanças live — groups sum to the tiles and every seal opens a finding of this analysis', async ({
    page,
  }) => {
    await finishTrack(page);
    const id = await analyze(page);
    for (const holder of ['pj', 'pf'] as const) {
      await page.goto(`/app/analises/${id}/financas?holder=${holder}`);
      await expect(page.getByTestId(`fv-panel-${holder}`)).toBeVisible();
      const sums = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('[data-testid^="fv-group-"]')].map((g) =>
          Number(g.dataset.cents),
        ),
      );
      const inflow = Number(await page.getByTestId('fv-total-inflow').getAttribute('data-cents'));
      const outflow = Number(await page.getByTestId('fv-total-outflow').getAttribute('data-cents'));
      expect(sums.reduce((a, b) => a + b, 0)).toBe(inflow + outflow);
      const links = await page
        .locator('[data-testid^="fv-seal-link-"]')
        .evaluateAll((els) => els.map((e) => e.getAttribute('href') ?? ''));
      for (const href of new Set(links)) {
        expect(href).toMatch(new RegExp(`^/app/analises/${id}/achados/[0-9a-f-]{36}$`));
        const res = await page.request.get(href);
        expect(res.status()).toBe(200);
      }
    }
  });

  test('A9: delete my data → session gone, /app starts over', async ({ page, context }) => {
    await finishTrack(page);
    await analyze(page);
    await page.goto('/app/conta');
    await expect(page.getByTestId('account-page')).toBeVisible();
    await expect(page.getByTestId('delete-my-data')).toBeDisabled();
    await page.getByTestId('delete-confirmation').fill('APAGAR');
    await page.getByTestId('delete-my-data').click();
    await expect(page).toHaveURL(/\/dados-apagados$/);
    await expect(page.getByTestId('data-deleted')).toBeVisible();
    expect((await context.cookies()).find((c) => c.name === 'rf_sid')).toBeUndefined();
    await page.goto('/app');
    await expect(page).toHaveURL(/\/app\/comecar\/cnpj$/);
  });
});
