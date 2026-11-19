import { expect, test } from '../fixtures.ts';

// TESTS §5 / §6.3 (`security`): headers on /app (CSP, HSTS, nosniff, frame-ancestors, no-store), the
// anonymous session minted on /app/**, admin routes that do not exist for anyone, and the Pluggy
// webhook refusing an unsigned call. Runs against the server of the run (CI: Postgres 17 + replay).

test.describe('security @security', () => {
  test('/app carries the security headers, no-store and noindex', async ({ request }) => {
    const res = await request.get('/app/comecar/cnpj');
    const h = res.headers();
    expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(h['content-security-policy']).toContain('frame-src https://connect.pluggy.ai');
    expect(h['content-security-policy']).toContain("object-src 'none'");
    expect(h['strict-transport-security']).toContain('max-age=63072000');
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['cache-control']).toContain('no-store');
    expect(h['x-robots-tag']).toBe('noindex');
  });

  test('/app/** without a session creates an anonymous rf_sid (HttpOnly, Secure, Lax)', async ({
    request,
  }) => {
    const res = await request.get('/app', { maxRedirects: 0 });
    const cookie = res
      .headersArray()
      .find((x) => x.name.toLowerCase() === 'set-cookie' && x.value.startsWith('rf_sid='));
    expect(cookie?.value).toMatch(/HttpOnly/i);
    expect(cookie?.value).toMatch(/Secure/i);
    expect(cookie?.value).toMatch(/SameSite=lax/i);
  });

  test('a forged rf_sid is replaced by a fresh one', async ({ request }) => {
    const res = await request.get('/app', {
      maxRedirects: 0,
      headers: { cookie: 'rf_sid=eyJ1c2VySWQiOiJ4In0.forged' },
    });
    const cookie = res
      .headersArray()
      .find((x) => x.name.toLowerCase() === 'set-cookie' && x.value.startsWith('rf_sid='));
    expect(cookie?.value).not.toContain('forged');
  });

  test('/app/admin/** without the role → 404', async ({ request }) => {
    expect((await request.get('/app/admin/leis')).status()).toBe(404);
    expect((await request.get('/app/admin/saude')).status()).toBe(404);
  });

  test('the Pluggy webhook without the secret header → 401, nothing processed', async ({
    request,
  }) => {
    const res = await request.post('/api/webhooks/pluggy', {
      data: { event: 'item/updated', eventId: 'e2e-1', itemId: 'x', clientId: 'x' },
    });
    expect(res.status()).toBe(401);
    expect(await res.json()).toEqual({ ok: false });
  });

  test('the AbacatePay webhook without the secret or the signature → 401, nothing processed', async ({
    request,
  }) => {
    const event = {
      id: 'log_e2e_forged',
      event: 'transparent.completed',
      devMode: true,
      data: { transparent: { id: 'pix_char_x', amount: 100, status: 'PAID', devMode: true } },
    };
    const bare = await request.post('/api/webhooks/abacatepay', { data: event });
    expect(bare.status()).toBe(401);
    expect(await bare.json()).toEqual({ ok: false });
    const wrong = await request.post('/api/webhooks/abacatepay?webhookSecret=guess', {
      headers: { 'x-webhook-signature': 'bm9wZQ==' },
      data: event,
    });
    expect(wrong.status()).toBe(401);
  });
});
