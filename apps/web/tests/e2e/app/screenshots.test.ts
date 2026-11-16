import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures.ts';

// Review aid, not a check: walks the track and saves one screenshot per step at 390 px and 1280 px.
// Runs only with SCREENSHOTS_DIR set (never in CI).

const dir = process.env.SCREENSHOTS_DIR ?? '';
test.skip(dir === '', 'SCREENSHOTS_DIR not set');

async function settle(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState === 'finished'),
  );
}

for (const [label, width, height] of [
  ['390', 390, 844],
  ['1280', 1280, 800],
] as const) {
  test(`track screenshots at ${label}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const shot = async (name: string) => {
      await settle(page);
      await page.screenshot({ path: join(dir, `${label}-${name}.png`), fullPage: true });
    };
    await page.goto('/app');
    await shot('01-cnpj');
    await page.getByLabel('CNPJ da sua empresa').fill('RFDEV001000158');
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page).toHaveURL(/confirmar-empresa$/);
    await shot('02-confirmar-empresa');
    await page.getByRole('button', { name: 'Sou eu', exact: true }).click();
    await expect(page).toHaveURL(/faturamento$/);
    await shot('03-faturamento');
    await page.getByRole('button', { name: 'R$ 30 mil a 60 mil' }).click();
    await expect(page).toHaveURL(/funcionarios$/);
    await shot('04-funcionarios');
    await page.getByRole('button', { name: 'Sim', exact: true }).click();
    await expect(page).toHaveURL(/exterior$/);
    await shot('05-exterior');
    await page.getByRole('button', { name: 'Sim, metade ou mais' }).click();
    await expect(page).toHaveURL(/estimativa$/);
    await shot('06-estimativa');
    await page.getByText('Por que essa faixa?').click();
    await shot('06b-estimativa-por-que');
    await page.getByTestId('see-exact-number').click();
    await expect(page).toHaveURL(/permissoes$/);
    await shot('07-permissoes');
    await page.getByTestId('give-consent').click();
    await expect(page).toHaveURL(/conta-pj$/);
    await shot('08-conta-pj');
    await page.getByTestId('use-sample-data').click();
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-status', 'active');
    await shot('08b-conta-pj-ativa');
    await page.getByTestId('track-continue').click();
    await expect(page).toHaveURL(/conta-pf$/);
    await shot('09-conta-pf');
    await page.getByTestId('skip-pf').click();
    await expect(page).toHaveURL(/\/app$/);
    await shot('10-pronto');
  });
}
