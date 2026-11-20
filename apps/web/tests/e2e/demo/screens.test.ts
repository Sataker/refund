import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test, unlockShell } from '../fixtures.ts';

// E13 definition of done (TESTS §6.1 D6–D10, D15, D16, D18): /demo screens 5–8. Every amount is compared through
// data-cents with the hero answer key (ENGINE-SPEC F.4, C.12.4); the network guard fails any external request.

const HERO = 'dev-exportador';
const BASE = `/demo/${HERO}`;
const TOTAL = '6231892';

async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (a) =>
          a.playState === 'finished' ||
          a.effect?.getTiming().iterations === Number.POSITIVE_INFINITY,
      ),
  );
}

async function noHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `horizontal scroll on ${page.url()}`).toBeLessThanOrEqual(0);
}

test.describe('demo screens 5–8 @demo', () => {
  test('shell lock: before the track ends, the dashboard sends the visitor back to the track', async ({
    page,
  }) => {
    await page.goto(`${BASE}/painel`);
    await expect(page).toHaveURL(new RegExp(`${BASE}/comecar/cnpj`));
  });

  test('"Ver meu painel" at the end of the analysis opens the dashboard (no 404)', async ({
    page,
  }) => {
    await page.goto(`${BASE}/analise?pace=instant`);
    await expect(page.getByTestId('analysis/money-hero')).toHaveAttribute('data-settled', 'true', {
      timeout: 15_000,
    });
    await page.getByTestId('see-dashboard').click();
    await expect(page).toHaveURL(new RegExp(`${BASE}/painel$`));
    await expect(page.getByTestId('dashboard/money-hero')).toHaveAttribute('data-cents', TOTAL);
  });

  test('D12: "Recomeçar demo" in the shell clears answers, approval and the unlock; incognito sees none of it', async ({
    page,
    browser,
  }) => {
    test.setTimeout(60_000);
    // A real visitor: the shell unlocks by watching the analysis (no unlockShell, which would re-unlock on reload).
    const watch = async () => {
      await page.goto(`${BASE}/analise?pace=instant`);
      await expect(page.getByTestId('analysis/money-hero')).toHaveAttribute(
        'data-settled',
        'true',
        {
          timeout: 15_000,
        },
      );
    };
    await watch();
    await page.goto(`${BASE}/confirmar`);
    await page.getByTestId('answer-export-qualification-no').click();
    await expect(page.getByTestId('confirm/total')).toHaveAttribute('data-cents', '2831652', {
      timeout: 15_000,
    });
    await page.goto(`${BASE}/contador`);
    await page.getByTestId('approve-report').click();
    await page.goto(`${BASE}/relatorio`);
    await expect(page.getByTestId('report-status')).toHaveAttribute('data-status', 'approved');

    await page.getByTestId('restart-demo').filter({ visible: true }).first().click();
    await expect(page).toHaveURL(new RegExp(`${BASE}/comecar/cnpj`));
    // The shell is locked again: the dashboard sends the visitor back to the track.
    await page.goto(`${BASE}/painel`);
    await expect(page).toHaveURL(new RegExp(`${BASE}/comecar/cnpj`));

    await watch();
    await page.goto(`${BASE}/painel`);
    await expect(page.getByTestId('dashboard/money-hero')).toHaveAttribute('data-cents', TOTAL);
    await expect(page.getByTestId('custom-answers')).toHaveCount(0);
    await page.goto(`${BASE}/relatorio`);
    await expect(page.getByTestId('report-status')).toHaveAttribute('data-status', 'draft');

    // Another session (incognito) carries nothing of this one: no unlock, no answers.
    const other = await browser.newContext();
    try {
      const incognito = await other.newPage();
      await incognito.goto(`${BASE}/painel`);
      await expect(incognito).toHaveURL(new RegExp(`${BASE}/comecar/cnpj`));
    } finally {
      await other.close();
    }
  });

  test.describe('unlocked', () => {
    test.beforeEach(async ({ page }) => {
      await unlockShell(page);
    });

    test('D6: dashboard total, separate recovery, findings by R$, alerts apart, PF/PJ filter', async ({
      page,
    }) => {
      await page.goto(`${BASE}/painel`);
      await expect(page.getByTestId('dashboard/money-hero')).toHaveAttribute('data-cents', TOTAL);
      await expect(page.getByTestId('dashboard/regime-total')).toHaveAttribute(
        'data-cents',
        '7400628',
      );
      await expect(page.getByTestId('dashboard/recovery-min')).toHaveAttribute(
        'data-cents',
        '3978768',
      );
      await expect(page.getByTestId('dashboard/recovery-max')).toHaveAttribute(
        'data-cents',
        '19893840',
      );
      await expect(page.getByTestId('dashboard/alert-R02-cost')).toHaveAttribute(
        'data-cents',
        '111170',
      );
      await expect(page.getByTestId('dashboard/regime-total')).toContainText(
        'a partir de abr/2027',
      );
      // Recovery never appears inside the total: no element shows the sum of total + recovery.
      await expect(page.locator(`[data-cents="${6231892 + 3978768}"]`)).toHaveCount(0);

      const order = await page
        .getByTestId('savings-list')
        .locator(':scope > li')
        .evaluateAll((els) => els.map((e) => e.getAttribute('data-rule')));
      expect(order).toEqual(['R05', 'R01']);
      await expect(page.getByTestId('finding-R05').locator('[data-cents]').first()).toHaveAttribute(
        'data-cents',
        '3400240',
      );
      await expect(page.getByTestId('finding-R01').locator('[data-cents]').first()).toHaveAttribute(
        'data-cents',
        '2831652',
      );
      await expect(page.getByTestId('alerts').getByTestId('alert-R02')).toBeVisible();
      await expect(page.getByTestId('savings-list').getByTestId('alert-R02')).toHaveCount(0);
      await expect(page.getByTestId('deadline-seal')).toContainText('1 mês prescreve em 11 dias');

      await page.getByTestId('filter-pf').click();
      await expect(page.getByTestId('finding-R01')).toHaveCount(0);
      await expect(page.getByTestId('recovery-R05-REC')).toHaveCount(0);
      await expect(page.getByTestId('alert-R02')).toBeVisible();
      await page.getByTestId('filter-pj').click();
      await expect(page.getByTestId('finding-R01')).toBeVisible();
      await expect(page.getByTestId('alert-R02')).toHaveCount(0);
      await page.getByTestId('filter-all').click();
      await expect(page.getByTestId('dashboard/money-hero')).toHaveAttribute('data-cents', TOTAL);

      await expect(page.getByTestId('fv-entry-card')).toHaveAttribute('href', `${BASE}/financas`);
      await page.getByTestId('open-R01').click();
      await expect(page).toHaveURL(new RegExp(`${BASE}/achados/R01$`));
    });

    test('D7: R01 detail → "Ver cálculo" → a number opens its source transactions; article with text and link', async ({
      page,
    }) => {
      await page.goto(`${BASE}/achados/R01`);
      await expect(page.getByTestId('detail/money')).toHaveAttribute('data-cents', '2831652');
      await expect(page.getByTestId('detail/regime')).toHaveAttribute('data-cents', '4289652');
      // UX review H1: simulator first, then the plan collapsed after 3 steps, then "Ver cálculo".
      const order = await page.evaluate(() =>
        ['simulator', 'action-plan', 'calc-trace'].map((id) => {
          const el = document.querySelector(`[data-testid="${id}"]`);
          return el ? el.getBoundingClientRect().top + window.scrollY : -1;
        }),
      );
      expect(order).toEqual([...order].sort((a, b) => a - b));
      await expect(page.getByTestId('more-steps').locator(':scope > summary')).toHaveText(
        /Ver os 7 passos/,
      );
      await expect(page.getByTestId('action-plan')).toContainText('Quando o efeito começa');
      await page.getByTestId('calc-trace').locator('summary').first().click();
      // UX review H2: Portuguese labels, never raw keys; rates in pt-BR percent.
      await expect(page.getByTestId('calc-trace')).toContainText('Folha 12 meses sem pró-labore');
      await expect(page.getByTestId('calc-trace')).not.toContainText('fs12WithoutProLabore');
      await expect(page.getByTestId('calc-trace')).not.toContainText('ENGINE-SPEC');
      const revenue = page.getByTestId('trace-sources/R01.RBT12_REGIME');
      await expect(revenue.getByTestId('trace/R01.RBT12_REGIME')).toHaveAttribute(
        'data-cents',
        '60000000',
      );
      await revenue.locator('summary').click();
      await expect(revenue.getByTestId('source-row')).toHaveCount(12);
      await expect(
        revenue.getByTestId('source-row').first().locator('[data-cents]'),
      ).toHaveAttribute('data-cents', '5000000');
      const payroll = page.getByTestId('trace-sources/R01.FS12_WITHOUT_PRO_LABORE');
      await payroll.locator('summary').click();
      await expect(payroll.getByTestId('source-row')).toHaveCount(40);

      const law = page.getByTestId('law');
      const first = law.getByTestId('ref-sheet').first();
      await expect(first).toHaveAttribute('data-ref', 'lc123-2006/art18/p5-j');
      await expect(first.locator('mark')).not.toBeEmpty();
      await expect(first.getByRole('link', { name: /Abrir a fonte oficial/ })).toHaveAttribute(
        'href',
        /planalto\.gov\.br/,
      );
      await expect(page.getByTestId('do-not')).toContainText('Não registre pró-labore só no papel');
    });

    test('D8: the pró-labore slider recalculates in < 200 ms and the default gives back the exact number', async ({
      page,
    }) => {
      await page.goto(`${BASE}/achados/R01`);
      const slider = page.getByTestId('sim/slider');
      await expect(slider).toBeVisible();
      await expect(page.getByTestId('sim/pro-labore')).toHaveAttribute('data-cents', '226000');
      await expect(page.getByTestId('sim/value')).toHaveAttribute('data-cents', '2831652');
      await expect(page.getByTestId('sim/total')).toHaveAttribute('data-cents', TOTAL);
      // D32: safety margin; per-year line and the margin cost from the engine's step values.
      await expect(page.getByLabel('Folga de segurança acima de 28%')).toBeVisible();
      await expect(page.getByTestId('sim/margin')).toContainText('1 p.p. (recomendada)');
      await expect(page.getByTestId('sim/annual')).toHaveAttribute('data-cents', '4289652');
      await expect(page.getByTestId('sim/annual')).toContainText(
        'por ano depois, a partir de abr/2027',
      );
      // UX review G2 H4: the trade-off of the margin, every value from the engine.
      await expect(page.getByTestId('sim/cost')).toContainText(
        /Mais folga antecipa o Anexo III \(abr\/2027 com 1 p\.p\.\), mas custa R\$\s165,00 por ano a cada 0,25 p\.p\. depois disso\./,
      );
      // UX review G2 H3: the x window is 0,5× to 1,25× the recommended P* (R$ 2.260,00). D48: the engine's display
      // curve starts below "hoje" (R$ 1.621,00), so the window starts at 0,5× P* and the V → III step sits mid-chart.
      await expect(page.getByTestId('optimizer-curve')).toHaveAttribute('data-x0', '113000');
      await expect(page.getByTestId('optimizer-curve/below-minimum')).toHaveCount(1);
      await expect(page.getByTestId('optimizer-curve')).toHaveAttribute('data-x1', '282500');
      await expect(page.getByTestId('sim/late')).toHaveCount(0);

      // Timed inside the page: from the input event to the new number on screen.
      const elapsed = await page.evaluate(
        () =>
          new Promise<number>((resolve) => {
            const input = document.querySelector<HTMLInputElement>('[data-testid="sim/slider"]');
            const out = document.querySelector('[data-testid="sim/pro-labore"]');
            if (!input || !out) return resolve(Number.POSITIVE_INFINITY);
            const before = out.getAttribute('data-cents');
            const setter = Object.getOwnPropertyDescriptor(
              HTMLInputElement.prototype,
              'value',
            )?.set;
            const t0 = performance.now();
            setter?.call(input, '0');
            input.dispatchEvent(new Event('input', { bubbles: true }));
            const check = () => {
              if (out.getAttribute('data-cents') !== before) resolve(performance.now() - t0);
              else requestAnimationFrame(check);
            };
            requestAnimationFrame(check);
          }),
      );
      expect(elapsed).toBeLessThan(200);
      await expect(page.getByTestId('sim/pro-labore')).toHaveAttribute('data-cents', '176000');
      await expect(page.getByTestId('optimizer-curve')).toHaveAttribute('data-target', '176000');
      const moved = await page.getByTestId('sim/value').getAttribute('data-cents');
      expect(moved).not.toBe('2831652');
      await expect(page.getByTestId('sim/value')).toContainText('a mais nos próximos 12 meses');
      await expect(page.getByTestId('sim/late')).toHaveText(
        'Sem folga suficiente, o Anexo III só começa em jan/2028',
      );
      await expect(page.getByTestId('sim/annual')).toHaveAttribute('data-cents', '4355652');

      await slider.fill('12');
      await expect(page.getByTestId('sim/pro-labore')).not.toHaveAttribute('data-cents', '226000');
      await slider.fill('4');
      await expect(page.getByTestId('sim/pro-labore')).toHaveAttribute('data-cents', '226000');
      await expect(page.getByTestId('sim/value')).toHaveAttribute('data-cents', '2831652');
      await expect(page.getByTestId('sim/total')).toHaveAttribute('data-cents', TOTAL);
      await expect(page.getByTestId('optimizer-curve')).toHaveAttribute('data-target', '226000');
      await expect(page.getByTestId('sim/annual')).toHaveAttribute('data-cents', '4289652');
      await expect(page.getByTestId('sim/late')).toHaveCount(0);
    });

    test('D9: confirm cards come answered by the persona; "Não sei" opens one; answers recalculate the total', async ({
      page,
    }) => {
      await page.goto(`${BASE}/confirmar`);
      const pending = page.getByTestId('confirm-pending');
      // UX review H3: the persona's answers count as answered.
      await expect(pending).toHaveAttribute('data-count', '0');
      await expect(pending).toHaveText('9 de 9 respondidas');
      const total = page.getByTestId('confirm/total');
      await expect(total).toHaveAttribute('data-cents', TOTAL);
      await expect(page.getByTestId('card-export-qualification')).toHaveAttribute(
        'data-choice',
        'yes',
      );
      await expect(page.getByTestId('card-clt-employee:3b86c125a1a3')).toContainText(
        'pessoa 1 de 2',
      );
      await expect(page.getByTestId('card-export-qualification')).not.toContainText('[pessoa]');

      // "Não sei" leaves the card open: the pending counter goes up, then drops when answered.
      await page.getByTestId('answer-export-qualification-dont_know').click();
      await expect(pending).toHaveAttribute('data-count', '1');
      await expect(total).not.toHaveAttribute('data-cents', TOTAL, { timeout: 15_000 });
      // "Não": not an export → R05 leaves; the real pipeline answers 28.316,52 (R01 alone).
      await page.getByTestId('answer-export-qualification-no').click();
      await expect(pending).toHaveAttribute('data-count', '0');
      await expect(total).toHaveAttribute('data-cents', '2831652', { timeout: 15_000 });

      await page.goto(`${BASE}/painel`);
      await expect(page.getByTestId('dashboard/money-hero')).toHaveAttribute(
        'data-cents',
        '2831652',
        { timeout: 15_000 },
      );
      await expect(page.getByTestId('custom-answers')).toBeVisible();
      await expect(page.getByTestId('finance-default-note')).toContainText(
        'Finanças mostram as respostas padrão da Marina.',
      );
      // UX review H4: the detail and the report say they use the persona's answers; R05 dropped out.
      await page.goto(`${BASE}/achados/R05`);
      await expect(page.getByTestId('visitor-notice')).toHaveAttribute('data-dropped', 'true', {
        timeout: 15_000,
      });
      await page.goto(`${BASE}/relatorio`);
      await expect(page.getByTestId('visitor-notice')).toContainText(
        'Estes números usam as respostas da Marina.',
      );

      await page.goto(`${BASE}/confirmar`);
      await page.getByTestId('answer-export-qualification-yes').click();
      await expect(total).toHaveAttribute('data-cents', TOTAL);
      await page.getByTestId('confirm-all').click();
      await expect(page.getByTestId('confirm-done')).toContainText('R$ 62.318,92');
      await page.goto(`${BASE}/achados/R05`);
      await expect(page.getByTestId('visitor-notice')).toHaveCount(0);
    });

    test('engine review H1: an estimated R01 hides the steady-state line under the confirmed number', async ({
      page,
    }) => {
      await page.goto(`${BASE}/confirmar`);
      await page.getByTestId('answer-pro-labore-gross-dont_know').click();
      await page.goto(`${BASE}/painel`);
      await expect(page.getByTestId('dashboard/regime-pending')).toHaveText(
        'Valor por ano aparece quando tudo estiver confirmado.',
        { timeout: 15_000 },
      );
      await expect(page.getByTestId('dashboard/regime-total')).toHaveCount(0);
      await expect(page.getByTestId('composition-estimated-R01')).toContainText('fora do número');
    });

    test('L7: alert A01 sits in the risk block, outside the total, hidden under the PF filter', async ({
      page,
    }) => {
      await page.goto(`${BASE}/painel`);
      const a01 = page.getByTestId('alerts').getByTestId('alert-A01');
      await expect(a01).toBeVisible();
      await expect(a01).toContainText('Despesa pessoal no cartão da empresa');
      await expect(a01.getByTestId('risk-line')).toContainText('Não recomendamos');
      await expect(page.getByTestId('savings-list').getByTestId('alert-A01')).toHaveCount(0);
      await expect(page.getByTestId('dashboard/money-hero')).toHaveAttribute('data-cents', TOTAL);
      await page.getByTestId('filter-pf').click();
      await expect(page.getByTestId('alert-A01')).toHaveCount(0);
      await page.getByTestId('filter-pj').click();
      await expect(page.getByTestId('alert-A01')).toBeVisible();
    });

    test('D10: the accountant approves in another tab and the report tab shows "Aprovado" without reloading', async ({
      page,
      context,
    }) => {
      await page.goto(`${BASE}/relatorio`);
      await expect(page.getByTestId('report/total')).toHaveAttribute('data-cents', TOTAL);
      await expect(page.getByTestId('report-plan')).toBeVisible();
      await expect(page.getByTestId('report-hash')).toContainText('Hash dos parâmetros');
      await expect(page.getByTestId('report-paper').getByTestId('recovery-row')).toHaveCount(60);
      await expect(page.getByTestId('report-status')).toHaveAttribute('data-status', 'draft');

      const [accountant] = await Promise.all([
        context.waitForEvent('page'),
        page.getByTestId('open-accountant').click(),
      ]);
      await accountant.waitForLoadState();
      await expect(accountant).toHaveURL(new RegExp(`${BASE}/contador$`));
      await expect(page.getByTestId('report-status')).toHaveAttribute('data-status', 'opened');
      await accountant.getByTestId('approve-report').click();
      await expect(accountant.getByTestId('accountant-status')).toContainText('Aprovado');
      await expect(page.getByTestId('report-status')).toHaveAttribute('data-status', 'approved');
      await expect(page.getByTestId('report-status')).toContainText(
        'Aprovado por Ana Lima (fictícia)',
      );
      await expect(page.getByTestId('report-approval')).toHaveAttribute('data-status', 'approved');
      await accountant.close();
    });

    test('D18: R05-REC → "Como receber": 8 steps in catalog order, urgency from daysLeft, 60 DAS', async ({
      page,
    }) => {
      await page.goto(`${BASE}/achados/R05-REC`);
      const plan = page.getByTestId('action-plan');
      await expect(plan.getByRole('heading', { level: 2 })).toHaveText('Como receber');
      const ids = await plan
        .getByTestId('action-step')
        .evaluateAll((els) => els.map((e) => e.getAttribute('data-step-id')));
      expect(ids).toEqual(Array.from({ length: 8 }, (_, i) => `R05-REC.action.${i + 1}`));
      const urgency = page.getByTestId('urgency-line');
      await expect(urgency).toContainText('1 mês prescreve em 11 dias');
      await expect(urgency).toContainText('na data da análise (12/11/2026)');
      await plan.getByTestId('recovery-details').locator('summary').click();
      await expect(plan.getByTestId('recovery-row')).toHaveCount(60);
      await expect(plan.getByTestId('recovery-row').first()).toHaveAttribute('data-urgent', 'true');
      await expect(page.getByTestId('detail/range')).toHaveAttribute('data-cents-min', '3978768');
      await expect(page.getByTestId('detail/range')).toHaveAttribute('data-cents-max', '19893840');
      await expect(plan.getByTestId('how-to-receive')).toContainText('Pix na conta da empresa');

      // A noSource step (R05.4) shows the engine's fixed sentence, in gray.
      await page.goto(`${BASE}/achados/R05`);
      const ns = page.locator('[data-testid="action-step"][data-no-source="true"]');
      await expect(ns).toContainText('Confirme com seu contador: não encontramos regra oficial');
    });

    test('D16: shell routes on a phone: no horizontal scroll, 5-item tab bar, number at the top', async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'demo-mobile', 'Pixel 7 only (TESTS §6.1 D16)');
      test.setTimeout(60_000);
      for (const path of [
        'painel',
        'financas',
        'achados',
        'achados/R01',
        'achados/R05-REC',
        'confirmar',
        'relatorio',
      ]) {
        await page.goto(`${BASE}/${path}`);
        await expect(page.getByTestId('tab-bar')).toBeVisible();
        await expect(page.getByTestId('tab-bar').getByRole('link')).toHaveText([
          'Painel',
          'Finanças',
          'Achados',
          'Confirmar',
          'Relatório',
        ]);
        await expect(
          page.getByTestId('sandbox-seal').filter({ visible: true }).first(),
        ).toBeVisible();
        await noHorizontalScroll(page);
      }
      await page.goto(`${BASE}/painel`);
      const box = await page.getByTestId('dashboard/money-hero').boundingBox();
      expect(box?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(422);
      await page.getByTestId('tab-financas').click();
      await expect(page).toHaveURL(new RegExp(`${BASE}/financas$`));
      await expect(page.getByTestId('tab-financas')).toHaveAttribute('aria-current', 'page');
    });

    for (const scheme of ['light', 'dark'] as const) {
      test(`D15 screens 5–8 have no serious or critical axe violations (${scheme})`, async ({
        page,
      }) => {
        test.setTimeout(90_000);
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
        for (const path of [
          'painel',
          'achados',
          'achados/R01',
          'achados/R05-REC',
          'achados/R02',
          'confirmar',
          'relatorio',
          'contador',
        ]) {
          await page.goto(`${BASE}/${path}`);
          await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${scheme}\\b`));
          if (path === 'achados/R01') await expect(page.getByTestId('sim/slider')).toBeVisible();
          await settled(page);
          const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
            .analyze();
          const blocking = results.violations.filter(
            (v) => v.impact === 'serious' || v.impact === 'critical',
          );
          expect(
            blocking.map(
              (v) => `${path} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
            ),
          ).toEqual([]);
        }
      });
    }
  });
});
