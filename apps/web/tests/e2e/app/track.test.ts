import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures.ts';

// TESTS §6.2 @app (Postgres 17 + replay in CI; DATA_MODE=replay, no Pluggy keys): A1, A2, A8 on the
// first-access track (D19). The DB-side checks (companies without QSA, CPF only as HMAC, the
// `connection_status` enum) are in tests/integration/track.test.ts, where the database is queried
// directly; here the UI label "Ativa" is asserted (EXECUTION §9, row "TESTS A2 'ativa'").

const HERO_CNPJ = 'RF.DEV.001/0001-58';
const PRESUMIDO_CNPJ = 'RF.PRE.S01/0001-37';
const UNKNOWN_CNPJ = 'RF.NON.E01/0001-22';

async function lookUp(page: Page, cnpj: string): Promise<void> {
  await page.goto('/app');
  await expect(page).toHaveURL(/\/app\/comecar\/cnpj$/);
  await page.getByLabel('CNPJ da sua empresa').fill(cnpj);
  await page.getByRole('button', { name: 'Continuar' }).click();
}

async function tap(page: Page, label: string, nextUrl: RegExp): Promise<void> {
  await page.getByRole('button', { name: label, exact: true }).click();
  await expect(page).toHaveURL(nextUrl);
}

test.describe('first-access track @app', () => {
  test('A1: /app without a session creates rf_sid and looks up a persona CNPJ (replay)', async ({
    page,
    context,
  }) => {
    expect(await context.cookies()).toEqual([]);
    await page.goto('/app');
    const cookie = (await context.cookies()).find((c) => c.name === 'rf_sid');
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('Lax');

    await lookUp(page, HERO_CNPJ);
    await expect(page).toHaveURL(/\/app\/comecar\/confirmar-empresa$/);
    const card = page.getByTestId('company-card');
    await expect(card).toHaveAttribute('data-cnpj', 'RFDEV001000158');
    await expect(page.getByTestId('company-name')).toHaveText('MARINA DEV LTDA');
    await expect(card).toContainText('Simples Nacional');
    // Rule 6.9: never partners (QSA) on the card.
    await expect(card).not.toContainText(/s[óo]cio/i);
  });

  test('A2: profile → estimate → consent → sample PJ and PF accounts → status "Ativa"', async ({
    page,
  }) => {
    await lookUp(page, HERO_CNPJ);
    await tap(page, 'Sou eu', /\/faturamento$/);
    await tap(page, 'R$ 30 mil a 60 mil', /\/funcionarios$/);

    // Answers are saved per step: leaving and coming back resumes where it stopped.
    await page.goto('/app');
    await expect(page).toHaveURL(/\/app\/comecar\/funcionarios$/);

    await tap(page, 'Sim', /\/exterior$/);
    await tap(page, 'Sim, metade ou mais', /\/estimativa$/);

    const range = page.getByTestId('profile-range');
    await expect(range).toContainText(/de R\$ \d+ mil a R\$ \d+ mil por ano/);
    const min = Number(await range.getAttribute('data-cents-min'));
    const max = Number(await range.getAttribute('data-cents-max'));
    expect(Number.isSafeInteger(min) && Number.isSafeInteger(max) && min < max).toBe(true);
    await expect(page.getByText('estimativa por perfil')).toBeVisible();
    await expect(page.getByTestId('applicable-R01')).toBeVisible();
    await expect(page.getByTestId('applicable-R05')).toBeVisible();
    await expect(page.getByTestId('applicable-R01').getByTestId('law-seal')).toBeVisible();

    await page.getByTestId('see-exact-number').click();
    await expect(page).toHaveURL(/\/permissoes$/);
    await page.getByTestId('give-consent').click();
    await expect(page).toHaveURL(/\/conta-pj$/);

    await page.getByTestId('use-sample-data').click();
    const pj = page.getByTestId('account-card-PJ').getByTestId('connection-status');
    await expect(pj).toHaveAttribute('data-status', 'active');
    await expect(pj).toContainText('Ativa');
    await expect(pj).toContainText(/\d+ transações/);
    await page.getByTestId('track-continue').click();
    await expect(page).toHaveURL(/\/conta-pf$/);

    await page.getByTestId('use-sample-data').click();
    await expect(
      page.getByTestId('account-card-PF').getByTestId('connection-status'),
    ).toHaveAttribute('data-status', 'active');
    await page.getByTestId('track-continue').click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole('heading', { name: 'Tudo pronto para a análise.' })).toBeVisible();
  });

  test('A8: without PLUGGY_CLIENT_ID the real-bank button is absent and the persona takes over', async ({
    page,
  }) => {
    await lookUp(page, HERO_CNPJ);
    await tap(page, 'Sou eu', /\/faturamento$/);
    await tap(page, 'R$ 30 mil a 60 mil', /\/funcionarios$/);
    await tap(page, 'Não', /\/exterior$/);
    await tap(page, 'Não', /\/estimativa$/);
    await page.getByTestId('see-exact-number').click();
    await page.getByTestId('give-consent').click();
    await expect(page).toHaveURL(/\/conta-pj$/);

    await expect(page.getByTestId('connect-real-bank')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Conectar banco real/ })).toHaveCount(0);
    await expect(page.getByTestId('open-finance-video-note')).toContainText('demonstrada no vídeo');
    await expect(page.getByTestId('use-sample-data')).toBeEnabled();
  });

  test('the shell stays locked: a future step leads back to the current one', async ({ page }) => {
    await lookUp(page, HERO_CNPJ);
    await page.goto('/app/comecar/conta-pj');
    await expect(page).toHaveURL(/\/confirmar-empresa$/);
    await page.goto('/app/comecar/nao-existe');
    await expect(page.getByText(/não encontrad|could not be found|404/i).first()).toBeVisible();
  });

  test('a Lucro Presumido company skips the optional questions and gets the reason, no R$', async ({
    page,
  }) => {
    await lookUp(page, PRESUMIDO_CNPJ);
    await tap(page, 'Sou eu', /\/faturamento$/);
    // No "funcionários?" nor "exterior?": out of the Simples (ENGINE-SPEC C.11.1, C.11.5 item 3).
    await tap(page, 'R$ 60 mil a 150 mil', /\/estimativa$/);
    const none = page.getByTestId('no-range');
    await expect(none).toHaveAttribute('data-reason', 'REGIME_OUT_OF_SCOPE');
    await expect(none).toContainText('Por enquanto o Refund calcula empresas do Simples Nacional.');
    await expect(page.getByTestId('profile-range')).toHaveCount(0);
    await expect(page.getByTestId('estimate')).not.toContainText('R$');
    await page.goto('/app/comecar/funcionarios');
    await expect(page).toHaveURL(/\/estimativa$/);
  });

  test('CNPJ not found: the error stays on the step, in plain words', async ({ page }) => {
    await lookUp(page, UNKNOWN_CNPJ);
    await expect(page.getByTestId('cnpj-hint')).toHaveText(
      'Não achamos esse CNPJ na Receita. Confere os números?',
    );
    await expect(page).toHaveURL(/\/cnpj$/);
  });

  test('"Não é minha empresa" goes back to the CNPJ step', async ({ page }) => {
    await lookUp(page, HERO_CNPJ);
    await page.getByTestId('reject-company').click();
    await expect(page).toHaveURL(/\/cnpj$/);
    await page.goto('/app/comecar/confirmar-empresa');
    await expect(page).toHaveURL(/\/cnpj$/);
  });

  test('a CNPJ typed on the landing (?cnpj=) is looked up on arrival', async ({ page }) => {
    await page.goto('/app');
    await page.goto(`/app/comecar/cnpj?cnpj=${encodeURIComponent(HERO_CNPJ)}`);
    await expect(page).toHaveURL(/\/confirmar-empresa$/);
  });
});
