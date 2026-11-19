import { expect, test, unlockShell } from '../fixtures.ts';

// E13 review material (EXECUTION §1 step 5): Screens 5, 6 (R01) and 6b (R05-REC), Screen 7 and 8 at 390 px and
// 1280 px, light and dark. Only runs with E13_SHOTS=<dir> (never in CI).

const DIR = process.env.E13_SHOTS ?? '';
const BASE = '/demo/dev-exportador';
const PAGES: [string, string][] = [
  ['dashboard', 'painel'],
  ['r01-detail', 'achados/R01'],
  ['screen-6b-r05-rec', 'achados/R05-REC'],
  ['confirm', 'confirmar'],
  ['report', 'relatorio'],
];

for (const width of [390, 1280] as const)
  for (const scheme of ['light', 'dark'] as const) {
    test(`screens 5–8 screenshots ${width}px ${scheme}`, async ({ page }, testInfo) => {
      test.skip(DIR === '' || testInfo.project.name !== 'demo-chromium', 'E13_SHOTS not set');
      test.setTimeout(120_000);
      await unlockShell(page);
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      for (const [name, path] of PAGES) {
        await page.goto(`${BASE}/${path}`);
        if (path === 'achados/R01') await expect(page.getByTestId('sim/slider')).toBeVisible();
        if (path === 'achados/R05-REC')
          await page.getByTestId('recovery-details').locator('summary').first().click();
        await page.screenshot({ path: `${DIR}/${width}-${scheme}-${name}.png`, fullPage: true });
        await page.screenshot({ path: `${DIR}/${width}-${scheme}-${name}-fold.png` });
      }
      if (width === 1280 && scheme === 'light') {
        await page.goto(`${BASE}/relatorio`);
        await page.emulateMedia({ media: 'print' });
        await page.pdf({ path: `${DIR}/report.pdf`, format: 'A4', printBackground: true });
      }
    });
  }
