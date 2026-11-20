import AxeBuilder from '@axe-core/playwright';
import { expect, test, unlockShell } from '../fixtures.ts';

// TESTS §6.1 D14 (E17): /demo plans → simulated Pix → "Simular pagamento" → Empresa (simulado), the simulation label
// always visible. Prices compared through data-cents / the catalog values of research 07. The network guard of
// fixtures.ts fails any external request (zero env, no AbacatePay).
const URL = '/demo/dev-exportador/plano';

test.describe('plans @demo', () => {
  test.beforeEach(async ({ page }) => {
    await unlockShell(page);
  });

  test('D14: plan → simulated Pix → "Simular pagamento" → Empresa (simulado) unlocked', async ({
    page,
  }) => {
    await page.goto(URL);
    await expect(page.getByTestId('simulation-label')).toBeVisible();
    await expect(
      page
        .getByTestId('plan-cards')
        .getByRole('listitem')
        .filter({ has: page.locator('h2') }),
    ).toHaveCount(4);
    for (const id of ['free', 'personal', 'business', 'accountant'])
      await expect(page.getByTestId(`plan-card-${id}`)).toBeVisible();
    await expect(page.getByTestId('current-plan')).toHaveAttribute('data-plan', 'free');
    // Annual preselected; prices from 07 §3.1.
    await expect(page.getByTestId('period-yearly')).toBeChecked();
    await expect(page.getByTestId('plan-card-business')).toContainText('R$ 599/ano');
    await expect(page.getByTestId('plan-card-personal')).toContainText('R$ 199/ano');
    // D41: Pessoal keeps Grátis's CNPJ. D37: the guarantee and the CDC art. 49 withdrawal, as on /termos.
    await expect(page.getByTestId('plan-card-personal')).toContainText('Pessoa física + 1 CNPJ');
    await expect(page.getByTestId('guarantee')).toContainText('30 dias a partir do pagamento');
    await expect(page.getByTestId('guarantee')).toContainText('art. 49');
    await page.getByTestId('toggle-mei').check();
    await expect(page.getByTestId('plan-card-personal')).toContainText('R$ 299/ano');
    await page.getByTestId('period-monthly').check({ force: true });
    await expect(page.getByTestId('plan-card-business')).toContainText('R$ 69,90/mês');
    await page.getByTestId('period-yearly').check({ force: true });
    await expect(page.getByTestId('contact-firms')).toContainText('Escritório e API');
    await expect(page.getByTestId('success-fee')).toContainText('20%');
    await expect(page.getByTestId('success-fee')).toContainText('15% no anual');

    await page.getByTestId('subscribe-business').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('simulação');
    await expect(dialog.getByTestId('pix-amount')).toHaveAttribute('data-cents', '59900');
    await expect(dialog.getByTestId('pix-qr')).toHaveAttribute('data-simulated', 'true');
    await expect(dialog.getByTestId('pix-status')).toHaveAttribute('data-status', 'pending');
    await dialog.getByTestId('simulate-payment').click();
    await expect(dialog.getByTestId('pix-status')).toHaveAttribute('data-status', 'paid', {
      timeout: 10_000,
    });
    await expect(dialog).toContainText('Boas-vindas ao Empresa (simulado)');
    await dialog.getByTestId('pix-done').click();
    await expect(page.getByTestId('current-plan')).toHaveAttribute('data-plan', 'business');
    await expect(page.getByTestId('current-plan')).toContainText('Empresa (simulado)');
    await expect(
      page.getByTestId('plan-card-business').getByTestId('plan-current-badge'),
    ).toBeVisible();
    await expect(page.getByTestId('simulation-label')).toBeVisible();

    // The simulated plan survives a reload (browser state only).
    await page.reload();
    await expect(page.getByTestId('current-plan')).toHaveAttribute('data-plan', 'business');
  });

  test('D14: the plans page is reachable from the shell and has no serious a11y violations', async ({
    page,
  }, testInfo) => {
    await page.goto('/demo/dev-exportador/painel');
    const link = testInfo.project.name === 'demo-mobile' ? 'header-plano' : 'nav-plano';
    await page.getByTestId(link).click();
    await expect(page).toHaveURL(/\/demo\/dev-exportador\/plano$/);
    await expect(page.getByTestId('plans-screen')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
      .analyze();
    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(serious.map((v) => v.id)).toEqual([]);
  });
});
