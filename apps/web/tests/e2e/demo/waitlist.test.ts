import { expect, test } from '../fixtures.ts';

// Zero env (the demo projects and the backup deployment): the waitlist has no database to write to,
// so it says so in plain words and points to the demo. Nothing leaves the machine (network guard).

test.describe('landing waitlist without a database @demo', () => {
  test('waitlist without env says the list is not open here and keeps the form', async ({
    page,
  }) => {
    await page.goto('/');
    const form = page.getByTestId('waitlist-form');
    await form
      .getByLabel('Quer usar com a sua empresa? Entre na lista.')
      .fill('teste@exemplo.com.br');
    await form.getByText('Ainda não', { exact: true }).click();
    await form.getByRole('checkbox').check();
    await form.getByRole('button', { name: 'Entrar na lista' }).click();
    await expect(
      form.getByText(
        'A lista de espera não está aberta neste endereço. Enquanto isso, veja a demo.',
      ),
    ).toBeVisible();
    await expect(form).not.toHaveAttribute('data-state', 'done');
  });
});
