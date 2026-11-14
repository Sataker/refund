import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures.ts';

// E6 definition of done: the landing's axe check lives in a test with "landing" in its title.
// Numbers are compared through data-cents (TESTS conventions) against the hero answer key (ENGINE-SPEC F.4).
const HERO = { savings12m: 6231892, regime: 7400628, recovery: [3978768, 19893840] as const };

/** Waits until every CSS animation on the page has finished (none loop under reduced motion). */
async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState === 'finished'),
  );
}

test.describe('landing @demo', () => {
  test('landing shows the hero numbers from the answer key', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Ache o dinheiro que o governo te deve.',
    );
    await expect(page.getByTestId('landing/money-hero')).toHaveAttribute(
      'data-cents',
      String(HERO.savings12m),
    );
    await expect(page.getByTestId('landing/regime-total')).toHaveAttribute(
      'data-cents',
      String(HERO.regime),
    );
    await expect(page.getByTestId('landing/recovery-min')).toHaveAttribute(
      'data-cents',
      String(HERO.recovery[0]),
    );
    await expect(page.getByTestId('landing/recovery-max')).toHaveAttribute(
      'data-cents',
      String(HERO.recovery[1]),
    );
    await expect(page.getByTestId('sandbox-seal').first()).toBeVisible();
    await expect(page.getByTestId('disclaimer').first()).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  });

  test('landing CNPJ field masks, explains what is missing and opens the demo', async ({
    page,
  }) => {
    await page.goto('/');
    const field = page.getByLabel('CNPJ da sua empresa').first();
    await field.fill('rfdev001000');
    await expect(field).toHaveValue('RF.DEV.001/000');
    await page.getByRole('button', { name: 'Ver quanto posso economizar' }).first().click();
    await expect(page.getByText('Faltam 3 dígitos').first()).toBeVisible();
    await expect(field).toHaveAttribute('aria-invalid', 'true');

    await field.fill('RF.DEV.001/0001-58');
    await expect(field).toHaveAttribute('aria-invalid', 'false');
    await page.getByRole('button', { name: 'Ver quanto posso economizar' }).first().click();
    await expect(page).toHaveURL(/\/demo$/);
  });

  test('landing demo link points to /demo', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('link', { name: 'Ver demo com a Marina, dev que exporta' }).first(),
    ).toHaveAttribute('href', '/demo');
  });

  test('landing theme toggles with D and with the button, without layout shift', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    const html = page.locator('html');
    await expect(html).toHaveClass(/\blight\b/);
    const before = await page.getByRole('heading', { level: 1 }).boundingBox();
    await page.keyboard.press('d');
    await expect(html).toHaveClass(/\bdark\b/);
    const after = await page.getByRole('heading', { level: 1 }).boundingBox();
    expect(after).toEqual(before);
    await page.getByTestId('theme-toggle').click();
    await expect(html).toHaveClass(/\blight\b/);
    // The choice survives a reload (theme-init.js reads it before the first paint).
    await page.keyboard.press('d');
    await page.reload();
    await expect(html).toHaveClass(/\bdark\b/);
  });

  test('landing keyboard: skip link and visible focus on the CNPJ field', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Pular para o conteúdo' })).toBeFocused();
    const field = page.getByLabel('CNPJ da sua empresa').first();
    await field.focus();
    const outline = await field.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).toBe('solid');
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`landing has no serious or critical axe violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.goto('/');
      await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${scheme}\\b`));
      // Contrast is measured on the settled page: the highlight band fades in (200 ms under reduced motion),
      // and axe would otherwise read the ink digits against the page instead of the amber band.
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

  for (const scheme of ['light', 'dark'] as const) {
    test(`landing screenshot (${scheme})`, async ({ page }, testInfo) => {
      // A full-page capture of the long mobile page at DPR 2.6 is slow on a busy machine.
      test.setTimeout(90_000);
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.goto('/');
      await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${scheme}\\b`));
      await settled(page);
      await page.screenshot({
        path: testInfo.outputPath(`landing-${testInfo.project.name}-${scheme}.png`),
        fullPage: true,
      });
    });
  }
});
