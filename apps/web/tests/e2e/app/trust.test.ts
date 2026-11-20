import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures.ts';
import { tap } from './live-flow.ts';

// Bug bash 20/11 (13 real CNPJs): what the live /app may say about a company it did not get statements from. Replay
// mode with synthetic companies (replay-companies.ts): a Simples shop that runs Marina's example statements (C1, C2),
// closed and inapt companies (H4) and an MEI (H5).

const SHOP_CNPJ = 'RF.LOJ.A01/0001-03';
const BAIXADA_CNPJ = 'RF.BAI.X01/0001-36';
const INAPTA_CNPJ = 'RF.INA.P01/0001-43';
const SUSPENSA_CNPJ = 'RF.SUS.P01/0001-70';
const MEI_CNPJ = 'RF.MEI.S01/0001-28';

async function lookUp(page: Page, cnpj: string): Promise<void> {
  await page.goto('/app');
  await expect(page).toHaveURL(/\/app\/comecar\/cnpj$/);
  await page.getByLabel('CNPJ da sua empresa').fill(cnpj);
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page).toHaveURL(/\/confirmar-empresa$/);
}

/** The shop with the sample statements, through to Screen 4's end; returns the analysis id. */
async function shopAnalysis(page: Page): Promise<string> {
  await lookUp(page, SHOP_CNPJ);
  await tap(page, 'Sou eu', /\/faturamento$/);
  await tap(page, 'R$ 30 mil a 60 mil', /\/exterior$/);
  await tap(page, 'Não', /\/estimativa$/);
  // H7: without Pluggy keys the bank is example-only, and the button says so.
  await expect(page.getByTestId('see-exact-number')).toHaveText(/Continuar com dados de exemplo/);
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
  await page.getByTestId('start-analysis').click();
  await expect(page).toHaveURL(/\/app\/analises\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId('analysis')).toHaveAttribute('data-status', 'done', {
    timeout: 60_000,
  });
  return new URL(page.url()).pathname.split('/').at(-1) as string;
}

/** No visible "Confirmado" badge, and no badge hint "Dado do extrato e regra objetiva da lei". */
async function noConfirmedBadge(page: Page): Promise<void> {
  await expect(page.getByText('Dado do extrato e regra objetiva da lei')).toHaveCount(0);
  await expect(
    page.locator('[data-testid="confidence-badge"]', { hasText: /^Confirmado/ }),
  ).toHaveCount(0);
}

test.describe('live trust @app (bug bash 20/11)', () => {
  test.describe.configure({ timeout: 180_000 });

  test('C1: example statements never read as confirmed company data', async ({ page }) => {
    const id = await shopAnalysis(page);
    // Screen 4: the example title (D49 keeps the company), the example label and the ticker label.
    await expect(page.getByTestId('analysis-heading')).toHaveText(
      'Exemplo com o extrato da Marina, aplicado às regras da Loja Exemplo',
    );
    await expect(page.getByTestId('found-label')).toHaveText('Exemplo · extrato de exemplo');
    await expect(page.getByTestId('ticker-example-label')).toHaveText('Extrato de exemplo');
    await expect(page.getByTestId('data-origin-banner')).toBeVisible();
    for (const text of await page.getByTestId('analysis-alert-text').allTextContents())
      expect(text).toContain('No extrato de exemplo: ');

    for (const path of ['painel', 'confirmar', 'relatorio']) {
      await page.goto(`/app/analises/${id}/${path}`);
      await noConfirmedBadge(page);
    }
    await page.goto(`/app/analises/${id}/painel`);
    await expect(page.getByTestId('dashboard-heading')).toHaveText(
      'Exemplo com o extrato da Marina, aplicado às regras da Loja Exemplo',
    );
    for (const text of await page.getByTestId('alert-text').allTextContents())
      expect(text).toContain('No extrato de exemplo: ');
    // H1: every Confirmar card says its numbers are the example statement's.
    await page.goto(`/app/analises/${id}/confirmar`);
    const cards = page.locator('[data-testid^="card-"] > p:first-child');
    for (const text of await cards.allTextContents())
      expect(text).toMatch(/^No extrato de exemplo/);
    // The report never says "Confiança: confirmado" on example data.
    await page.goto(`/app/analises/${id}/relatorio`);
    await expect(page.getByTestId('report-paper')).not.toContainText('Confiança: confirmado');
  });

  test('C2: nothing confirmed → "Ainda não há economia confirmada" or the way to the demo', async ({
    page,
  }) => {
    const id = await shopAnalysis(page);
    const confirmed = Number(
      await page.getByTestId('analysis/money-hero').getAttribute('data-cents'),
    );
    expect(confirmed).toBe(0);
    const lead = page.getByTestId('zero-lead');
    await expect(lead).toBeVisible();
    const kind = await lead.getAttribute('data-kind');
    await expect(page.getByTestId('zero-headline')).toHaveText(
      kind === 'nothing'
        ? 'Com estes dados, não encontramos economia.'
        : 'Ainda não há economia confirmada',
    );
    if (kind === 'estimated') {
      await expect(lead.getByTestId('confidence-badge')).toHaveAttribute('data-level', 'estimated');
    } else {
      await expect(page.getByTestId('nothing-found-demo')).toHaveAttribute('href', '/demo');
    }
    await page.goto(`/app/analises/${id}/painel`);
    await expect(page.getByTestId('zero-lead')).toHaveAttribute('data-kind', kind ?? '');
    await expect(page.getByTestId('dashboard/money-hero')).toHaveAttribute('data-cents', '0');
    await expect(
      page.getByText(/Ainda não há economia confirmada|não encontramos economia/),
    ).toBeVisible();
  });

  for (const [name, cnpj, text] of [
    [
      'baixada',
      BAIXADA_CNPJ,
      'Esta empresa está baixada na Receita (encerrada). O Refund analisa empresas ativas.',
    ],
    [
      'inapta',
      INAPTA_CNPJ,
      'Esta empresa está inapta na Receita. Regularize a situação com seu contador antes de planejar impostos.',
    ],
    [
      'suspensa',
      SUSPENSA_CNPJ,
      'Esta empresa está suspensa na Receita. Regularize a situação com seu contador antes de planejar impostos.',
    ],
  ] as const) {
    test(`H4: a ${name} company stops at "É você?" with its status, before the regime`, async ({
      page,
    }) => {
      await lookUp(page, cnpj);
      const stop = page.getByTestId('out-of-scope');
      await expect(stop).toHaveAttribute('data-reason', 'status');
      await expect(stop).toContainText(text);
      await expect(stop).not.toContainText('Simples Nacional');
      await expect(page.getByTestId('confirm-company')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Entrar na lista' })).toHaveCount(0);
      await page.goto('/app/comecar/faturamento');
      await expect(page).toHaveURL(/\/confirmar-empresa$/);
    });
  }

  test('H5: an MEI stops at the estimate with the DAS-MEI text, never an annex', async ({
    page,
  }) => {
    await lookUp(page, MEI_CNPJ);
    await tap(page, 'Sou eu', /\/faturamento$/);
    // The bands an MEI can have, by the engine's MEI limit (with its 20% tolerance), plus "Não sei".
    const options = await page
      .getByTestId('choice-group')
      .locator('button')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-value')));
    expect(options).toEqual(['up_to_15k', 'dont_know']);
    await tap(page, 'Até R$ 15 mil', /\/estimativa$/);
    const stop = page.getByTestId('out-of-scope');
    await expect(stop).toHaveAttribute('data-reason', 'mei');
    await expect(stop).toContainText(
      'No MEI o imposto é um valor fixo por mês (DAS-MEI), então não há economia a calcular aqui. Fique de olho no limite de faturamento do MEI.',
    );
    await expect(page.locator('main')).not.toContainText(/anexo/i);
    // "Até R$ 15 mil" reaches R03's alert floor: the limit alert shows.
    await expect(page.getByTestId('applicable-R03')).toBeVisible();
    await expect(page.getByTestId('see-exact-number')).toHaveCount(0);
    await page.goto('/app/comecar/permissoes');
    await expect(page).toHaveURL(/\/estimativa$/);
    // "Não sei" cannot say the band is near the limit: no alert.
    await page.goto('/app/comecar/faturamento');
    await tap(page, 'Não sei', /\/estimativa$/);
    await expect(page.getByTestId('applicable-R03')).toHaveCount(0);
  });
});
