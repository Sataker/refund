import AxeBuilder from '@axe-core/playwright';
import { expect, test, unlockShell } from '../fixtures.ts';

// TESTS §6.1 D13 (P1, E16): "Law changed" → "Simular publicação": diff shown, affected rule highlighted, delta
// recalculated and labelled "simulação". The recalculation waits for the scenario's parameter (EXECUTION §9, E16);
// until then the page says nothing is recalculated, and that part of D13 is a fixme.

const BASE = '/demo/dev-exportador';

test.describe('D13 law changed @demo', () => {
  test.beforeEach(async ({ page }) => {
    await unlockShell(page);
  });

  test('the header bell opens the alerts; before the simulation, the empty state', async ({
    page,
  }) => {
    await page.goto(`${BASE}/painel`);
    await page.getByTestId('nav-alertas').click();
    await expect(page).toHaveURL(new RegExp(`${BASE}/alertas$`));
    await expect(page.getByRole('heading', { level: 1, name: 'Alertas' })).toBeVisible();
    await expect(page.getByTestId('law/empty')).toContainText(
      'Nenhuma mudança na lei que afete você desde 12/11.',
    );
    await expect(page.getByTestId('law/alert')).toHaveCount(0);
  });

  test('D13: "Simular publicação" shows the diff, the provisions and the affected rule, labelled simulação', async ({
    page,
  }) => {
    await page.goto(`${BASE}/alertas`);
    await page.getByTestId('law/simulate').click();
    const alert = page.getByTestId('law/alert');
    await expect(alert).toBeVisible();
    await expect(page.getByTestId('law/simulation-label')).toHaveText(/simulação/i);
    await expect(page.getByTestId('law/empty')).toHaveCount(0);

    const diff = page.getByTestId('law/diff');
    await expect(diff.locator('[data-diff="removed"]').first()).toContainText('R$ 81.000,00');
    await expect(diff.locator('[data-diff="added"]').first()).toContainText('R$ 140.000,00');
    await expect(diff.locator('[data-diff="added"] mark').first()).toBeVisible();

    await expect(alert.getByTestId('law-seal')).toHaveCount(2);
    await expect(alert.getByTestId('law-seal').first()).toContainText(
      'LC 123/2006, art. 18-A, § 1º',
    );

    const rule = page.getByTestId('law/rule-R03');
    await expect(rule).toHaveAttribute('data-affected', 'true');
    await expect(rule).toContainText('Limite do Simples e do MEI');
    await expect(page.getByTestId('law/impact')).toContainText('nenhum achado seu');
    await expect(alert).toContainText('não é uma captura real');

    const a11y = await new AxeBuilder({ page }).include('#conteudo').analyze();
    expect(a11y.violations).toEqual([]);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test.fixme('D13: delta recalculated with the scenario parameter set, labelled simulação', async ({
    page,
  }) => {
    // Needs PARAMETER_SCENARIOS + DEMO_LAW_CHANGE.scenarioId (EXECUTION §9, E16: parameter and value not specified).
    await page.goto(`${BASE}/alertas`);
    await page.getByTestId('law/simulate').click();
    await expect(page.getByTestId('law/impact')).toContainText('(simulação)');
    await expect(page.getByTestId('law/delta-after')).toHaveAttribute('data-cents', /\d+/);
  });
});
