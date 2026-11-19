import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  ABACATEPAY_API_BASE_URL,
  ABACATEPAY_HMAC_PUBLIC_KEY,
  abacatePayHttp,
  abacatePaySignature,
  keyModeOf,
  validAbacatePaySignature,
} from './abacatepay.ts';

// The AbacatePay adapter against the shapes read in its docs on 19/11/2026 (see the header of abacatepay.ts).

const TEST_KEY = 'abc_dev_unit';
const PROD_KEY = 'abc_prod_unit';

function fetchReturning(status: number, body: unknown) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    Response.json(body, { status }),
  );
}

describe('signature (X-Webhook-Signature)', () => {
  it('is base64(HMAC-SHA256(public key, raw body))', () => {
    const body = '{"id":"log_1","event":"transparent.completed"}';
    const expected = createHmac('sha256', ABACATEPAY_HMAC_PUBLIC_KEY).update(body).digest('base64');
    expect(abacatePaySignature(body)).toBe(expected);
    expect(validAbacatePaySignature(body, expected)).toBe(true);
  });

  it('a re-serialized body, another key or no header fails', () => {
    const body = '{"id":"log_1", "event":"transparent.completed"}';
    const sig = abacatePaySignature(body);
    expect(validAbacatePaySignature(JSON.stringify(JSON.parse(body)), sig)).toBe(false);
    expect(validAbacatePaySignature(body, abacatePaySignature(body, 'other-key'))).toBe(false);
    expect(validAbacatePaySignature(body, null)).toBe(false);
  });
});

describe('key mode', () => {
  it('abc_dev_ is Test Mode; anything else is treated as production', () => {
    expect(keyModeOf(TEST_KEY)).toBe('test');
    expect(keyModeOf(PROD_KEY)).toBe('production');
    expect(keyModeOf('something')).toBe('production');
  });
});

describe('HTTP adapter', () => {
  const created = {
    data: {
      id: 'pix_char_1',
      amount: 59900,
      status: 'PENDING',
      devMode: true,
      brCode: '000201…',
      brCodeBase64: 'data:image/png;base64,AAAA',
      expiresAt: '2026-11-19T20:15:00.000Z',
    },
    success: true,
    error: null,
  };

  it('createPix posts method PIX with amount, expiresIn, externalId and metadata, Bearer key', async () => {
    const f = fetchReturning(200, created);
    const gw = abacatePayHttp({ apiKey: TEST_KEY, fetch: f });
    const r = await gw.createPix({
      amountCents: 59900,
      description: 'Refund - plano Empresa (anual)',
      expiresInSeconds: 900,
      externalId: 'c1',
      metadata: { chargeId: 'c1' },
    });
    expect(r).toMatchObject({ ok: true, value: { id: 'pix_char_1', devMode: true } });
    const [url, init] = f.mock.calls[0] ?? [];
    expect(url).toBe(`${ABACATEPAY_API_BASE_URL}/transparents/create`);
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string> | undefined)?.authorization).toBe(
      `Bearer ${TEST_KEY}`,
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      method: 'PIX',
      data: {
        amount: 59900,
        expiresIn: 900,
        description: 'Refund - plano Empresa (anual)',
        externalId: 'c1',
        metadata: { chargeId: 'c1' },
      },
    });
  });

  it('an error envelope or a malformed answer is never a charge', async () => {
    const rejected = abacatePayHttp({
      apiKey: TEST_KEY,
      fetch: fetchReturning(400, { data: null, success: false, error: 'PIX is not available' }),
    });
    expect(await rejected.checkPix('pix_char_1')).toMatchObject({
      ok: false,
      error: { code: 'REJECTED' },
    });
    const broken = abacatePayHttp({
      apiKey: TEST_KEY,
      fetch: fetchReturning(200, { data: { id: 'x' }, success: true, error: null }),
    });
    expect(
      await broken.createPix({
        amountCents: 100,
        description: 'x',
        expiresInSeconds: 900,
        externalId: 'c',
        metadata: {},
      }),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_RESPONSE' } });
    const down = abacatePayHttp({ apiKey: TEST_KEY, fetch: fetchReturning(503, {}) });
    expect(await down.checkPix('p')).toMatchObject({ ok: false, error: { code: 'UNAVAILABLE' } });
  });

  it('checkPix reads the status; simulate-payment only with a Test Mode key', async () => {
    const f = fetchReturning(200, {
      data: { id: 'pix_char_1', status: 'PAID', expiresAt: '2026-11-19T20:15:00.000Z' },
      success: true,
      error: null,
    });
    const gw = abacatePayHttp({ apiKey: TEST_KEY, fetch: f });
    expect(await gw.checkPix('pix_char_1')).toMatchObject({ ok: true, value: { status: 'PAID' } });
    expect(String(f.mock.calls[0]?.[0])).toBe(
      `${ABACATEPAY_API_BASE_URL}/transparents/check?id=pix_char_1`,
    );
    expect((await gw.simulatePayment('pix_char_1')).ok).toBe(true);
    expect(String(f.mock.calls[1]?.[0])).toBe(
      `${ABACATEPAY_API_BASE_URL}/transparents/simulate-payment?id=pix_char_1`,
    );

    const prodFetch = fetchReturning(200, { data: {}, success: true, error: null });
    const prod = abacatePayHttp({ apiKey: PROD_KEY, fetch: prodFetch });
    expect((await prod.simulatePayment('pix_char_1')).ok).toBe(false);
    expect(prodFetch).not.toHaveBeenCalled();
  });

  it('another base URL is honoured only for a Test Mode key', async () => {
    const f = fetchReturning(200, created);
    await abacatePayHttp({
      apiKey: TEST_KEY,
      baseUrl: 'http://localhost:9/v2/',
      fetch: f,
    }).checkPix('p');
    expect(String(f.mock.calls[0]?.[0])).toBe('http://localhost:9/v2/transparents/check?id=p');
    const g = fetchReturning(200, created);
    await abacatePayHttp({ apiKey: PROD_KEY, baseUrl: 'http://localhost:9/v2', fetch: g }).checkPix(
      'p',
    );
    expect(String(g.mock.calls[0]?.[0])).toBe(`${ABACATEPAY_API_BASE_URL}/transparents/check?id=p`);
  });
});
