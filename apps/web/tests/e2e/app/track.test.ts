import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures.ts';

// TESTS §6.2 @app (Postgres 17 + replay in CI; DATA_MODE=replay, no Pluggy keys): A1, A2, A8 on the
// first-access track (D19). The DB-side checks (companies without QSA, CPF only as HMAC, the
// `connection_status` enum) are in tests/integration/track.test.ts, where the database is queried
// directly; here the UI label "Ativa" is asserted (EXECUTION §9, row "TESTS A2 'ativa'").

const HERO_CNPJ = 'RF.DEV.001/0001-58';

/** Today in Brasília time, 'YYYY-MM-DD' (the server's `analysisDate`). */
function todayBrt(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}
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
    await expect(range).toContainText(/de R\$\s\d+ mil a R\$\s\d+ mil por ano/);
    // D33 (ENGINE-SPEC C.11.7): R01 and R05 carry a range; the R02 alert never counts.
    await expect(range).toContainText('Com o seu perfil, duas dessas regras valem');
    // ENGINE-SPEC C.11.10 hero values. The server uses today in BRT as `analysisDate`; they hold while
    // the steady state is 2028 and the minimum wage of the month after the analysis is 2026's, i.e.
    // through 30/11/2026. From December (freeze, final) only the shape is checked (EXECUTION §9, E11).
    if (todayBrt() <= '2026-11-30') {
      await expect(range).toHaveAttribute('data-cents-min', '1246338');
      await expect(range).toHaveAttribute('data-cents-max', '9077928');
      await expect(range).toContainText(/de R\$\s12 mil a R\$\s91 mil por ano/);
    } else {
      const min = Number(await range.getAttribute('data-cents-min'));
      const max = Number(await range.getAttribute('data-cents-max'));
      expect(Number.isSafeInteger(min) && Number.isSafeInteger(max) && min < max).toBe(true);
    }
    await expect(page.getByText('estimativa por perfil')).toBeVisible();
    await expect(page.getByTestId('applicable-R01')).toBeVisible();
    await expect(page.getByTestId('applicable-R05')).toBeVisible();
    await expect(page.getByTestId('applicable-R01').getByTestId('law-seal')).toBeVisible();

    await page.getByTestId('see-exact-number').click();
    await expect(page).toHaveURL(/\/permissoes$/);
    // Compliance C2: the consent screen says this is Pluggy's sandbox, no real bank.
    await expect(page.getByTestId('sandbox-notice')).toContainText('a conexão é apagada na hora');
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

    // Compliance C2/C3: "Desconectar" on the final screen; the last one also withdraws the consent,
    // so the track goes back to the permissions step.
    await page.getByRole('button', { name: 'Desconectar: Sua conta pessoal' }).click();
    await expect(page).toHaveURL(/\/conta-pf$/);
    await page.goto('/app');
    await expect(page).toHaveURL(/\/conta-pf$/);
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
    await expect(
      page.getByText(/não achamos|não encontrad|could not be found|404/i).first(),
    ).toBeVisible();
  });

  test('H3: a Lucro Presumido company stops at "É você?" with its regime and the ways out', async ({
    page,
  }) => {
    await lookUp(page, PRESUMIDO_CNPJ);
    await expect(page).toHaveURL(/\/confirmar-empresa$/);
    const stop = page.getByTestId('out-of-scope');
    await expect(stop).toContainText(
      'Por enquanto o Refund calcula só empresas do Simples Nacional. A Consultoria Exemplo está no Lucro Presumido.',
    );
    await expect(page.getByTestId('confirm-company')).toHaveCount(0);
    await expect(page.getByTestId('out-of-scope-demo')).toHaveAttribute('href', '/demo');
    await expect(page.getByRole('button', { name: 'Entrar na lista' })).toBeVisible();
    // Never past this step: consent and the bank steps lead back here.
    for (const step of ['faturamento', 'estimativa', 'permissoes', 'conta-pj']) {
      await page.goto(`/app/comecar/${step}`);
      await expect(page).toHaveURL(/\/confirmar-empresa$/);
    }
    await page.getByTestId('out-of-scope-other-cnpj').click();
    await expect(page).toHaveURL(/\/cnpj$/);
  });

  test('M5: the step focuses its chip and keys 1-9 pick one from anywhere on the step', async ({
    page,
  }) => {
    await lookUp(page, HERO_CNPJ);
    await tap(page, 'Sou eu', /\/faturamento$/);
    await expect(page.getByTestId('choice-group').locator('button').first()).toBeFocused();
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('3');
    await expect(page).toHaveURL(/\/funcionarios$/);
    await expect(page.getByRole('link', { name: 'Pular para o conteúdo' })).toHaveAttribute(
      'href',
      '#conteudo',
    );
    await expect(page.getByRole('link', { name: 'Voltar ao site' })).toHaveAttribute('href', '/');
  });

  test('C1: a CNPJ typed on the landing lands on "É você?"', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('CNPJ da sua empresa').first().fill(HERO_CNPJ);
    await page.getByRole('button', { name: 'Ver quanto posso economizar' }).first().click();
    await expect(page).toHaveURL(/\/app\/comecar\/confirmar-empresa$/);
    await expect(page.getByTestId('company-card')).toBeVisible();
    // The hero is a synthetic company: the seal says so.
    await expect(page.getByTestId('sandbox-seal').first()).toContainText('Dados sintéticos');
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
