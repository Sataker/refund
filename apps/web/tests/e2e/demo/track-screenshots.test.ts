import { expect, test } from '../fixtures.ts';

// E12 review material (EXECUTION §1 step 5): every track step and Screen 4 (mid-animation and at the end), at
// 390 px and 1280 px, light and dark. Only runs with E12_SHOTS=<dir> (never in CI).

const DIR = process.env.E12_SHOTS ?? '';
const HERO = 'dev-exportador';
const STEPS = [
  'cnpj',
  'confirmar-empresa',
  'faturamento',
  'funcionarios',
  'exterior',
  'estimativa',
  'permissoes',
  'conta-pj',
  'conta-pf',
];

for (const width of [390, 1280] as const)
  for (const scheme of ['light', 'dark'] as const) {
    test(`track screenshots ${width}px ${scheme}`, async ({ page }, testInfo) => {
      test.skip(DIR === '' || testInfo.project.name !== 'demo-chromium', 'E12_SHOTS not set');
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.emulateMedia({ colorScheme: scheme });
      const shot = (name: string, fullPage = true) =>
        page.screenshot({ path: `${DIR}/${width}-${scheme}-${name}.png`, fullPage });

      await page.goto('/demo');
      await page.waitForTimeout(700);
      await shot('00-demo');
      for (const [i, s] of STEPS.entries()) {
        await page.goto(`/demo/${HERO}/comecar/${s}`);
        await page.waitForTimeout(s.startsWith('conta') ? 1300 : 600);
        await shot(`${String(i + 1).padStart(2, '0')}-${s}`);
      }

      await page.goto(`/demo/${HERO}/analise`);
      await expect(page.getByTestId('finding-R01')).toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(700);
      await shot('10-analise-meio', false);
      await expect(page.getByTestId('analysis/money-hero')).toHaveAttribute(
        'data-settled',
        'true',
        {
          timeout: 15_000,
        },
      );
      await page.waitForTimeout(150);
      await shot('11-analise-confete', false);
      await page.waitForTimeout(1500);
      await shot('12-analise-fim');
    });
  }
