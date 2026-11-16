import { expect, test } from '../fixtures.ts';

// E11 task 6: the landing waitlist writes to the database (encrypted e-mail + HMAC, "tem CNPJ?",
// consent). The e-mail domain is one the PII guard allows (example.com.br is reserved for examples).

test.describe('landing waitlist @app', () => {
  test('waitlist: e-mail + "tem CNPJ?" + consent → saved, same answer for a repeated e-mail', async ({
    page,
  }) => {
    for (let i = 0; i < 2; i++) {
      await page.goto('/');
      const form = page.getByTestId('waitlist-form');
      await form
        .getByLabel('Quer usar com a sua empresa? Entre na lista.')
        .fill('teste@exemplo.com.br');
      await form.getByText('Tenho', { exact: true }).click();
      await form.getByRole('button', { name: 'Entrar na lista' }).click();
      await expect(form.getByText('Marque o consentimento para entrar na lista.')).toBeVisible();
      await form.getByRole('checkbox').check();
      await form.getByRole('button', { name: 'Entrar na lista' }).click();
      await expect(page.getByTestId('waitlist-form')).toHaveAttribute('data-state', 'done');
      await expect(page.getByRole('status')).toHaveText(
        'Pronto. Avisamos quando a análise com a sua conta abrir.',
      );
    }
  });
});
