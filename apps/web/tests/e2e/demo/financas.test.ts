import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures.ts';

// Screen 5b, Finanças (EXECUTION E14b; TESTS §6.1 D17, D15 and D16 on /financas). Values through data-cents, from
// ENGINE-SPEC E.9.3 (Marina's view). The network guard of fixtures.ts fails any external request.
const URL = '/demo/dev-exportador/financas';

async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState === 'finished'),
  );
}

test.describe('financas @demo', () => {
  test('D17 financial view of the hero: totals, DAS seal → R05-REC, PF health deductible, empty states', async ({
    page,
  }) => {
    await page.goto(URL);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Para onde foi o dinheiro');
    await expect(page.getByTestId('fv-total-outflow')).toHaveAttribute('data-cents', '56004654');
    await expect(page.getByTestId('fv-total-inflow')).toHaveAttribute('data-cents', '60000000');

    const das = page.getByTestId('fv-group-das');
    await expect(das).toHaveAttribute('data-cents', '10710000');
    const seal = page.getByTestId('fv-seal-das-money_to_receive');
    await expect(seal).toContainText('tem dinheiro a receber');
    await expect(page.getByTestId('fv-seal-das-lower_tax')).toContainText('pode pagar menos');

    await expect(page.getByTestId('fv-recurring')).toHaveAttribute('data-count', '1');
    await expect(page.getByTestId('fv-fees')).toHaveAttribute('data-cents', '0');
    await expect(page.getByTestId('fv-duplicates')).toHaveAttribute('data-count', '0');
    await expect(page.getByTestId('fv-net-basis-note')).toBeVisible();

    // E.9.3 note 3: the jul/2026 total delta (+R$ 62.319,01) never reaches the screen; the driver's delta does.
    await expect(page.locator('[data-cents="6231901"]')).toHaveCount(0);
    await expect(page.getByTestId('fv-highlight').first().locator('[data-cents]')).toHaveAttribute(
      'data-cents',
      '6300000',
    );

    await seal.click();
    await page.getByTestId('fv-seal-link-R05-REC').click();
    await expect(page).toHaveURL(/\/demo\/dev-exportador\/achados\/R05-REC$/);

    await page.goto(URL);
    await page.getByTestId('fv-holder-pf').click();
    await expect(page).toHaveURL(/\?holder=pf$/);
    const health = page.getByTestId('fv-group-health');
    await expect(health).toHaveAttribute('data-cents', '1740000');
    await expect(page.getByTestId('fv-seal-health-deductible')).toContainText('é dedutível');
    await expect(page.getByTestId('fv-recurring')).toHaveAttribute('data-count', '3');
    await expect(page.getByTestId('fv-fees')).toHaveAttribute('data-cents', '0');
    await expect(page.getByTestId('fv-duplicates')).toHaveAttribute('data-count', '0');
    await expect(page.getByTestId('fv-group-das')).toHaveCount(0);
  });

  test('D17 every group sums to its tile and every seal names a finding of the engine', async ({
    page,
  }) => {
    for (const holder of ['pj', 'pf'] as const) {
      await page.goto(`${URL}?holder=${holder}`);
      await expect(page.getByTestId(`fv-panel-${holder}`)).toBeVisible();
      const sums = await page.evaluate(() => {
        const groups = [...document.querySelectorAll<HTMLElement>('[data-testid^="fv-group-"]')];
        return groups.map((g) => Number(g.dataset.cents));
      });
      const inflow = Number(await page.getByTestId('fv-total-inflow').getAttribute('data-cents'));
      const outflow = Number(await page.getByTestId('fv-total-outflow').getAttribute('data-cents'));
      expect(sums.reduce((a, b) => a + b, 0)).toBe(inflow + outflow);
      for (const s of await page.locator('[data-testid^="fv-seal-"][data-kind]').all()) {
        // Icon + label, never color alone.
        await expect(s).toHaveAccessibleName(
          /tem dinheiro a receber|pode pagar menos|é dedutível|é risco|atenção/,
        );
      }
    }
  });

  test('D17 ?holder=pf opens the PF and #grupo-<slug> opens that group expanded', async ({
    page,
  }) => {
    await page.goto(`${URL}#grupo-das`);
    await expect(
      page.getByTestId('fv-group-das').getByRole('button', { expanded: true }),
    ).toBeVisible();
    await page.goto(`${URL}?holder=pf`);
    await expect(page.getByTestId('fv-holder-pf')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('fv-group-health')).toBeVisible();
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`D15 financas has no serious or critical axe violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.goto(`${URL}#grupo-das`);
      await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${scheme}\\b`));
      await expect(page.getByTestId('fv-month-bars').locator('svg').first()).toBeVisible();
      await settled(page);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
        .analyze();
      const blocking = results.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      );
      expect(
        blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
      ).toEqual([]);
    });
  }

  test('D16 financas on a phone: no horizontal scroll, seal opens as a bottom sheet', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'demo-mobile', 'mobile only');
    await page.goto(URL);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await page.getByTestId('fv-seal-das-money_to_receive').click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId('fv-seal-link-R05-REC')).toBeVisible();
    await sheet.getByRole('button', { name: 'Fechar' }).click();
    await expect(sheet).toHaveCount(0);
    // Secondary sections start collapsed on the phone.
    await expect(
      page.getByTestId('fv-fees').getByText('Nenhuma tarifa bancária em 12 meses.'),
    ).toBeHidden();
    await page.getByTestId('fv-fees').getByRole('button').click();
    await expect(
      page.getByTestId('fv-fees').getByText('Nenhuma tarifa bancária em 12 meses.'),
    ).toBeVisible();
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`financas screenshot (${scheme})`, async ({ page }, testInfo) => {
      test.setTimeout(90_000);
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      if (testInfo.project.name === 'demo-mobile')
        await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${URL}#grupo-das`);
      await expect(page.getByTestId('fv-month-bars').locator('svg').first()).toBeVisible();
      await settled(page);
      const width = testInfo.project.name === 'demo-mobile' ? 390 : 1280;
      await page.screenshot({
        path: testInfo.outputPath(`financas-${width}-${scheme}.png`),
        fullPage: true,
      });
      await page.getByTestId('fv-holder-pf').click();
      await settled(page);
      await page.screenshot({
        path: testInfo.outputPath(`financas-${width}-${scheme}-pf.png`),
        fullPage: true,
      });
    });
  }
});
