import type { Page } from '@playwright/test';
import { expect } from '../fixtures.ts';

// Shared steps of the live /app e2e (E14, E17): the first-access track with the hero's sample accounts and one
// analysis run to the end.

export const HERO_CNPJ = 'RF.DEV.001/0001-58';

export async function tap(page: Page, label: string, nextUrl: RegExp): Promise<void> {
  await page.getByRole('button', { name: label, exact: true }).click();
  await expect(page).toHaveURL(nextUrl);
}

/** First-access track with the hero's sample PJ and PF accounts, ending on /app. */
export async function finishTrack(page: Page): Promise<void> {
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
export async function analyze(page: Page): Promise<string> {
  await page.goto('/app');
  await page.getByTestId('start-analysis').click();
  await expect(page).toHaveURL(/\/app\/analises\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId('analysis')).toHaveAttribute('data-status', 'done', {
    timeout: 60_000,
  });
  return new URL(page.url()).pathname.split('/').at(-1) as string;
}
