import { expect, test, unlockShell } from '../fixtures.ts';

// G2 review fixes (EXECUTION §9, E15 rows of 19/11): product/UX H1–H4, M1–M11 and lows, compliance L2. Numbers are
// compared through data-cents with the hero answer key (ENGINE-SPEC F.4).

const HERO = 'dev-exportador';
const BASE = `/demo/${HERO}`;
const TOTAL = '6231892';

test.describe('G2 fixes @demo', () => {
  test('H1: a changed answer makes the primary "Confirmar minhas respostas"; "Voltar às respostas da Marina" restores the total', async ({
    page,
  }) => {
    await unlockShell(page);
    await page.goto(`${BASE}/confirmar`);
    const total = page.getByTestId('confirm/total');
    await expect(total).toHaveAttribute('data-cents', TOTAL);
    await expect(page.getByTestId('confirm-all')).toHaveText('Confirmar as respostas da Marina');
    await expect(page.getByTestId('restore-persona')).toHaveCount(0);

    await page.getByTestId('answer-export-qualification-no').click();
    await expect(total).toHaveAttribute('data-cents', '2831652', { timeout: 15_000 });
    await expect(page.getByTestId('confirm-all')).toHaveText('Confirmar minhas respostas');
    await expect(page.getByTestId('restore-persona')).toHaveText('Voltar às respostas da Marina');

    await page.getByTestId('restore-persona').click();
    await expect(total).toHaveAttribute('data-cents', TOTAL);
    await expect(page.getByTestId('restore-persona')).toHaveCount(0);
    await expect(page.getByTestId('confirm-all')).toHaveText('Confirmar as respostas da Marina');
    await page.goto(`${BASE}/painel`);
    await expect(page.getByTestId('dashboard/money-hero')).toHaveAttribute('data-cents', TOTAL);
    await expect(page.getByTestId('custom-answers')).toHaveCount(0);
  });

  test('H2: the DARF 1841 seal never prints a range with equal ends', async ({ page }) => {
    await unlockShell(page);
    await page.goto(`${BASE}/financas?holder=pf`);
    await expect(page.getByTestId('fv-total-outflow')).toBeVisible();
    // biome-ignore lint/performance/useDomNodeTextContent: what is on screen counts.
    const shown = await page.locator('main').innerText();
    expect(shown).not.toMatch(/R\$\s?1\.111,70 a R\$\s?1\.111,70/);
  });

  test('M1, M2, M4, M8: dashboard wording from the data, no rule codes on screen', async ({
    page,
  }) => {
    await unlockShell(page);
    await page.goto(`${BASE}/painel`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Você pode pagar a menos, dentro da lei',
    );
    const alerts = page.getByTestId('alerts');
    await expect(alerts.getByTestId('alert-R02')).toContainText(
      /custo de esperar até a DIRPF 2027 \(Selic\): R\$\s1\.111,70/,
    );
    await expect(page.getByTestId('dashboard/alert-R02-cost')).toHaveAttribute(
      'data-cents',
      '111170',
    );
    const spend = alerts.getByTestId('alert-A01').getByTestId('personal-spend');
    await expect(spend).toContainText(
      /13 pagamentos pessoais pela PJ · R\$\s1\.483,20 em 12 meses/,
    );
    await expect(spend.locator('[data-cents]')).toHaveAttribute('data-cents', '148320');
    // biome-ignore lint/performance/useDomNodeTextContent: what is on screen counts.
    const shown = await page.locator('main').innerText();
    expect(shown).not.toMatch(/\bR0\d\b|R05-REC|\bA01\b/);
    expect(shown).not.toContain('em regime');
  });

  test('M3: at the end of the analysis the label reads "Encontramos" and the 4th segment is full', async ({
    page,
  }) => {
    await page.goto(`${BASE}/analise?pace=instant`);
    await expect(page.getByTestId('analysis/money-hero')).toHaveAttribute('data-settled', 'true', {
      timeout: 15_000,
    });
    await expect(page.getByTestId('found-label')).toHaveText('Encontramos');
    await expect(page.getByTestId('track-progress')).toHaveAttribute('data-fill', '1');
    await expect(page.getByTestId('first-money-timer')).toContainText(/primeiro valor em \d+,\d s/);
  });

  test('M7, L2, L3: R05-REC short headline with the date anchor; A01 shows no R$ 0,00; extra norms collapsed', async ({
    page,
  }) => {
    await unlockShell(page);
    await page.goto(`${BASE}/achados/R05-REC`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Imposto pago a mais nos últimos 5 anos',
    );
    await expect(page.getByTestId('detail/range').locator('xpath=..')).toContainText(
      'na data da análise (12/11/2026)',
    );
    await page.goto(`${BASE}/achados/A01`);
    await page.getByTestId('calc-trace').locator('summary').first().click();
    await expect(page.getByTestId('trace/A01.MARGINAL_12M')).toHaveText('sem valor de economia');
    await expect(page.getByTestId('risk-line')).toHaveCount(0);
    await page.goto(`${BASE}/achados/R01`);
    await expect(page.getByTestId('law').getByTestId('ref-sheet').first()).toBeVisible();
    await expect(page.getByTestId('more-refs').locator(':scope > summary')).toHaveText(
      /Outras? (\d+ )?normas? usadas?/,
    );
  });

  test('M10: the accountant sees the § of each finding, opens the calculation record, and "Aprovado ✓"', async ({
    page,
  }) => {
    await unlockShell(page);
    await page.goto(`${BASE}/contador`);
    await expect(page.getByTestId('open-report')).toHaveAttribute('href', `${BASE}/relatorio`);
    const r01 = page.getByTestId('review-R01');
    await expect(r01.getByTestId('law-seal')).toBeVisible();
    await r01.getByRole('button', { name: /Aprovar/ }).click();
    await expect(r01).toHaveAttribute('data-decision', 'approved');
    await expect(r01.getByRole('button', { name: 'Aprovado ✓' })).toBeVisible();
  });

  test('M11: an unknown address shows the Portuguese 404 with the way back to the demo', async ({
    page,
  }) => {
    for (const path of ['/nao-existe', `${BASE}/achados/R99`]) {
      const res = await page.goto(path);
      expect(res?.status()).toBe(404);
      await expect(page.getByRole('heading', { name: 'Não achamos esta página.' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Voltar para a demo' })).toHaveAttribute(
        'href',
        '/demo',
      );
    }
  });

  test('L5, L6, compliance M1/L2: report without its own "Mandar" button, the whole recovery range, the demo seal', async ({
    page,
  }, testInfo) => {
    await unlockShell(page);
    await page.goto(`${BASE}/painel`);
    if (testInfo.project.name === 'demo-chromium')
      await expect(page.getByTestId('send-to-accountant')).toBeVisible();
    await page.goto(`${BASE}/relatorio`);
    await expect(page.getByTestId('send-to-accountant')).toHaveCount(0);
    const recovery = page.getByTestId('report/recovery');
    await expect(recovery).toHaveAttribute('data-cents-min', '3978768');
    await expect(recovery).toHaveAttribute('data-cents-max', '19893840');
    await expect(page.getByTestId('report-seal')).toContainText(
      'Dados sintéticos · Open Finance sandbox',
    );
    await page.goto(`${BASE}/contador`);
    await page.getByTestId('approve-report').click();
    await page.goto(`${BASE}/relatorio`);
    await expect(page.getByTestId('report-status')).toContainText(
      'Aprovado por Ana Lima (fictícia)',
    );
  });

  test('L7: a deep link that meets the track gate is where the track ends', async ({ page }) => {
    await page.goto(`${BASE}/achados/R01`);
    await expect(page).toHaveURL(new RegExp(`${BASE}/comecar/cnpj`));
    await page.goto(`${BASE}/analise?pace=instant`);
    await expect(page.getByTestId('analysis/money-hero')).toHaveAttribute('data-settled', 'true', {
      timeout: 15_000,
    });
    await expect(page.getByTestId('see-dashboard')).toHaveAttribute('href', `${BASE}/achados/R01`);
    await page.getByTestId('see-dashboard').click();
    await expect(page).toHaveURL(new RegExp(`${BASE}/achados/R01$`));
  });
});
