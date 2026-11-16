import { expect, test } from '../fixtures.ts';

// Zero env (backup deployment): /app has no database, so it says "modo ao vivo indisponível" and
// offers the demo (ARCHITECTURE §4.10, §12; E11 definition of done). Never an error screen.

test.describe('live app without env @demo', () => {
  test('/app without env shows "modo ao vivo indisponível" and the way to the demo', async ({
    page,
  }) => {
    for (const path of ['/app', '/app/comecar/cnpj']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: 'Modo ao vivo indisponível' })).toBeVisible();
      await expect(
        page.getByText('O modo ao vivo não está ativo neste deploy. Veja a demo.'),
      ).toBeVisible();
      await expect(page.getByRole('link', { name: 'Ver a demo' })).toHaveAttribute('href', '/demo');
    }
  });
});
