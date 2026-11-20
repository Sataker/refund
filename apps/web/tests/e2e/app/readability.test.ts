import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures.ts';
import { analyze, finishTrack } from './live-flow.ts';

// E21 readability pass: the live /app finding detail (same DetailSection cards as /demo) passes axe in both themes,
// with the open finding's calculation, the "+N fontes" and "Ver mais passos" opened, and on a locked finding.

async function findingIds(page: Page, id: string): Promise<{ open: string; locked: string }> {
  const sse = await page.request.get(`/api/analises/${id}/eventos?from=100000`);
  const findings = (await sse.text())
    .split('\n\n')
    .filter((f) => /^event: (finding|alert)$/m.test(f))
    .map((f) => JSON.parse(/^data: (.*)$/m.exec(f)?.[1] ?? 'null').finding);
  const open = findings.find((f) => f.traceLocked === false);
  const locked = findings.find((f) => f.traceLocked === true);
  if (!open || !locked) throw new Error('expected an open and a locked finding');
  return { open: open.id, locked: locked.id };
}

async function openEverything(page: Page): Promise<void> {
  const more = page.getByTestId('more-steps');
  if ((await more.count()) > 0) await more.locator(':scope > summary').click();
  const trace = page.getByTestId('calc-trace');
  if ((await trace.count()) > 0) await trace.locator(':scope > summary').click();
  const sources = page.getByTestId('more-sources');
  for (let i = 0; i < (await sources.count()); i++)
    await sources.nth(i).locator(':scope > summary').click();
  const refs = page.getByTestId('more-refs');
  if ((await refs.count()) > 0) await refs.locator(':scope > summary').click();
}

test.describe('live finding detail readability @app', () => {
  test.describe.configure({ timeout: 180_000 });

  test('axe on the /app detail, light and dark, with every section opened', async ({ page }) => {
    await finishTrack(page);
    const id = await analyze(page);
    const { open, locked } = await findingIds(page, id);
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      for (const finding of [open, locked]) {
        await page.goto(`/app/analises/${id}/achados/${finding}`);
        await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${scheme}\\b`));
        await expect(page.getByTestId('detail-summary')).toBeVisible();
        await expect(
          page.getByTestId('action-plan').getByRole('heading', { level: 2 }),
        ).toBeVisible();
        await openEverything(page);
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
          .analyze();
        expect(
          results.violations.map(
            (v) =>
              `${scheme} ${finding} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
          ),
        ).toEqual([]);
      }
    }
    // The locked finding still shows the paywall card, now under a real heading.
    await page.goto(`/app/analises/${id}/achados/${locked}`);
    await expect(page.getByRole('heading', { level: 2, name: 'O cálculo' })).toBeVisible();
    await expect(page.getByTestId('trace-locked')).toBeVisible();
  });
});
