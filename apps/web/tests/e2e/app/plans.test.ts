import { expect, test } from '../fixtures.ts';
import { type FakeAbacatePay, startFakeAbacatePay } from '../support/fake-abacatepay.ts';
import { analyze, finishTrack, HERO_CNPJ, tap } from './live-flow.ts';

// E17 done criterion on /app: charge → simulate-payment → webhook → Empresa unlocked, end to end through the real
// server actions, the real HTTP adapter and the real webhook route, against a local fake AbacatePay in Test Mode (the
// keys do not exist yet; the real Test Mode run is step N8). The server must run with
//   ABACATEPAY_API_KEY=abc_dev_… ABACATEPAY_WEBHOOK_SECRET=<E2E_ABACATEPAY_WEBHOOK_SECRET>
//   ABACATEPAY_API_BASE_URL=http://127.0.0.1:<E2E_ABACATEPAY_PORT>/v2
// Without those variables (e.g. the CI default) the test is skipped: the plans page then shows Pix off.

const FAKE_PORT = Number(process.env.E2E_ABACATEPAY_PORT ?? '3199');
const SECRET = process.env.E2E_ABACATEPAY_WEBHOOK_SECRET ?? '';
const APP_PORT = process.env.E2E_PORT ?? '3000';

let fake: FakeAbacatePay | null = null;

test.describe('plans and Pix @app', () => {
  test.describe.configure({ timeout: 240_000 });
  test.skip(SECRET === '', 'needs the e2e AbacatePay test variables (see the header)');

  // Only the Pix test talks to the fake, and the server is pinned to its fixed port. With fullyParallel every test of a
  // describe runs its beforeAll in its own worker, so a hook shared with the webhook test bound the port twice
  // (EADDRINUSE in the first CI run): the fake lives in a describe of its own.
  test.describe('with the fake AbacatePay', () => {
    test.beforeAll(async () => {
      fake = await startFakeAbacatePay({
        port: FAKE_PORT,
        webhookUrl: `http://localhost:${APP_PORT}/api/webhooks/abacatepay`,
        webhookSecret: SECRET,
      });
    });
    test.afterAll(async () => {
      await fake?.close();
      fake = null;
    });

    test('Pix in Test Mode: charge → "Simular pagamento" → webhook → Empresa unlocks every calculation', async ({
      page,
    }) => {
      await finishTrack(page);
      const id = await analyze(page);
      // D58: Screen 4 ends with the Empresa offer over the confirmed total; the dashboard carries the same card.
      const screen4 = page.getByTestId('roi-offer');
      await expect(screen4).toHaveAttribute('data-variant', 'confirmed');
      const confirmed = await page.getByTestId('analysis/money-hero').getAttribute('data-cents');
      await expect(screen4).toHaveAttribute('data-cents', confirmed ?? '');
      await page.goto(`/app/analises/${id}/painel`);
      const painel = page.getByTestId('roi-offer');
      await expect(painel).toHaveAttribute('data-variant', 'confirmed');
      await expect(painel).toHaveAttribute(
        'data-cents',
        (await page.getByTestId('dashboard/money-hero').getAttribute('data-cents')) ?? '',
      );
      await expect(painel.getByTestId('roi-unlock')).toHaveAttribute(
        'href',
        `/app/plano?assinar=business-yearly&voltar=${encodeURIComponent(`/app/analises/${id}/painel`)}`,
      );
      // Free: a finding that is not the largest arrives locked.
      const sse = await page.request.get(`/api/analises/${id}/eventos?from=100000`);
      const findings = (await sse.text())
        .split('\n\n')
        .filter((f) => /^event: (finding|alert)$/m.test(f))
        .map((f) => JSON.parse(/^data: (.*)$/m.exec(f)?.[1] ?? 'null').finding);
      const locked = findings.find((f) => f.traceLocked === true);
      expect(locked).toBeTruthy();
      await page.goto(`/app/analises/${id}/achados/${locked.id}`);
      await expect(page.getByTestId('trace-locked')).toBeVisible();
      await page.getByTestId('trace-locked-upgrade').click();
      await expect(page).toHaveURL(/\/app\/plano\?voltar=/);

      await expect(page.getByTestId('current-plan')).toHaveAttribute('data-plan', 'free');
      await expect(page.getByTestId('period-yearly')).toBeChecked();
      await page.getByTestId('subscribe-business').click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByTestId('pix-amount')).toHaveAttribute('data-cents', '59900');
      await expect(dialog.getByTestId('pix-qr')).toBeVisible();
      await expect(dialog.getByTestId('pix-brcode')).toHaveValue(/^00020101/);
      await expect(dialog.getByTestId('test-mode-label')).toContainText('Modo de teste');
      await expect(dialog.getByTestId('pix-status')).toHaveAttribute('data-status', 'pending');
      // The charge reached AbacatePay with the catalog price.
      expect([...(fake?.charges.values() ?? [])].map((c) => c.amount)).toContain(59900);

      await dialog.getByTestId('simulate-payment').click();
      await expect(dialog.getByTestId('pix-status')).toHaveAttribute('data-status', 'paid', {
        timeout: 30_000,
      });
      await expect(dialog).toContainText('Boas-vindas ao Empresa');
      expect(fake?.deliveries.at(-1)?.status).toBe(200);
      await expect(dialog.getByTestId('pix-done')).toHaveText(/Ver o cálculo completo/);
      // Back to the finding that hit the paywall: it now carries its trace on screen.
      await dialog.getByTestId('pix-done').click();
      await expect(page).toHaveURL(new RegExp(`/app/analises/${id}/achados/${locked.id}$`));
      await expect(page.getByTestId('calc-trace')).toBeVisible();
      await page.goto('/app/plano');
      await expect(page.getByTestId('current-plan')).toHaveAttribute('data-plan', 'business');
      // A second payment is not under the guarantee: the note points to the CDC art. 49 withdrawal (D37).
      await expect(page.getByTestId('change-plan-note')).toContainText('art. 49');
      await expect(page.getByTestId('change-plan-note')).not.toContainText('garantia');
      // D41: the analysis uses an ME/EPP CNPJ and Pessoal keeps Grátis's CNPJ, so it is still sold, with a hint.
      await expect(page.getByTestId('personal-hint')).toContainText('Empresa');
      await expect(page.getByTestId('subscribe-personal')).toBeVisible();
      await page.goto(`/app/analises/${id}/achados/${locked.id}`);
      await expect(page.getByTestId('trace-locked')).toHaveCount(0);
      await expect(page.getByTestId('plan-label')).toContainText('Empresa');
    });
  });

  test('D58: the estimate offers Empresa; "Desbloquear" opens the yearly Pix on /app/plano by itself', async ({
    page,
  }) => {
    // Before the estimate the plans page stays locked (D42, relaxed by D58 only from the estimate on).
    await page.goto('/app/plano');
    await expect(page).toHaveURL(/\/app\/comecar\/cnpj$/);
    await page.getByLabel('CNPJ da sua empresa').fill(HERO_CNPJ);
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page).toHaveURL(/\/confirmar-empresa$/);
    await tap(page, 'Sou eu', /\/faturamento$/);
    await tap(page, 'R$ 30 mil a 60 mil', /\/funcionarios$/);
    await tap(page, 'Sim', /\/exterior$/);
    await tap(page, 'Sim, metade ou mais', /\/estimativa$/);

    // The ROI is the range's minimum over the yearly Empresa price, floored (never the maximum).
    const min = Number(await page.getByTestId('profile-range').getAttribute('data-cents-min'));
    const multiple = (min - (min % 59900)) / 59900;
    const offer = page.getByTestId('roi-offer');
    await expect(offer).toHaveAttribute('data-variant', 'estimate');
    await expect(offer).toHaveAttribute('data-cents', String(min));
    await expect(offer).toHaveAttribute('data-multiple', String(multiple));
    await expect(offer.getByTestId('roi-price')).toHaveAttribute('data-cents', '59900');
    await expect(offer.getByTestId('roi-multiple')).toContainText(`${multiple} vezes`);
    await expect(offer.getByTestId('see-exact-number')).toBeVisible();
    await expect(offer.getByTestId('roi-monthly-loss')).toContainText('estimados');

    // Review M5, at 390 px: no horizontal scroll, and with the card on screen both ways on are in the viewport.
    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await offer.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    for (const id of ['roi-unlock', 'see-exact-number']) {
      const box = await offer.getByTestId(id).boundingBox();
      expect(box, id).not.toBeNull();
      expect((box?.y ?? -1) >= 0 && (box?.y ?? 0) + (box?.height ?? 0) <= 844, id).toBe(true);
    }
    await page.setViewportSize({ width: 1280, height: 720 });
    const unlock = offer.getByTestId('roi-unlock');
    await expect(unlock).toHaveAttribute(
      'href',
      '/app/plano?assinar=business-yearly&voltar=%2Fapp%2Fcomecar%2Festimativa',
    );

    // With login off (CI) the checkout needs no account: the Pix dialog opens on arrival, yearly Empresa, on a
    // confirmation step (review M3: no charge exists until "Gerar Pix").
    await unlock.click();
    await expect(page).toHaveURL(/\/app\/plano\?/);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Pix · Empresa');
    await expect(dialog).toHaveAttribute('data-state', 'confirm');
    await expect(dialog.getByTestId('pix-confirm-amount')).toHaveAttribute('data-cents', '59900');
    await expect(page.getByTestId('period-yearly')).toBeChecked();
    await expect(page.getByTestId('plans-heading')).toHaveAttribute(
      'data-multiple',
      String(multiple),
    );
    await expect(page.getByTestId('plans-heading')).toContainText(`Retorno de ${multiple}× para`);
    await dialog.getByTestId('pix-generate').click();
    await expect(dialog).not.toHaveAttribute('data-state', 'confirm');
    // The intent is used once: it leaves the URL, so a reload does not open a second Pix.
    await expect(page).not.toHaveURL(/assinar=/);
    await dialog.getByTestId('pix-close').click();
    await page.reload();
    await expect(page.getByTestId('plan-page')).toBeVisible();
    await expect(page.getByTestId('pix-dialog')).toHaveCount(0);
    // The way back leads to the estimate, which still offers the free path.
    await page.getByRole('link', { name: '← Voltar' }).click();
    await expect(page).toHaveURL(/\/app\/comecar\/estimativa$/);

    // A failed sign-in comes back with ?login=erro: a polite alert, a retry, and the param leaves the URL.
    await page.goto('/app/plano?login=erro');
    const alert = page.getByTestId('login-error');
    await expect(alert).toContainText('Não conseguimos concluir o login. Tente de novo.');
    await expect(alert.getByTestId('login-retry')).toHaveAttribute(
      'href',
      '/auth/entrar?voltar=%2Fapp%2Fplano',
    );
    await expect(page).not.toHaveURL(/login=/);
  });

  test('the webhook refuses a valid secret with a bad signature (401)', async ({ request }) => {
    const res = await request.post('/api/webhooks/abacatepay', {
      headers: { 'x-webhook-secret': SECRET, 'x-webhook-signature': 'bm9wZQ==' },
      data: { id: 'log_forged', event: 'transparent.completed', devMode: true, data: {} },
    });
    expect(res.status()).toBe(401);
  });
});
