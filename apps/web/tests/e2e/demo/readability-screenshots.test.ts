import { expect, test, unlockShell } from '../fixtures.ts';

// E21 review material (readability pass for 40–60+ owners): the finding detail (R05, R01), the dashboard and one
// track step at 390 px and 1280 px, light and dark. Only runs with READABILITY_SHOTS=<dir> (never in CI).

const DIR = process.env.READABILITY_SHOTS ?? '';
const BASE = '/demo/dev-exportador';
const PAGES: [string, string][] = [
  ['r05-detail', 'achados/R05'],
  ['r01-detail', 'achados/R01'],
  ['painel', 'painel'],
  ['track-faturamento', 'comecar/faturamento'],
];

for (const width of [390, 1280] as const)
  for (const scheme of ['light', 'dark'] as const) {
    test(`readability screenshots ${width}px ${scheme}`, async ({ page }, testInfo) => {
      test.skip(
        DIR === '' || testInfo.project.name !== 'demo-chromium',
        'READABILITY_SHOTS not set',
      );
      test.setTimeout(120_000);
      await unlockShell(page);
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      for (const [name, path] of PAGES) {
        await page.goto(`${BASE}/${path}`);
        if (path === 'achados/R01') await expect(page.getByTestId('sim/slider')).toBeVisible();
        await page.waitForTimeout(600);
        await page.screenshot({ path: `${DIR}/${width}-${scheme}-${name}.png`, fullPage: true });
      }
    });
  }
