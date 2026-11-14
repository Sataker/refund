import { describe, expect, it, vi } from 'vitest';
import { parseRetryAfter } from '../src/http.ts';
import {
  BrasilApiCnpj,
  ChainedCnpj,
  type Cnpj,
  type CnpjProvider,
  CnpjWsCnpj,
  createEnvelope,
  type ExternalCachePort,
  type ProviderContext,
  type PublicCompany,
  ReplayCnpj,
} from '../src/index.ts';
import { ALNUM_CNPJ, NUMERIC_CNPJ, scriptedFetch } from './helpers.ts';

const cnpj = NUMERIC_CNPJ as Cnpj;
const now = () => new Date('2026-11-17T12:00:00.000Z');
const noSleep = async () => {};

const brasilApiBody = {
  cnpj: NUMERIC_CNPJ,
  razao_social: 'ACME SOFTWARE LTDA',
  codigo_natureza_juridica: 2062,
  natureza_juridica: 'Sociedade Empresária Limitada',
  codigo_porte: 3,
  cnae_fiscal: 6201501,
  cnae_fiscal_descricao: 'Desenvolvimento de programas',
  descricao_situacao_cadastral: 'ATIVA',
  data_inicio_atividade: '2019-03-11',
  uf: 'SP',
  qsa: [{ nome_socio: 'SOCIO FICTICIO' }],
};

const cnpjWsBody = {
  razao_social: 'ACME SOFTWARE LTDA',
  natureza_juridica: { id: '2062', descricao: 'Sociedade Empresária Limitada' },
  estabelecimento: {
    cnpj: NUMERIC_CNPJ,
    data_inicio_atividade: '2019-03-11',
    atividade_principal: { id: '6201501', subclasse: '6201-5/01', descricao: 'Desenvolvimento' },
  },
};

function live(fetch: typeof globalThis.fetch): ProviderContext {
  return { mode: 'live', fetch };
}

const persona: PublicCompany = {
  cnpj: 'RFDEV001000158' as Cnpj,
  displayLegalName: 'MARINA DEV LTDA',
  displayTradeName: 'Marina Dev',
  masked: false,
  legalNature: { code: '2062', description: 'Sociedade Empresária Limitada' },
  size: 'EPP',
  primaryCnae: { code: '6201-5/01', description: 'Desenvolvimento' },
  secondaryCnaes: [],
  registrationStatus: 'ATIVA',
  activityStartDate: '2019-03-11',
  uf: 'SP',
  ibgeMunicipality: '3550308',
  simples: { optedIn: true, since: '2019-03-11', excludedAt: null },
  mei: { optedIn: false, since: null, excludedAt: null },
  taxRegimeHistory: [],
  source: 'persona',
  fetchedAt: '2026-11-12T12:00:00.000Z',
};

describe('BrasilApiCnpj', () => {
  it('returns the sanitized company (no QSA) with fetchedAt from the clock', async () => {
    const fetch = scriptedFetch([{ status: 200, body: brasilApiBody }]);
    const r = await new BrasilApiCnpj({ now }).lookup(cnpj, live(fetch));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({
      cnpj,
      source: 'brasilapi',
      fetchedAt: '2026-11-17T12:00:00.000Z',
    });
    expect(JSON.stringify(r.value)).not.toContain('SOCIO');
    expect(fetch.calls).toEqual([`https://brasilapi.com.br/api/cnpj/v1/${NUMERIC_CNPJ}`]);
  });

  it('keeps the letters of an alphanumeric CNPJ in the URL', async () => {
    const fetch = scriptedFetch([{ status: 404 }]);
    await new BrasilApiCnpj().lookup(ALNUM_CNPJ as Cnpj, live(fetch));
    expect(fetch.calls[0]).toBe(`https://brasilapi.com.br/api/cnpj/v1/${ALNUM_CNPJ}`);
  });

  it('retries once on 500 and succeeds', async () => {
    const fetch = scriptedFetch([{ status: 500 }, { status: 200, body: brasilApiBody }]);
    const r = await new BrasilApiCnpj({ sleep: noSleep }).lookup(cnpj, live(fetch));
    expect(r.ok).toBe(true);
    expect(fetch.calls).toHaveLength(2);
  });

  it('gives up after one retry with UNAVAILABLE (recoverable)', async () => {
    const fetch = scriptedFetch([{ status: 503 }]);
    const r = await new BrasilApiCnpj({ sleep: noSleep }).lookup(cnpj, live(fetch));
    expect(r).toMatchObject({
      ok: false,
      error: { code: 'UNAVAILABLE', recoverable: true, source: 'brasilapi' },
    });
    expect(fetch.calls).toHaveLength(2);
  });

  it('times out with TIMEOUT', async () => {
    const fetch = scriptedFetch(['hang']);
    const r = await new BrasilApiCnpj({ timeoutMs: 10, retries: 0 }).lookup(cnpj, live(fetch));
    expect(r).toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
  });

  it('honours the caller signal', async () => {
    const fetch = scriptedFetch(['hang']);
    const controller = new AbortController();
    const pending = new BrasilApiCnpj({ timeoutMs: 5000 }).lookup(cnpj, {
      mode: 'live',
      fetch,
      signal: controller.signal,
    });
    controller.abort();
    const r = await pending;
    expect(r).toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
    expect(fetch.calls).toHaveLength(1);
  });

  it('429 with Retry-After → RATE_LIMITED with retryInMs, no retry', async () => {
    const fetch = scriptedFetch([{ status: 429, headers: { 'retry-after': '30' } }]);
    const r = await new BrasilApiCnpj({ sleep: noSleep }).lookup(cnpj, live(fetch));
    expect(r).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED', retryInMs: 30_000 } });
    expect(fetch.calls).toHaveLength(1);
  });

  it('Retry-After as an HTTP date, or unparseable, is handled', () => {
    expect(
      parseRetryAfter('Wed, 18 Nov 2026 12:01:00 GMT', Date.parse('2026-11-18T12:00:00Z')),
    ).toBe(60_000);
    expect(
      parseRetryAfter('Wed, 18 Nov 2026 11:00:00 GMT', Date.parse('2026-11-18T12:00:00Z')),
    ).toBe(0);
    expect(parseRetryAfter('soon', 0)).toBeUndefined();
    expect(parseRetryAfter(null, 0)).toBeUndefined();
  });

  it.each([
    [{ status: 404 }, 'NOT_FOUND'],
    [{ status: 400 }, 'INVALID'],
    [{ status: 403 }, 'UNAUTHORIZED'],
    [{ status: 302 }, 'UNEXPECTED_RESPONSE'],
    [{ status: 200, text: '<html>' }, 'UNEXPECTED_RESPONSE'],
    [{ status: 200, body: { cnpj: NUMERIC_CNPJ } }, 'UNEXPECTED_RESPONSE'],
  ] as const)('%o → %s', async (step, code) => {
    const r = await new BrasilApiCnpj({ sleep: noSleep }).lookup(cnpj, live(scriptedFetch([step])));
    expect(r).toMatchObject({ ok: false, error: { code } });
  });

  it('a network error becomes UNAVAILABLE, never an exception', async () => {
    const fetch = scriptedFetch(['network-error']);
    const r = await new BrasilApiCnpj({ sleep: noSleep }).lookup(cnpj, live(fetch));
    expect(r).toMatchObject({ ok: false, error: { code: 'UNAVAILABLE' } });
  });

  it('refuses to call the network in replay mode', async () => {
    const fetch = scriptedFetch([{ status: 200, body: brasilApiBody }]);
    const r = await new BrasilApiCnpj().lookup(cnpj, { mode: 'replay', fetch });
    expect(r).toMatchObject({ ok: false, error: { code: 'NOT_CONFIGURED' } });
    expect(fetch.calls).toHaveLength(0);
  });
});

describe('CnpjWsCnpj', () => {
  it('returns the sanitized company and does not retry', async () => {
    const ok = scriptedFetch([{ status: 200, body: cnpjWsBody }]);
    const r = await new CnpjWsCnpj({ now }).lookup(cnpj, live(ok));
    expect(r.ok && r.value.source).toBe('cnpjws');
    expect(ok.calls).toEqual([`https://publica.cnpj.ws/cnpj/${NUMERIC_CNPJ}`]);
    const down = scriptedFetch([{ status: 500 }]);
    await new CnpjWsCnpj().lookup(cnpj, live(down));
    expect(down.calls).toHaveLength(1);
  });
});

function fixedProvider(result: Awaited<ReturnType<CnpjProvider['lookup']>>): CnpjProvider & {
  calls: number;
} {
  const p = {
    calls: 0,
    async lookup() {
      p.calls++;
      return result;
    },
  };
  return p;
}

const failing = (
  code: 'UNAVAILABLE' | 'NOT_FOUND' | 'RATE_LIMITED',
  source: string,
  retryInMs?: number,
) =>
  fixedProvider({
    ok: false,
    error: {
      code,
      message: 'x',
      recoverable: code !== 'NOT_FOUND',
      source,
      ...(retryInMs ? { retryInMs } : {}),
    },
  });

describe('ChainedCnpj (ARCHITECTURE §4.3 and §12)', () => {
  it('BrasilAPI 500 then 500 → CNPJ.ws answers, and the cache is written', async () => {
    const set = vi.fn(async () => {});
    const cache: ExternalCachePort = { get: async () => null, set };
    const brasil = new BrasilApiCnpj({ sleep: noSleep });
    const ws = new CnpjWsCnpj({ now });
    const fetch = scriptedFetch([
      { status: 500 },
      { status: 500 },
      { status: 200, body: cnpjWsBody },
    ]);
    const log = vi.fn();
    const r = await new ChainedCnpj({ live: [brasil, ws], cache }).lookup(cnpj, {
      mode: 'live',
      fetch,
      log,
    });
    expect(r.ok && r.value.source).toBe('cnpjws');
    expect(fetch.calls.map((u) => new URL(u).host)).toEqual([
      'brasilapi.com.br',
      'brasilapi.com.br',
      'publica.cnpj.ws',
    ]);
    expect(set).toHaveBeenCalledWith(
      'cnpj',
      cnpj,
      expect.objectContaining({ source: 'cnpjws' }),
      '2026-11-17T12:00:00.000Z',
    );
    expect(log).toHaveBeenCalledWith('provider.failure', {
      source: 'brasilapi',
      code: 'UNAVAILABLE',
    });
    for (const call of log.mock.calls) expect(JSON.stringify(call)).not.toContain(NUMERIC_CNPJ);
  });

  it('every live source down → expired cache entry is served (fetchedAt kept for "dados de até N dias")', async () => {
    const old = {
      ...persona,
      cnpj,
      source: 'brasilapi' as const,
      fetchedAt: '2026-10-01T00:00:00.000Z',
    };
    const cache: ExternalCachePort = {
      get: async () => ({
        payload: old,
        fetchedAt: old.fetchedAt,
        expiresAt: '2026-10-08T00:00:00.000Z',
      }),
    };
    const r = await new ChainedCnpj({
      live: [failing('UNAVAILABLE', 'brasilapi'), failing('RATE_LIMITED', 'cnpjws')],
      cache,
    }).lookup(cnpj, { mode: 'live' });
    expect(r).toEqual({ ok: true, value: old });
  });

  it('a cached payload outside the whitelist shape is ignored', async () => {
    const cache: ExternalCachePort = {
      get: async () => ({ payload: { ...persona, qsa: [] }, fetchedAt: '', expiresAt: '' }),
    };
    const r = await new ChainedCnpj({ live: [failing('UNAVAILABLE', 'brasilapi')], cache }).lookup(
      cnpj,
      { mode: 'live' },
    );
    expect(r).toMatchObject({ ok: false, error: { code: 'UNAVAILABLE' } });
  });

  it('a throwing cache never breaks the chain; a persona CNPJ falls back to replay', async () => {
    const cache: ExternalCachePort = {
      get: async () => {
        throw new Error('db down');
      },
      set: async () => {
        throw new Error('db down');
      },
    };
    const replay = new ReplayCnpj({ fixtures: [], companies: [persona] });
    const r = await new ChainedCnpj({
      live: [failing('NOT_FOUND', 'brasilapi'), failing('NOT_FOUND', 'cnpjws')],
      cache,
      replay,
    }).lookup(persona.cnpj, { mode: 'live' });
    expect(r).toEqual({ ok: true, value: persona });
  });

  it('every live source says 404 and nothing else has it → NOT_FOUND', async () => {
    const r = await new ChainedCnpj({
      live: [failing('NOT_FOUND', 'brasilapi'), failing('NOT_FOUND', 'cnpjws')],
      replay: new ReplayCnpj({ fixtures: [] }),
    }).lookup(cnpj, { mode: 'live' });
    expect(r).toMatchObject({ ok: false, error: { code: 'NOT_FOUND', recoverable: false } });
  });

  it('otherwise → UNAVAILABLE with the longest Retry-After and the Portuguese message', async () => {
    const r = await new ChainedCnpj({
      live: [failing('UNAVAILABLE', 'brasilapi'), failing('RATE_LIMITED', 'cnpjws', 60_000)],
    }).lookup(cnpj, { mode: 'live' });
    expect(r).toMatchObject({
      ok: false,
      error: {
        code: 'UNAVAILABLE',
        retryInMs: 60_000,
        message: 'Dados públicos indisponíveis agora; tente em instantes.',
      },
    });
  });

  it('in replay mode only the replay provider is used', async () => {
    const brasil = failing('UNAVAILABLE', 'brasilapi');
    const chain = new ChainedCnpj({
      live: [brasil],
      replay: new ReplayCnpj({ companies: [persona], fixtures: [] }),
    });
    expect(await chain.lookup(persona.cnpj, { mode: 'replay' })).toEqual({
      ok: true,
      value: persona,
    });
    expect(brasil.calls).toBe(0);
    const bare = await new ChainedCnpj({ live: [brasil] }).lookup(cnpj, { mode: 'replay' });
    expect(bare).toMatchObject({ ok: false, error: { code: 'FIXTURE_MISSING' } });
  });
});

describe('ReplayCnpj', () => {
  const recorded = { ...persona, cnpj, source: 'brasilapi' as const };
  const envelope = createEnvelope({
    source: 'brasilapi.cnpj',
    key: cnpj,
    origin: 'live',
    recordedAt: '2026-11-17T12:00:00.000Z',
    recordedBy: 'test',
    sanitization: { whitelist: 'cnpj@1', discardedFields: ['qsa'], replacedDocuments: 0 },
    data: recorded,
  });

  it('reads persona companies and recorded fixtures', async () => {
    const replay = new ReplayCnpj({ fixtures: [envelope], companies: [persona] });
    expect(await replay.lookup(persona.cnpj, { mode: 'replay' })).toEqual({
      ok: true,
      value: persona,
    });
    expect(await replay.lookup(cnpj, { mode: 'replay' })).toEqual({ ok: true, value: recorded });
  });

  it('missing fixture → FIXTURE_MISSING (not recoverable)', async () => {
    const r = await new ReplayCnpj({ fixtures: [envelope] }).lookup(ALNUM_CNPJ as Cnpj, {
      mode: 'replay',
    });
    expect(r).toMatchObject({ ok: false, error: { code: 'FIXTURE_MISSING', recoverable: false } });
  });

  it('a fixture edited without rehash or outside the shape is refused', async () => {
    const tampered = { ...envelope, data: { ...recorded, displayLegalName: 'EDITED' } };
    const r = await new ReplayCnpj({ fixtures: [tampered] }).lookup(cnpj, { mode: 'replay' });
    expect(r).toMatchObject({ ok: false, error: { code: 'UNEXPECTED_RESPONSE' } });
    const wrongShape = createEnvelope({ ...envelope, data: { cnpj } });
    const r2 = await new ReplayCnpj({ fixtures: [wrongShape] }).lookup(cnpj, { mode: 'replay' });
    expect(r2).toMatchObject({ ok: false, error: { code: 'UNEXPECTED_RESPONSE' } });
  });

  it('defaults to the generated index', async () => {
    const r = await new ReplayCnpj().lookup(ALNUM_CNPJ as Cnpj, { mode: 'replay' });
    expect(r).toMatchObject({ ok: false, error: { code: 'FIXTURE_MISSING' } });
  });
});
