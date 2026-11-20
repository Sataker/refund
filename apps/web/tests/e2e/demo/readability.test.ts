import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test, unlockShell } from '../fixtures.ts';

// E21 readability pass (40–60+ owners) on the finding detail: every control opened still passes axe, the page
// reflows at 200% zoom without clipping the § chips, and copying the hero amount gives the amount.

const BASE = '/demo/dev-exportador';

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

/** Opens "Ver cálculo", "Ver mais passos" and every "+N fontes" of the page. */
async function openEverything(page: Page): Promise<void> {
  const more = page.getByTestId('more-steps');
  if ((await more.count()) > 0) await more.locator(':scope > summary').click();
  await page.getByTestId('calc-trace').locator(':scope > summary').click();
  await expect(page.getByTestId('calc-trace')).toHaveAttribute('open', '');
  const sources = page.getByTestId('more-sources');
  const n = await sources.count();
  expect(n, 'the detail has collapsed sources').toBeGreaterThan(0);
  for (let i = 0; i < n; i++) await sources.nth(i).locator(':scope > summary').click();
  await expect(page.locator('[data-testid="more-sources"]:not([open])')).toHaveCount(0);
}

test.describe('finding detail readability @demo', () => {
  test.beforeEach(async ({ page }) => {
    await unlockShell(page);
  });

  test('a step shows its first § chip and "+N fontes" opens the rest, all from the step refs', async ({
    page,
  }) => {
    await page.goto(`${BASE}/achados/R05`);
    const step = page.getByTestId('action-step').first();
    const refs = step.getByTestId('step-refs');
    await expect(refs.locator(':scope > [data-testid="ref-sheet"]')).toHaveCount(1);
    const more = refs.getByTestId('more-sources');
    const summary = more.locator(':scope > summary');
    await expect(summary.getByText(/^\+\d+ fontes?$/)).toBeVisible();
    const label = (await summary.getByText(/^\+\d+ fontes?$/).textContent()) ?? '';
    const hidden = Number(/\+(\d+)/.exec(label)?.[1]);
    expect(hidden).toBeGreaterThan(0);
    await expect(more.getByTestId('ref-sheet')).toHaveCount(hidden);
    await expect(more.getByTestId('ref-sheet').first()).toBeHidden();
    await summary.click();
    await expect(more.getByTestId('ref-sheet').first()).toBeVisible();
    await expect(summary.getByText('Menos fontes')).toBeVisible();
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`axe: R05 and R01 with "Ver cálculo", "+N fontes" and "Ver mais passos" open (${scheme})`, async ({
      page,
    }) => {
      test.setTimeout(90_000);
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      for (const path of ['achados/R05', 'achados/R01', 'achados/R05-REC']) {
        await page.goto(`${BASE}/${path}`);
        await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${scheme}\\b`));
        await openEverything(page);
        await settled(page);
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
          .analyze();
        expect(
          results.violations.map(
            (v) => `${path} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
          ),
        ).toEqual([]);
      }
    });
  }

  // 200% browser zoom = half the CSS viewport at twice the pixel density.
  for (const width of [390, 1280] as const) {
    test(`200% zoom at ${width}px: no horizontal scroll and no clipped § chip`, async ({
      browser,
    }, testInfo) => {
      test.skip(
        testInfo.project.name !== 'demo-chromium',
        'one browser is enough for the zoom check',
      );
      const context = await browser.newContext({
        viewport: { width: width / 2, height: 844 / 2 },
        deviceScaleFactor: 2,
      });
      const page = await context.newPage();
      await unlockShell(page);
      for (const path of ['achados/R05', 'achados/R01']) {
        await page.goto(`${BASE}/${path}`);
        await openEverything(page);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `horizontal scroll on ${path}`).toBeLessThanOrEqual(0);
        const clipped = await page
          .locator('[data-testid="ref-sheet"] > summary, [data-testid="law-seal"]')
          .evaluateAll((els) =>
            els
              .filter((el) => (el as HTMLElement).offsetParent !== null)
              .filter((el) => {
                const r = el.getBoundingClientRect();
                return (
                  el.scrollWidth > el.clientWidth + 1 ||
                  r.right > document.documentElement.clientWidth + 1
                );
              })
              .map((el) => el.textContent ?? ''),
          );
        expect(clipped, `clipped chips on ${path}`).toEqual([]);
      }
      await context.close();
    });
  }

  test('copying the hero amount gives the amount, not the odometer reels', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${BASE}/achados/R05`);
    const hero = page.getByTestId('detail/money');
    await expect(hero).toHaveAttribute('data-cents', '3400240');
    const box = await hero.locator('p[aria-hidden="true"]').boundingBox();
    if (!box) throw new Error('no hero box');
    const read = () =>
      page.evaluate(() => (window.getSelection()?.toString() ?? '').replace(/[  ]/g, ' ').trim());
    // Triple-click on the number (what people do to copy an amount).
    await page.mouse.click(box.x + 40, box.y + box.height / 2, { clickCount: 3 });
    expect(await read()).toBe('R$ 34.002,40');
    // A drag from the start of the number to its end.
    await page.evaluate(() => window.getSelection()?.removeAllRanges());
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + 2, box.y + 4);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, y, { steps: 5 });
    await page.mouse.move(box.x + box.width - 2, y, { steps: 5 });
    await page.mouse.up();
    expect(await read()).not.toMatch(/0123456789/);
    expect(await read()).toContain('34.002');
  });
});
