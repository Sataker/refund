import { expect, test } from '../fixtures.ts';
import { type FakeAbacatePay, startFakeAbacatePay } from '../support/fake-abacatepay.ts';
import { analyze, finishTrack } from './live-flow.ts';

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

  test.beforeAll(async () => {
    fake = await startFakeAbacatePay({
      port: FAKE_PORT,
      webhookUrl: `http://localhost:${APP_PORT}/api/webhooks/abacatepay`,
      webhookSecret: SECRET,
    });
  });
  test.afterAll(async () => {
    await fake?.close();
  });

  test('Pix in Test Mode: charge → "Simular pagamento" → webhook → Empresa unlocks every calculation', async ({
    page,
  }) => {
    await finishTrack(page);
    const id = await analyze(page);
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
    await expect(page).toHaveURL(/\/app\/plano$/);

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
    await expect(dialog).toContainText('Bem-vindo ao Empresa');
    expect(fake?.deliveries.at(-1)?.status).toBe(200);
    await dialog.getByTestId('pix-done').click();
    await expect(page.getByTestId('current-plan')).toHaveAttribute('data-plan', 'business');

    // The same finding now carries its trace on the wire and on screen.
    await page.goto(`/app/analises/${id}/achados/${locked.id}`);
    await expect(page.getByTestId('calc-trace')).toBeVisible();
    await expect(page.getByTestId('trace-locked')).toHaveCount(0);
    await expect(page.getByTestId('plan-label')).toContainText('Empresa');
  });

  test('the webhook refuses a valid secret with a bad signature (401)', async ({ request }) => {
    const res = await request.post('/api/webhooks/abacatepay', {
      headers: { 'x-webhook-secret': SECRET, 'x-webhook-signature': 'bm9wZQ==' },
      data: { id: 'log_forged', event: 'transparent.completed', devMode: true, data: {} },
    });
    expect(res.status()).toBe(401);
  });
});
