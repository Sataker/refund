import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  ChainedCnpj,
  CNPJ_SOURCES,
  type Cnpj,
  CnpjProviderGuard,
  type CnpjSource,
  type ExternalCachePort,
  LiveCnpj,
  MAX_RETRY_AFTER_MS,
  type PublicCompany,
  preferDatedSimples,
  ReplayCnpj,
} from '../src/index.ts';
import { CPF, PERSONAL_EMAIL } from './helpers.ts';

// E21 chain behaviour with a fake fetch routed by host: fallback order, 429, timeout, breaker, pacing,
// the not-found rule, the Simples rule, and no QSA in the output or the logs.

const BB = '00000000000191' as Cnpj;
const partner = 'BELTRANO SOCIO OCULTO';
const HOSTS: Record<CnpjSource, string> = {
  brasilapi: 'brasilapi.com.br',
  opencnpj: 'api.opencnpj.org',
  cnpja: 'open.cnpja.com',
  minhareceita: 'minhareceita.org',
  cnpjws: 'publica.cnpj.ws',
  receitaws: 'receitaws.com.br',
};
const ORDER = CNPJ_SOURCES.map((s) => s.source);

/** The recorded answer plus a partner list, as a real answer would carry. */
function body(source: CnpjSource): Record<string, unknown> {
  const path = new URL(`./fixtures/cnpj/${source}.${BB}.json`, import.meta.url);
  const raw = JSON.parse(readFileSync(path, 'utf8')).raw as Record<string, unknown>;
  return { ...raw, qsa: [{ nome_socio: partner, cnpj_cpf_do_socio: CPF }], email: PERSONAL_EMAIL };
}

type Step = { status: number; body?: unknown; headers?: Record<string, string> } | 'hang';

/** Fake fetch: each host answers its own script (last step repeats); unknown hosts hang. */
function routedFetch(routes: Partial<Record<CnpjSource, Step[]>>) {
  const calls: CnpjSource[] = [];
  const count = new Map<CnpjSource, number>();
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const host = new URL(String(input)).host;
    const source = (Object.keys(HOSTS) as CnpjSource[]).find((s) => HOSTS[s] === host);
    if (!source) throw new TypeError('unexpected host');
    calls.push(source);
    const n = count.get(source) ?? 0;
    count.set(source, n + 1);
    const script = routes[source] ?? ['hang'];
    const step = script[Math.min(n, script.length - 1)] ?? 'hang';
    if (step === 'hang') {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      });
    }
    return new Response(JSON.stringify(step.body ?? null), {
      status: step.status,
      headers: { 'content-type': 'application/json', ...(step.headers ?? {}) },
    });
  }) as typeof fetch;
  return Object.assign(fn, { calls });
}

const ok200 = (source: CnpjSource): Step[] => [{ status: 200, body: body(source) }];
const s500: Step[] = [{ status: 500 }];
const s404: Step[] = [{ status: 404 }];

function chain(
  options: {
    guard?: CnpjProviderGuard;
    cache?: ExternalCachePort;
    skip?: string[];
    budgetMs?: number;
    timeoutMs?: number;
    replay?: ReplayCnpj;
  } = {},
) {
  const live = CNPJ_SOURCES.map(
    (spec) =>
      new LiveCnpj(spec, {
        retries: 0,
        timeoutMs: options.timeoutMs ?? 50,
        now: () => new Date('2026-11-20T12:00:00.000Z'),
      }),
  );
  return new ChainedCnpj({
    live,
    ...(options.guard ? { guard: options.guard } : {}),
    ...(options.cache ? { cache: options.cache } : {}),
    ...(options.skip ? { skip: options.skip } : {}),
    ...(options.replay ? { replay: options.replay } : {}),
    budgetMs: options.budgetMs ?? 5_000,
  });
}

function run(c: ChainedCnpj, fetch: typeof globalThis.fetch, cnpj: Cnpj = BB) {
  const log = vi.fn();
  return c.lookup(cnpj, { mode: 'live', fetch, log }).then((r) => ({ r, log }));
}

describe('fallback order', () => {
  it('BrasilAPI answers first; nothing else is asked', async () => {
    const fetch = routedFetch({ brasilapi: ok200('brasilapi') });
    const { r, log } = await run(chain(), fetch);
    expect(r.ok && r.value.source).toBe('brasilapi');
    expect(fetch.calls).toEqual(['brasilapi']);
    expect(log).toHaveBeenCalledWith(
      'provider.answered',
      expect.objectContaining({ source: 'brasilapi' }),
    );
  });

  it.each(ORDER.slice(1).map((s, i) => [s, i + 1] as const))(
    'every source before %s fails (500) → %s answers',
    async (winner, index) => {
      const routes: Partial<Record<CnpjSource, Step[]>> = {};
      for (const s of ORDER.slice(0, index)) routes[s] = s500;
      routes[winner] = ok200(winner);
      const fetch = routedFetch(routes);
      const { r } = await run(chain(), fetch);
      expect(r.ok && r.value.source).toBe(winner);
      expect(fetch.calls).toEqual(ORDER.slice(0, index + 1));
    },
  );

  it('429, timeout and an answer outside the shape all move on', async () => {
    const fetch = routedFetch({
      brasilapi: [{ status: 429, headers: { 'retry-after': '30' } }],
      opencnpj: ['hang'],
      cnpja: [{ status: 200, body: { unexpected: true } }],
      minhareceita: ok200('minhareceita'),
    });
    const { r, log } = await run(chain(), fetch);
    expect(r.ok && r.value.source).toBe('minhareceita');
    const failures = log.mock.calls.filter(([e]) => e === 'provider.failure').map(([, d]) => d);
    expect(failures).toEqual([
      expect.objectContaining({ source: 'brasilapi', code: 'RATE_LIMITED' }),
      expect.objectContaining({ source: 'opencnpj', code: 'TIMEOUT' }),
      expect.objectContaining({ source: 'cnpja', code: 'UNEXPECTED_RESPONSE' }),
    ]);
  });

  it('every source down → UNAVAILABLE with the longest Retry-After', async () => {
    const fetch = routedFetch({
      brasilapi: s500,
      opencnpj: s500,
      cnpja: [{ status: 429, headers: { 'retry-after': '90' } }],
      minhareceita: s500,
      cnpjws: s500,
      receitaws: s500,
    });
    const { r } = await run(chain(), fetch);
    expect(r).toMatchObject({ ok: false, error: { code: 'UNAVAILABLE', retryInMs: 90_000 } });
    expect(fetch.calls).toEqual(ORDER);
  });

  it('the dev-only skip list leaves BrasilAPI out and the next source answers', async () => {
    const fetch = routedFetch({ brasilapi: ok200('brasilapi'), opencnpj: ok200('opencnpj') });
    const { r, log } = await run(chain({ skip: ['brasilapi'] }), fetch);
    expect(r.ok && r.value.source).toBe('opencnpj');
    expect(fetch.calls).toEqual(['opencnpj']);
    expect(log).toHaveBeenCalledWith('provider.skipped', {
      source: 'brasilapi',
      reason: 'disabled',
    });
  });

  it('the wall-clock budget stops the walk', async () => {
    const fetch = routedFetch({});
    const { r, log } = await run(chain({ budgetMs: 80, timeoutMs: 1_000 }), fetch);
    expect(r).toMatchObject({ ok: false, error: { code: 'UNAVAILABLE' } });
    expect(fetch.calls.length).toBeLessThan(ORDER.length);
    expect(log).toHaveBeenCalledWith(
      'provider.skipped',
      expect.objectContaining({ reason: 'budget' }),
    );
  });
});

describe('not-found rule', () => {
  it('a BrasilAPI 404 is authoritative: the chain stops at once', async () => {
    const fetch = routedFetch({ brasilapi: s404, opencnpj: ok200('opencnpj') });
    const { r } = await run(chain(), fetch);
    expect(r).toMatchObject({ ok: false, error: { code: 'NOT_FOUND', recoverable: false } });
    expect(fetch.calls).toEqual(['brasilapi']);
  });

  it('BrasilAPI down → the next source is asked and answers', async () => {
    const fetch = routedFetch({ brasilapi: ['hang'], opencnpj: ok200('opencnpj') });
    const { r } = await run(chain(), fetch);
    expect(r.ok && r.value.source).toBe('opencnpj');
  });

  it('a mirror 404 is not final: the next mirror may have the company', async () => {
    const fetch = routedFetch({ brasilapi: s500, opencnpj: s404, cnpja: ok200('cnpja') });
    const { r } = await run(chain(), fetch);
    expect(r.ok && r.value.source).toBe('cnpja');
  });

  it('BrasilAPI down and two mirrors say 404 → NOT_FOUND', async () => {
    const fetch = routedFetch({
      brasilapi: s500,
      opencnpj: s404,
      cnpja: s500,
      minhareceita: s404,
      cnpjws: s500,
      receitaws: s500,
    });
    const { r } = await run(chain(), fetch);
    expect(r).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('a single mirror 404 among outages → UNAVAILABLE (it may lag behind the Receita)', async () => {
    const fetch = routedFetch({
      brasilapi: s500,
      opencnpj: s404,
      cnpja: s500,
      minhareceita: s500,
      cnpjws: s500,
      receitaws: s500,
    });
    const { r } = await run(chain(), fetch);
    expect(r).toMatchObject({ ok: false, error: { code: 'UNAVAILABLE' } });
  });

  it('a persona CNPJ (404 everywhere) still falls back to replay', async () => {
    const persona = {
      ...(sanitized('brasilapi') as PublicCompany),
      cnpj: 'RFDEV001000158' as Cnpj,
      source: 'persona' as const,
    };
    const replay = new ReplayCnpj({ fixtures: [], companies: [persona] });
    const fetch = routedFetch({ brasilapi: s404 });
    const { r } = await run(chain({ replay }), fetch, persona.cnpj);
    expect(r).toEqual({ ok: true, value: persona });
  });
});

function sanitized(source: CnpjSource): PublicCompany {
  const spec = CNPJ_SOURCES.find((s) => s.source === source);
  const r = spec?.sanitize(body(source), BB, '2026-11-20T12:00:00.000Z');
  if (!r?.ok) throw new Error('fixture');
  return r.value;
}

describe('circuit breaker and pacing', () => {
  it('three failures open the circuit: the source is skipped, then retried after the window', async () => {
    let now = 1_000_000;
    const guard = new CnpjProviderGuard({ failureThreshold: 3, openMs: 60_000, now: () => now });
    const fetch = routedFetch({ brasilapi: s500, opencnpj: ok200('opencnpj') });
    const c = chain({ guard });
    for (let i = 0; i < 3; i++) await run(c, fetch);
    expect(fetch.calls.filter((s) => s === 'brasilapi')).toHaveLength(3);

    const { r, log } = await run(c, fetch);
    expect(r.ok && r.value.source).toBe('opencnpj');
    expect(fetch.calls.filter((s) => s === 'brasilapi')).toHaveLength(3);
    expect(log).toHaveBeenCalledWith('provider.skipped', {
      source: 'brasilapi',
      reason: 'circuit_open',
    });
    expect(guard.snapshot(CNPJ_SOURCES)[0]).toMatchObject({ source: 'brasilapi', state: 'down' });

    now += 60_001; // half-open: one call goes through
    await run(c, fetch);
    expect(fetch.calls.filter((s) => s === 'brasilapi')).toHaveLength(4);
    await run(c, fetch); // that call failed: open again at once
    expect(fetch.calls.filter((s) => s === 'brasilapi')).toHaveLength(4);
  });

  it('a success closes the circuit', async () => {
    let now = 0;
    const guard = new CnpjProviderGuard({ failureThreshold: 2, openMs: 1_000, now: () => now });
    const c = chain({ guard });
    const down = routedFetch({ brasilapi: s500, opencnpj: ok200('opencnpj') });
    await run(c, down);
    await run(c, down);
    now += 1_001;
    const up = routedFetch({ brasilapi: ok200('brasilapi') });
    expect((await run(c, up)).r.ok).toBe(true);
    expect(guard.snapshot(CNPJ_SOURCES)[0]).toMatchObject({
      state: 'up',
      consecutiveFailures: 0,
    });
  });

  it('a 429 pauses the source for its Retry-After (at least the default)', async () => {
    let now = 0;
    const guard = new CnpjProviderGuard({ rateLimitedMs: 60_000, now: () => now });
    const c = chain({ guard });
    const fetch = routedFetch({
      brasilapi: [{ status: 429, headers: { 'retry-after': '120' } }],
      opencnpj: ok200('opencnpj'),
    });
    await run(c, fetch);
    now += 90_000;
    await run(c, fetch);
    expect(fetch.calls.filter((s) => s === 'brasilapi')).toHaveLength(1);
    now += 30_001;
    await run(c, fetch);
    expect(fetch.calls.filter((s) => s === 'brasilapi')).toHaveLength(2);
  });

  it('CNPJ.ws and ReceitaWS are paced to one call every 20 s in this process', async () => {
    let now = 0;
    const guard = new CnpjProviderGuard({ now: () => now });
    const c = chain({ guard, skip: ['brasilapi', 'opencnpj', 'cnpja', 'minhareceita'] });
    const fetch = routedFetch({ cnpjws: s500, receitaws: s500 });
    await run(c, fetch);
    expect(fetch.calls).toEqual(['cnpjws', 'receitaws']);
    now += 5_000;
    const { log } = await run(c, fetch);
    expect(fetch.calls).toHaveLength(2);
    expect(log).toHaveBeenCalledWith('provider.skipped', { source: 'cnpjws', reason: 'paced' });
    now += 15_001;
    await run(c, fetch);
    expect(fetch.calls).toHaveLength(4);
  });

  it('a 404 does not count as a failure', async () => {
    const guard = new CnpjProviderGuard({ failureThreshold: 1 });
    const c = chain({ guard });
    await run(c, routedFetch({ brasilapi: s404 }));
    expect(guard.snapshot(CNPJ_SOURCES)[0]).toMatchObject({ state: 'up' });
  });

  it('the snapshot says nothing before a source is asked', () => {
    expect(new CnpjProviderGuard().snapshot(CNPJ_SOURCES).map((h) => h.state)).toEqual(
      ORDER.map(() => 'unknown'),
    );
  });
});

describe('cache', () => {
  const company = sanitized('brasilapi');

  it('a fresh entry answers instantly, with no network call', async () => {
    const cache: ExternalCachePort = {
      get: async () => ({
        payload: company,
        fetchedAt: company.fetchedAt,
        expiresAt: '2999-01-01T00:00:00.000Z',
      }),
    };
    const fetch = routedFetch({ brasilapi: ok200('brasilapi') });
    const { r, log } = await run(chain({ cache }), fetch);
    expect(r).toEqual({ ok: true, value: company });
    expect(fetch.calls).toEqual([]);
    expect(log).toHaveBeenCalledWith('provider.answered', {
      source: 'external_cache',
      fresh: true,
    });
  });

  it('an expired entry is refreshed live, and only served when every source fails', async () => {
    const stale = {
      payload: company,
      fetchedAt: company.fetchedAt,
      expiresAt: '2000-01-01T00:00:00.000Z',
    };
    const set = vi.fn(async () => {});
    const cache: ExternalCachePort = { get: async () => stale, set };
    const live = routedFetch({ brasilapi: ok200('brasilapi') });
    await run(chain({ cache }), live);
    expect(live.calls).toEqual(['brasilapi']);
    expect(set).toHaveBeenCalledTimes(1);

    const down = routedFetch({
      brasilapi: s500,
      opencnpj: s500,
      cnpja: s500,
      minhareceita: s500,
      cnpjws: s500,
      receitaws: s500,
    });
    const { r } = await run(chain({ cache }), down);
    expect(r).toEqual({ ok: true, value: company });
  });

  it('an authoritative 404 is not overridden by an old cache entry', async () => {
    const cache: ExternalCachePort = {
      get: async () => ({ payload: company, fetchedAt: '', expiresAt: '2000-01-01T00:00:00Z' }),
    };
    const { r } = await run(chain({ cache }), routedFetch({ brasilapi: s404 }));
    expect(r).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });
});

describe('Simples disagreement rule', () => {
  const base = sanitized('brasilapi');
  const undated: PublicCompany = {
    ...base,
    simples: { optedIn: true, since: null, excludedAt: null },
  };
  const dated: PublicCompany = {
    ...base,
    source: 'opencnpj',
    simples: { optedIn: false, since: '2010-01-01', excludedAt: '2015-12-31' },
  };

  it('prefers the source that gives the dates', () => {
    expect(preferDatedSimples(undated, dated)).toBe(dated);
    expect(preferDatedSimples(dated, undated)).toBe(dated);
  });

  it('agreement keeps the first answer', () => {
    const agree: PublicCompany = {
      ...dated,
      simples: { optedIn: true, since: '2010-01-01', excludedAt: null },
    };
    expect(preferDatedSimples(undated, agree)).toBe(undated);
  });

  it('the chain asks one more source when the first opt-in is undated', async () => {
    const brasil = body('brasilapi');
    const fetch = routedFetch({
      brasilapi: [
        {
          status: 200,
          body: {
            ...brasil,
            opcao_pelo_simples: true,
            data_opcao_pelo_simples: null,
            data_exclusao_do_simples: null,
          },
        },
      ],
      opencnpj: ok200('opencnpj'),
    });
    const { r, log } = await run(chain(), fetch);
    expect(fetch.calls).toEqual(['brasilapi', 'opencnpj']);
    // OpenCNPJ says "not an optant" with dates (equal → dropped), BrasilAPI an undated opt-in.
    expect(r.ok && r.value.source).toBe('brasilapi');
    expect(log).not.toHaveBeenCalledWith('provider.simples_disagreement', expect.anything());
  });

  it('…and keeps the dated answer when the next source disagrees with dates', async () => {
    const fetch = routedFetch({
      brasilapi: [
        {
          status: 200,
          body: {
            ...body('brasilapi'),
            opcao_pelo_simples: true,
            data_opcao_pelo_simples: null,
            data_exclusao_do_simples: null,
          },
        },
      ],
      opencnpj: [
        {
          status: 200,
          body: { ...body('opencnpj'), data_exclusao_simples: '2012-01-01' },
        },
      ],
    });
    const { r, log } = await run(chain(), fetch);
    expect(r.ok && r.value).toMatchObject({
      source: 'opencnpj',
      simples: { optedIn: false, since: '2007-07-01', excludedAt: '2012-01-01' },
    });
    expect(log).toHaveBeenCalledWith('provider.simples_disagreement', {
      kept: 'opencnpj',
      dropped: 'brasilapi',
    });
  });
});

describe('privacy', () => {
  it('no partner, e-mail or CNPJ in the output or the logs, whichever source answers', async () => {
    for (const winner of ORDER) {
      const routes: Partial<Record<CnpjSource, Step[]>> = {};
      for (const s of ORDER.slice(0, ORDER.indexOf(winner))) routes[s] = s500;
      routes[winner] = ok200(winner);
      const { r, log } = await run(chain(), routedFetch(routes));
      expect(r.ok && r.value.source).toBe(winner);
      const out = JSON.stringify(r);
      expect(out).not.toContain(partner);
      expect(out).not.toContain(PERSONAL_EMAIL);
      const logs = JSON.stringify(log.mock.calls);
      for (const leak of [partner, PERSONAL_EMAIL, BB, 'BANCO DO BRASIL']) {
        expect(logs).not.toContain(leak);
      }
    }
  });
});

describe('E21 review fixes', () => {
  const base = sanitized('brasilapi');
  const simples = (optedIn: boolean, since: string | null): PublicCompany['simples'] => ({
    optedIn,
    since: since as PublicCompany['simples']['since'],
    excludedAt: null,
  });

  it('item 2: a Simples disagreement is judged on Simples dates only, the same way for both', () => {
    // The second answer is dated only on MEI: that says nothing about the Simples it contradicts.
    const first: PublicCompany = { ...base, simples: simples(true, null) };
    const meiDatedOnly: PublicCompany = {
      ...base,
      source: 'opencnpj',
      simples: simples(false, null),
      mei: { optedIn: false, since: '2019-01-01', excludedAt: '2020-01-01' },
    };
    expect(preferDatedSimples(first, meiDatedOnly)).toBe(first);
    // A Simples-dated first answer keeps its place even if its MEI is undated.
    const firstDated: PublicCompany = {
      ...base,
      simples: simples(true, '2010-01-01'),
      mei: { optedIn: true, since: null, excludedAt: null },
    };
    const second: PublicCompany = { ...base, source: 'opencnpj', simples: simples(false, null) };
    expect(preferDatedSimples(firstDated, second)).toBe(firstDated);
  });

  it('item 2: a MEI disagreement is judged on MEI dates', () => {
    const first: PublicCompany = {
      ...base,
      mei: { optedIn: true, since: null, excludedAt: null },
    };
    const second: PublicCompany = {
      ...base,
      source: 'cnpja',
      mei: { optedIn: false, since: '2019-01-01', excludedAt: '2021-06-30' },
    };
    expect(preferDatedSimples(first, second)).toBe(second);
    expect(preferDatedSimples(second, first)).toBe(second);
  });

  it('item 3: one mirror 404 with the other sources skipped → UNAVAILABLE, not NOT_FOUND', async () => {
    let now = 0;
    const guard = new CnpjProviderGuard({ failureThreshold: 1, openMs: 60_000, now: () => now });
    const c = chain({ guard });
    // Open every circuit except OpenCNPJ's.
    await run(
      c,
      routedFetch({
        brasilapi: s500,
        opencnpj: ok200('opencnpj'),
      }),
    );
    for (const s of ['cnpja', 'minhareceita', 'cnpjws', 'receitaws'] as const) {
      guard.failure(s, { code: 'UNAVAILABLE', message: 'x', recoverable: true, source: s });
    }
    now += 1;
    const { r } = await run(c, routedFetch({ opencnpj: s404 }));
    expect(r).toMatchObject({ ok: false, error: { code: 'UNAVAILABLE' } });
    // With nothing skipped, the same lone answer stays a NOT_FOUND (single-source rule).
    const only = new ChainedCnpj({
      live: [new LiveCnpj(CNPJ_SOURCES[1] as (typeof CNPJ_SOURCES)[number], { timeoutMs: 50 })],
    });
    const lone = await only.lookup(BB, { mode: 'live', fetch: routedFetch({ opencnpj: s404 }) });
    expect(lone).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('item 4: CNPJá open is paced (12 s)', () => {
    expect(CNPJ_SOURCES.find((s) => s.source === 'cnpja')?.minIntervalMs).toBe(12_000);
  });

  it('item 5: a Retry-After is capped at 10 minutes', () => {
    let now = 0;
    const guard = new CnpjProviderGuard({ now: () => now });
    guard.failure('brasilapi', {
      code: 'RATE_LIMITED',
      message: 'x',
      recoverable: true,
      source: 'brasilapi',
      retryInMs: 3 * 60 * 60_000,
    });
    now = MAX_RETRY_AFTER_MS - 1;
    expect(guard.admit('brasilapi')).toEqual({ ok: false, reason: 'circuit_open' });
    now = MAX_RETRY_AFTER_MS;
    expect(guard.admit('brasilapi')).toEqual({ ok: true });
  });

  it('item 6: half-open lets one probe through; concurrent lookups keep skipping until it ends', () => {
    let now = 0;
    const guard = new CnpjProviderGuard({ failureThreshold: 1, openMs: 1_000, now: () => now });
    const down = {
      code: 'UNAVAILABLE' as const,
      message: 'x',
      recoverable: true,
      source: 'opencnpj',
    };
    guard.failure('opencnpj', down);
    now = 1_000;
    expect(guard.admit('opencnpj')).toEqual({ ok: true });
    expect(guard.admit('opencnpj')).toEqual({ ok: false, reason: 'circuit_open' });
    guard.success('opencnpj');
    expect(guard.admit('opencnpj')).toEqual({ ok: true });
    expect(guard.admit('opencnpj')).toEqual({ ok: true });
  });

  it('item 7: the health gives the last success to the minute only', () => {
    const now = Date.parse('2026-11-20T12:34:56.789Z');
    const guard = new CnpjProviderGuard({ now: () => now });
    guard.admit('brasilapi');
    guard.success('brasilapi');
    expect(guard.snapshot(CNPJ_SOURCES)[0]?.lastOkAt).toBe('2026-11-20T12:34:00.000Z');
  });
});
