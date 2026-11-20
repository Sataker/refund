import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '../fixtures.ts';

// EXECUTION E20, task 4: the support pages (ARCHITECTURE §13) render without any variable, carry one h1, lead back to
// /demo from the header, link the demo and every support page from the footer and pass axe (serious/critical) in
// light and dark. The page-level disclaimer stays only where the page talks about money or tax (UX review E20, L1).

const PAGES = [
  { path: '/como-funciona', h1: 'Como funciona', testId: 'how-it-works-page', disclaimer: true },
  { path: '/seguranca', h1: 'Segurança', testId: 'security-page', disclaimer: false },
  { path: '/motor', h1: 'Motor e testes', testId: 'engine-page', disclaimer: false },
  { path: '/status', h1: 'Status', testId: 'status-page', disclaimer: false },
  { path: '/privacidade', h1: 'Privacidade', testId: 'privacy-page', disclaimer: true },
  { path: '/termos', h1: 'Termos de uso', testId: 'terms-page', disclaimer: false },
] as const;

const FOOTER_HREFS = ['/demo', ...PAGES.map((p) => p.path)];

test.describe('support pages @demo', () => {
  for (const p of PAGES) {
    test(`${p.path} renders with its h1 and the footer links`, async ({ page }) => {
      const res = await page.goto(p.path);
      expect(res?.status()).toBe(200);
      await expect(page.getByTestId(p.testId)).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(p.h1);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expect(page.getByTestId(p.testId).getByTestId('disclaimer')).toHaveCount(
        p.disclaimer ? 1 : 0,
      );
      await expect(page.getByTestId('support/demo-link')).toHaveAttribute('href', '/demo');
      await expect(page.getByTestId('support/demo-link')).toHaveText('Ver a demonstração');
      const footer = page.getByRole('navigation', { name: 'Rodapé' });
      for (const href of FOOTER_HREFS) {
        await expect(footer.locator(`a[href="${href}"]`)).toHaveCount(1);
      }
    });

    for (const scheme of ['light', 'dark'] as const) {
      test(`${p.path} has no serious or critical axe violations (${scheme})`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
        await page.goto(p.path);
        await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${scheme}\\b`));
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
          .analyze();
        const blocking = results.violations.filter(
          (v) => v.impact === 'serious' || v.impact === 'critical',
        );
        expect(
          blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
        ).toEqual([]);
      });
    }
  }

  test('the landing footer links every support page', async ({ page }) => {
    await page.goto('/');
    const footer = page.getByRole('navigation', { name: 'Rodapé' });
    for (const href of FOOTER_HREFS) {
      await expect(footer.locator(`a[href="${href}"]`)).toHaveCount(1);
    }
  });

  test('/termos carries the D37 payment terms, with no CPF', async ({ page }) => {
    await page.goto('/termos');
    await expect(page.getByTestId('terms-guarantee')).toContainText(
      'Garantia de 30 dias a partir do pagamento',
    );
    await expect(page.getByTestId('terms-guarantee')).toContainText(
      'em até 7 dias depois do pedido',
    );
    await expect(page.getByTestId('terms-withdrawal')).toContainText(
      'Código de Defesa do Consumidor, art. 49',
    );
    await expect(page.getByTestId('terms-identification')).toContainText(
      'Responsável: Enzo Vaccaro',
    );
    await expect(page.getByTestId('terms-page')).not.toContainText('CPF');
  });

  test('/motor shows the generated counts', async ({ page }) => {
    await page.goto('/motor');
    for (const id of ['engine/rules', 'engine/tests', 'engine/oracle-tests']) {
      const count = Number(await page.getByTestId(id).getAttribute('data-count'));
      expect(count, id).toBeGreaterThan(0);
    }
    await expect(page.getByTestId('engine/rules-table').locator('tbody tr')).toHaveCount(
      Number(await page.getByTestId('engine/rules').getAttribute('data-count')),
    );
  });

  test('/status shows the live health summary and the UptimeRobot slot', async ({
    page,
    request,
  }) => {
    const health = await (await request.get('/api/health')).json();
    await page.goto('/status');
    await expect(page.getByTestId('status/overall')).toHaveAttribute('data-status', health.status);
    await expect(page.getByTestId('status/demo-personas')).toHaveText(String(health.demo.personas));
    await expect(page.getByTestId('status/demo-numbers')).toHaveText('Sim');
    // Either the UptimeRobot link (STATUS_PAGE_URL set) or the "not public yet" line (placeholder; freeze-check 12).
    await expect(
      page.getByTestId('status/uptime-link').or(page.getByTestId('status/uptime-pending')),
    ).toBeVisible();
  });
});
