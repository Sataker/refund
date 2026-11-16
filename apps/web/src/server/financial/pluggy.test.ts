import { describe, expect, it } from 'vitest';
import { PluggyFinancial } from './pluggy.ts';

// PluggyFinancial over an injected fetch: API key cached (§9.3), whitelist on every object (§6.2),
// pagination, status → ProviderError, the probe (ADR-012). No network.

interface Call {
  method: string;
  path: string;
  apiKey: string | null;
  body: unknown;
}

function fakeFetch(routes: Record<string, (call: Call) => Response>) {
  const calls: Call[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    const call: Call = {
      method: init?.method ?? 'GET',
      path: url.pathname + url.search,
      apiKey: headers.get('x-api-key'),
      body: init?.body ? JSON.parse(String(init.body)) : null,
    };
    calls.push(call);
    const route = Object.keys(routes).find((r) => `${call.method} ${call.path}`.startsWith(r));
    return route
      ? (routes[route] as (c: Call) => Response)(call)
      : new Response('{}', { status: 404 });
  }) as typeof fetch;
  return { fn, calls };
}

const json = (body: unknown, status = 200) => Response.json(body, { status });
const ITEM = {
  id: 'item-1',
  status: 'UPDATED',
  executionStatus: 'SUCCESS',
  clientUserId: 'user-1',
  connector: { id: 2, name: 'Pluggy Bank', isSandbox: true, type: 'PERSONAL_BANK' },
  parameter: { cpf: 'never copied' },
};

function client(routes: Record<string, (call: Call) => Response>, now = () => 0) {
  const f = fakeFetch({ 'POST /auth': () => json({ apiKey: 'key-1' }), ...routes });
  const p = new PluggyFinancial({
    clientId: 'id',
    clientSecret: 'secret',
    pepper: Buffer.from('p'.repeat(32)),
    fetch: f.fn,
    now,
  });
  return { p, calls: f.calls };
}

describe('PluggyFinancial', () => {
  it('authenticates once and sends the key on every call; the connect token carries clientUserId', async () => {
    const { p, calls } = client({
      'POST /connect_token': () => json({ accessToken: 'ct-1' }),
      'GET /items/item-1': () => json(ITEM),
    });
    const t = await p.createConnectToken('user-1', { mode: 'live' });
    expect(t).toMatchObject({ ok: true, value: { accessToken: 'ct-1' } });
    await p.getItem('item-1', { mode: 'live' });
    expect(calls.filter((c) => c.path === '/auth')).toHaveLength(1);
    const token = calls.find((c) => c.path === '/connect_token');
    expect(token?.apiKey).toBe('key-1');
    expect(token?.body).toEqual({ options: { clientUserId: 'user-1', avoidDuplicates: true } });
  });

  it('renews the API key after 110 minutes', async () => {
    let now = 0;
    const { p, calls } = client({ 'GET /items/item-1': () => json(ITEM) }, () => now);
    await p.getItem('item-1', { mode: 'live' });
    now = 111 * 60_000;
    await p.getItem('item-1', { mode: 'live' });
    expect(calls.filter((c) => c.path === '/auth')).toHaveLength(2);
  });

  it('whitelists the item (credentials never copied) and maps HTTP errors', async () => {
    const { p } = client({
      'GET /items/item-1': () => json(ITEM),
      'GET /items/gone': () => json({}, 404),
      'GET /items/slow': () => json({}, 429),
      'GET /items/boom': () => json({}, 500),
    });
    const item = await p.getItem('item-1', { mode: 'live' });
    expect(item).toMatchObject({ ok: true, value: { sourceId: 'item-1', clientUserId: 'user-1' } });
    expect(JSON.stringify(item)).not.toContain('never copied');
    expect(await p.getItem('gone', { mode: 'live' })).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
    expect(await p.getItem('slow', { mode: 'live' })).toMatchObject({
      ok: false,
      error: { code: 'RATE_LIMITED' },
    });
    expect(await p.getItem('boom', { mode: 'live' })).toMatchObject({
      ok: false,
      error: { code: 'UNAVAILABLE' },
    });
  });

  it('a rejected auth is UNAUTHORIZED; a network failure is UNAVAILABLE', async () => {
    const denied = new PluggyFinancial({
      clientId: 'id',
      clientSecret: 'bad',
      pepper: Buffer.alloc(32),
      fetch: fakeFetch({ 'POST /auth': () => json({}, 401) }).fn,
    });
    expect(await denied.probe({ mode: 'live' })).toMatchObject({
      ok: false,
      error: { code: 'UNAUTHORIZED' },
    });
    const offline = new PluggyFinancial({
      clientId: 'id',
      clientSecret: 's',
      pepper: Buffer.alloc(32),
      fetch: (async () => {
        throw new TypeError('fetch failed');
      }) as typeof fetch,
    });
    expect(await offline.probe({ mode: 'live' })).toMatchObject({
      ok: false,
      error: { code: 'UNAVAILABLE' },
    });
  });

  it('lists accounts with the holder from the connector and pages through transactions', async () => {
    const tx = (id: string, amount: number) => ({
      id,
      accountId: 'acc-1',
      date: '2026-10-05T00:00:00.000Z',
      description: 'PIX RECEBIDO',
      descriptionRaw: 'raw never copied',
      amount,
      type: amount >= 0 ? 'CREDIT' : 'DEBIT',
      category: null,
    });
    const { p, calls } = client({
      'GET /items/item-1': () => json(ITEM),
      'GET /accounts?itemId=item-1': () =>
        json({
          results: [
            {
              id: 'acc-1',
              type: 'BANK',
              subtype: 'CHECKING_ACCOUNT',
              name: 'Conta',
              currencyCode: 'BRL',
              balance: 10.5,
              number: '1234-5',
            },
          ],
        }),
      'GET /transactions?accountId=acc-1': (c) =>
        c.path.includes('page=1')
          ? json({ results: [tx('t1', 100.25)], totalPages: 2 })
          : json({ results: [tx('t2', -3)], totalPages: 2 }),
    });
    const accounts = await p.listAccounts('item-1', { mode: 'live' });
    expect(accounts).toMatchObject({
      ok: true,
      value: [{ sourceId: 'acc-1', holder: 'PF', balanceCents: 1050 }],
    });
    expect(JSON.stringify(accounts)).not.toContain('1234-5');
    const pages: unknown[] = [];
    for await (const page of p.listTransactions(
      'acc-1',
      { from: '2025-11-12' as never, to: '2026-11-12' as never },
      { mode: 'live' },
    )) {
      pages.push(page);
    }
    expect(pages).toMatchObject([
      { ok: true, value: [{ sourceId: 't1', amountCents: 10025 }] },
      { ok: true, value: [{ sourceId: 't2', amountCents: -300 }] },
    ]);
    expect(JSON.stringify(pages)).not.toContain('raw never copied');
    expect(
      calls.some((c) => c.path.includes('from=2025-11-12') && c.path.includes('pageSize=500')),
    ).toBe(true);
  });

  it('probe: sandbox connectors present → available; revoke tolerates an item already gone', async () => {
    const { p } = client({
      'GET /connectors?sandbox=true': () => json({ results: [{ id: 0 }] }),
      'DELETE /items/item-1': () => new Response(null, { status: 204 }),
      'DELETE /items/gone': () => json({}, 404),
    });
    expect(await p.probe({ mode: 'live' })).toEqual({
      ok: true,
      value: { sandboxAvailable: true },
    });
    expect(await p.revokeItem('item-1', { mode: 'live' })).toEqual({ ok: true, value: undefined });
    expect(await p.revokeItem('gone', { mode: 'live' })).toEqual({ ok: true, value: undefined });
  });
});
