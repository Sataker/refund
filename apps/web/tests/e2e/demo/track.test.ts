import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures.ts';

// E12 definition of done (TESTS §6.1 D1–D5, D12, D16): from choosing the persona to the live analysis.
// Numbers are compared through data-cents against the hero answer key (ENGINE-SPEC F.4 and C.11, T11-02/T11-09).

const HERO = 'dev-exportador';
const TOTAL = 6231892;
const RANGE = { min: '1246338', max: '9077928' };
const step = (s: string) => new RegExp(`/demo/${HERO}/comecar/${s}(\\?|$)`);

async function advance(page: Page, to: string): Promise<void> {
  await page.getByTestId('track-advance').click();
  await expect(page).toHaveURL(step(to));
}

/** Persona → estimate, tapping only the highlighted button (IDENTITY-AND-UI §5 "On /demo"). */
async function toEstimate(page: Page): Promise<void> {
  await page.goto(`/demo/${HERO}/comecar/cnpj`);
  await advance(page, 'confirmar-empresa');
  await advance(page, 'faturamento');
  await advance(page, 'funcionarios');
  await advance(page, 'exterior');
  await advance(page, 'estimativa');
}

/** Waits until every finite animation has finished (axe reads colors mid-fade otherwise). */
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

test.describe('demo track @demo', () => {
  test('D1: landing → Ver demo → hero persona → company card in < 2 s, with the seal', async ({
    page,
  }) => {
    await page.goto('/');
    await page
      .getByRole('link', { name: 'Ver demo com a Marina, dev que exporta' })
      .first()
      .click();
    await expect(page).toHaveURL(/\/demo$/);
    const hero = page.getByTestId(`persona-${HERO}`);
    await expect(hero).toHaveAttribute('data-hero', 'true');
    await expect(page.getByTestId(`demo/persona-total-${HERO}`)).toHaveAttribute(
      'data-cents',
      String(TOTAL),
    );
    await expect(page.getByTestId('sandbox-seal').filter({ visible: true }).first()).toBeVisible();
    const started = Date.now();
    await hero.click();
    await expect(page).toHaveURL(step('cnpj'));
    await expect(page.getByLabel('CNPJ da sua empresa')).toHaveValue('RF.DEV.001/0001-58');
    await page.getByTestId('track-advance').click();
    await expect(page.getByTestId('company-card')).toBeVisible();
    expect(Date.now() - started).toBeLessThan(2000);
    await expect(page.getByTestId('company-name')).toHaveText('MARINA DEV LTDA');
    await expect(page.getByTestId('sandbox-seal').filter({ visible: true }).first()).toBeVisible();
  });

  test('D2: rules with the why, profile range for the pre-selected answers, no range below the floor', async ({
    page,
  }) => {
    await page.goto(`/demo/${HERO}/comecar/faturamento`);
    await expect(page.getByRole('button', { name: 'R$ 30 mil a 60 mil' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await toEstimate(page);
    for (const rule of ['R01', 'R05', 'R02']) {
      const item = page.getByTestId(`applicable-${rule}`);
      await expect(item).toBeVisible();
      await expect(item.getByTestId('law-seal')).toBeVisible();
    }
    const range = page.getByTestId('profile-range');
    await expect(range).toHaveAttribute('data-cents-min', RANGE.min);
    await expect(range).toHaveAttribute('data-cents-max', RANGE.max);
    await expect(range).toContainText('de R$ 12 mil a R$ 91 mil por ano');
    await expect(page.getByText('estimativa por perfil', { exact: true })).toBeVisible();
    // No exact number before the data: no R$ with cents and no money-hero on the estimate.
    // innerText on purpose: what is on screen, not the closed "Por que essa faixa?".
    // biome-ignore lint/performance/useDomNodeTextContent: the closed <details> must not count.
    const shown = await page.getByTestId('estimate').innerText();
    expect(shown).not.toMatch(/R\$\s?[\d.]+,\d{2}/);
    await expect(page.getByTestId('money-hero')).toHaveCount(0);

    // Switching the revenue to "R$ 15 mil a 30 mil": every total R$ disappears (T11-02).
    for (const back of ['exterior', 'funcionarios', 'faturamento']) {
      await page.getByTestId('track-back').click();
      await expect(page).toHaveURL(step(back));
    }
    await page.getByRole('button', { name: 'R$ 15 mil a 30 mil' }).click();
    await expect(page).toHaveURL(step('funcionarios'));
    await advance(page, 'exterior');
    await advance(page, 'estimativa');
    await expect(page.getByTestId('no-range')).toHaveAttribute(
      'data-reason',
      'MINIMUM_BELOW_FLOOR',
    );
    await expect(page.getByTestId('no-range')).toContainText(
      'Com essas respostas, o valor pode ser perto de zero. O extrato mostra se vale a pena.',
    );
    await expect(page.getByTestId('profile-range')).toHaveCount(0);
    // biome-ignore lint/performance/useDomNodeTextContent: only what is on screen counts.
    expect(await page.getByTestId('estimate').innerText()).not.toMatch(
      /R\$\s?[\d.]+(,\d{2})? mil por ano/,
    );
  });

  test('D3: consent and the widget replica carry the persona seal', async ({ page }) => {
    await toEstimate(page);
    await advance(page, 'permissoes');
    const seal = page.getByTestId('demo-connect-seal');
    await expect(seal).toHaveText(
      'dados da persona sintética · integração real demonstrada no sandbox',
    );
    await expect(page.getByTestId('consent')).toBeVisible();
    await advance(page, 'conta-pj');
    await expect(page.getByTestId('demo-connect-seal')).toBeVisible();
    await expect(page.getByTestId('widget-replica')).toBeVisible();
    await expect(page.getByTestId('account-card-PJ')).toHaveAttribute('data-status', 'active');
    await advance(page, 'conta-pf');
    await expect(page.getByTestId('account-card-PF')).toHaveAttribute('data-status', 'active');
    await page.getByTestId('track-advance').click();
    await expect(page).toHaveURL(new RegExp(`/demo/${HERO}/analise`));
  });

  test('D4: live analysis at pace=instant: events in order, ends at the answer key total, zero errors', async ({
    page,
  }) => {
    const sse = await page.request.get(`/api/demo/analise?persona=${HERO}&pace=instant`);
    expect(sse.headers()['content-type']).toContain('text/event-stream');
    const frames = (await sse.text())
      .split('\n\n')
      .filter((f) => f.startsWith('id: '))
      .map((f) => {
        const id = Number(/^id: (\d+)/.exec(f)?.[1]);
        const data = JSON.parse(/\ndata: (.*)$/m.exec(f)?.[1] ?? '{}') as {
          type: string;
          partialTotal?: { savings12m: number };
          total?: { savings12m: number };
        };
        return { id, ...data };
      });
    const types = frames.map((f) => f.type);
    expect(frames.map((f) => f.id)).toEqual(frames.map((_, i) => i + 1));
    expect(types[0]).toBe('start');
    expect(types.at(-1)).toBe('end');
    expect(types).not.toContain('error');
    const at = (t: string) => types.indexOf(t);
    expect(at('transaction_sample')).toBeLessThan(at('classification_summary'));
    expect(at('facts_summary')).toBeLessThan(at('finding'));
    expect(types.lastIndexOf('finding')).toBeLessThan(at('total'));
    expect(at('total')).toBeLessThan(at('explanation'));
    expect(frames.find((f) => f.type === 'total')?.total?.savings12m).toBe(TOTAL);
    expect(frames.filter((f) => f.type === 'finding').at(-1)?.partialTotal?.savings12m).toBe(TOTAL);

    await page.goto(`/demo/${HERO}/analise?pace=instant`);
    const hero = page.getByTestId('analysis/money-hero');
    await expect(hero).toHaveAttribute('data-settled', 'true', { timeout: 15_000 });
    await expect(hero).toHaveAttribute('data-cents', String(TOTAL));
    await expect(hero).toHaveAttribute('data-shown', String(TOTAL));
    await expect(page.getByTestId('finding-R01')).toBeVisible();
    await expect(page.getByTestId('finding-R05')).toBeVisible();
    await expect(page.getByTestId('alert-R02')).toBeVisible();
    await expect(page.getByTestId('analysis-error')).toHaveCount(0);
    await expect(page.getByTestId('analysis-result')).toContainText('R$ 62.318,92 a menos');
    await expect(page.getByTestId('see-dashboard')).toHaveAttribute('href', `/demo/${HERO}/painel`);
  });

  test('D5: scripted pace: first R$ < 10 s from the landing, choreography 6–12 s', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'demo-chromium',
      'timed only on desktop Chrome (TESTS §6.1)',
    );
    test.setTimeout(60_000);
    await page.goto('/');
    const fromLanding = Date.now();
    await page
      .getByRole('link', { name: 'Ver demo com a Marina, dev que exporta' })
      .first()
      .click();
    await page.getByTestId(`persona-${HERO}`).click();
    for (const s of [
      'confirmar-empresa',
      'faturamento',
      'funcionarios',
      'exterior',
      'estimativa',
      'permissoes',
      'conta-pj',
      'conta-pf',
    ])
      await advance(page, s);
    await page.getByTestId('track-advance').click();
    await expect(page).toHaveURL(new RegExp(`/demo/${HERO}/analise`));
    const opened = Date.now();
    const hero = page.getByTestId('analysis/money-hero');
    await expect
      .poll(async () => Number(await hero.getAttribute('data-shown')), {
        timeout: 10_000,
        intervals: [50],
      })
      .toBeGreaterThan(0);
    const firstMoney = Date.now() - fromLanding;
    await expect(hero).toHaveAttribute('data-settled', 'true', { timeout: 15_000 });
    const choreography = Date.now() - opened;
    testInfo.annotations.push({
      type: 'first R$ from the landing (ms)',
      description: String(firstMoney),
    });
    testInfo.annotations.push({ type: 'choreography (ms)', description: String(choreography) });
    expect(firstMoney).toBeLessThan(10_000);
    expect(choreography).toBeGreaterThanOrEqual(6000);
    expect(choreography).toBeLessThanOrEqual(12_000);
    await expect(hero).toHaveAttribute('data-cents', String(TOTAL));
    await expect(page.getByTestId('first-money-timer')).toContainText(/primeiro R\$ em \d+,\d s/);
  });

  test('D12: "Recomeçar demo" resets the answers; a new (incognito) context starts clean', async ({
    page,
    browser,
  }) => {
    await page.goto(`/demo/${HERO}/comecar/faturamento`);
    await page.getByRole('button', { name: 'R$ 15 mil a 30 mil' }).click();
    await expect(page).toHaveURL(/revenue=from_15k_to_30k/);
    const stored = await page.evaluate(() =>
      sessionStorage.getItem('refund:demo:track:dev-exportador'),
    );
    expect(stored).toContain('from_15k_to_30k');
    await page.getByTestId('restart-demo').click();
    await expect(page).toHaveURL(step('cnpj'));
    // The persona's answers are back (the cnpj step stores them again on mount).
    expect(
      await page.evaluate(() => sessionStorage.getItem('refund:demo:track:dev-exportador')),
    ).not.toContain('from_15k_to_30k');
    await page.goto(`/demo/${HERO}/comecar/faturamento`);
    await expect(page.getByRole('button', { name: 'R$ 30 mil a 60 mil' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // Another session (incognito) sees nothing of this one.
    await page.getByRole('button', { name: 'R$ 60 mil a 150 mil' }).click();
    await expect(page).toHaveURL(step('funcionarios'));
    const other = await browser.newContext();
    try {
      const incognito = await other.newPage();
      await incognito.goto(`/demo/${HERO}/comecar/faturamento`);
      await expect(incognito.getByRole('button', { name: 'R$ 30 mil a 60 mil' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(
        await incognito.evaluate(() => ({
          track: sessionStorage.getItem('refund:demo:track:dev-exportador'),
          session: localStorage.getItem('refund:demo:session'),
        })),
      ).toMatchObject({ session: null });
    } finally {
      await other.close();
    }
  });

  test('D16: mobile track and analysis without horizontal scroll, number at the top', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'demo-mobile', 'Pixel 7 only (TESTS §6.1 D16)');
    test.setTimeout(60_000);
    await page.goto('/demo');
    await noHorizontalScroll(page);
    await page.getByTestId(`persona-${HERO}`).click();
    await expect(page.getByTestId('track-progress')).toContainText('1 de 4 · Sua empresa');
    for (const s of [
      'confirmar-empresa',
      'faturamento',
      'funcionarios',
      'exterior',
      'estimativa',
      'permissoes',
      'conta-pj',
      'conta-pf',
    ]) {
      await noHorizontalScroll(page);
      await advance(page, s);
    }
    await noHorizontalScroll(page);
    await page.goto(`/demo/${HERO}/analise?pace=instant`);
    const hero = page.getByTestId('analysis/money-hero');
    await expect(hero).toHaveAttribute('data-settled', 'true', { timeout: 15_000 });
    await expect(hero).toHaveAttribute('data-cents', String(TOTAL));
    await noHorizontalScroll(page);
    const box = await hero.boundingBox();
    expect(box?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(260);
    await expect(page.getByTestId('stage-line')).toContainText('Pronto');
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`demo track has no serious or critical axe violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      for (const path of [
        '/demo',
        `/demo/${HERO}/comecar/cnpj`,
        `/demo/${HERO}/comecar/faturamento`,
        `/demo/${HERO}/comecar/estimativa`,
        `/demo/${HERO}/comecar/conta-pj`,
        `/demo/${HERO}/analise?pace=instant`,
      ]) {
        await page.goto(path);
        if (path.includes('analise'))
          await expect(page.getByTestId('analysis/money-hero')).toHaveAttribute(
            'data-settled',
            'true',
            {
              timeout: 15_000,
            },
          );
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
