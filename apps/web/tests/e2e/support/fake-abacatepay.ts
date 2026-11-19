import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { fileURLToPath } from 'node:url';

// A local stand-in for AbacatePay v2 in Test Mode (no keys exist yet; the real Test Mode run is step N8). It answers
// the three routes the app calls (transparents/create, check, simulate-payment) with the documented envelopes and,
// like AbacatePay after simulate-payment, delivers a signed `transparent.completed` to the app's webhook. The app
// reaches it through ABACATEPAY_API_BASE_URL, which the server honours only for a Test Mode key.

/** The public HMAC key, read from the app's source (single source of truth; `server-only` modules cannot be imported). */
function publicKey(): string {
  const src = readFileSync(
    fileURLToPath(new URL('../../../src/server/payments/abacatepay.ts', import.meta.url)),
    'utf8',
  );
  const m = /ABACATEPAY_HMAC_PUBLIC_KEY =\s*'([A-Za-z0-9]+)'/.exec(src);
  if (!m?.[1]) throw new Error('fake-abacatepay: public key not found in abacatepay.ts');
  return m[1];
}

// 1×1 transparent PNG: stands in for the QR image.
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

interface FakeCharge {
  id: string;
  amount: number;
  status: 'PENDING' | 'PAID';
  expiresAt: string;
}

export interface FakeAbacatePay {
  url: string;
  charges: Map<string, FakeCharge>;
  deliveries: { status: number }[];
  close(): Promise<void>;
}

export async function startFakeAbacatePay(options: {
  port: number;
  /** Where the webhook goes, e.g. http://localhost:3125/api/webhooks/abacatepay. */
  webhookUrl: string;
  webhookSecret: string;
}): Promise<FakeAbacatePay> {
  const key = publicKey();
  const charges = new Map<string, FakeCharge>();
  const deliveries: { status: number }[] = [];
  let seq = 0;

  const send = (res: import('node:http').ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  async function deliver(c: FakeCharge): Promise<void> {
    const body = JSON.stringify({
      id: `log_fake_${c.id}`,
      event: 'transparent.completed',
      apiVersion: 2,
      devMode: true,
      data: {
        transparent: {
          id: c.id,
          externalId: null,
          amount: c.amount,
          status: 'PAID',
          devMode: true,
          metadata: {},
        },
        customer: { id: '', name: null, email: null, taxId: null },
        payerInformation: { method: 'PIX' },
      },
    });
    const res = await fetch(options.webhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-webhook-secret': options.webhookSecret,
        'x-webhook-signature': createHmac('sha256', key).update(body).digest('base64'),
      },
      body,
    });
    deliveries.push({ status: res.status });
  }

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.headers.authorization?.startsWith('Bearer abc_dev_') !== true) {
      return send(res, 401, {
        data: null,
        success: false,
        error: 'Token de autenticação inválido',
      });
    }
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      if (req.method === 'POST' && url.pathname === '/v2/transparents/create') {
        const input = JSON.parse(raw || '{}') as { data?: { amount?: number; expiresIn?: number } };
        seq += 1;
        const c: FakeCharge = {
          id: `pix_char_e2e${Date.now().toString(36)}${seq}`,
          amount: input.data?.amount ?? 0,
          status: 'PENDING',
          expiresAt: new Date(Date.now() + (input.data?.expiresIn ?? 900) * 1000).toISOString(),
        };
        charges.set(c.id, c);
        return send(res, 200, {
          data: {
            id: c.id,
            amount: c.amount,
            status: c.status,
            devMode: true,
            brCode: `00020101021226950014br.gov.bcb.pix.E2E.${c.id}`,
            brCodeBase64: PNG,
            platformFee: 80,
            createdAt: new Date().toISOString(),
            expiresAt: c.expiresAt,
          },
          success: true,
          error: null,
        });
      }
      const c = charges.get(url.searchParams.get('id') ?? '');
      if (req.method === 'GET' && url.pathname === '/v2/transparents/check') {
        if (!c)
          return send(res, 404, { data: null, success: false, error: 'Pix QR Code not found' });
        return send(res, 200, {
          data: { id: c.id, status: c.status, expiresAt: c.expiresAt },
          success: true,
          error: null,
        });
      }
      if (req.method === 'POST' && url.pathname === '/v2/transparents/simulate-payment') {
        if (!c || c.status !== 'PENDING') {
          return send(res, 404, { data: null, success: false, error: 'Pix QR Code not found' });
        }
        c.status = 'PAID';
        send(res, 200, { data: { id: c.id, status: 'PAID' }, success: true, error: null });
        // Like AbacatePay: the webhook goes out after the answer.
        setTimeout(() => {
          deliver(c).catch(() => deliveries.push({ status: 0 }));
        }, 200);
        return;
      }
      send(res, 404, { data: null, success: false, error: 'not found' });
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, '127.0.0.1', () => resolve());
  });
  return {
    url: `http://127.0.0.1:${options.port}/v2`,
    charges,
    deliveries,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
