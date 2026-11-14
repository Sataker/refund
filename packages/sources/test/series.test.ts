import { describe, expect, it, vi } from 'vitest';
import {
  ChainedSeries,
  type CivilDate,
  createEnvelope,
  type ExternalCachePort,
  ReplaySeries,
  SgsSeries,
  sanitizeSgsPoints,
  seriesKey,
  sgsWindows,
} from '../src/index.ts';
import { scriptedFetch } from './helpers.ts';

const d = (s: string) => s as CivilDate;
const live = (fetch: typeof globalThis.fetch) => ({ mode: 'live' as const, fetch });

describe('SGS windows (10-year limit, research 03 §2.6)', () => {
  it('keeps a short period in one block and splits a long one', () => {
    expect(sgsWindows({ from: d('2026-11-01'), to: d('2026-11-12') })).toEqual([
      { from: '2026-11-01', to: '2026-11-12' },
    ]);
    expect(sgsWindows({ from: d('2010-01-01'), to: d('2026-06-30') })).toEqual([
      { from: '2010-01-01', to: '2019-12-31' },
      { from: '2020-01-01', to: '2026-06-30' },
    ]);
  });

  it('rejects inverted or impossible dates', () => {
    expect(sgsWindows({ from: d('2026-11-12'), to: d('2026-11-01') })).toBeNull();
    expect(sgsWindows({ from: d('2026-02-30'), to: d('2026-03-01') })).toBeNull();
  });
});

describe('sgs@1 whitelist', () => {
  it('keeps only {data, valor} as {date, value}', () => {
    expect(sanitizeSgsPoints([{ data: '12/11/2026', valor: '13.75', extra: 'x' }])).toEqual({
      ok: true,
      value: [{ date: '2026-11-12', value: '13.75' }],
    });
  });

  it.each([
    [{}],
    [[{ data: '2026-11-12', valor: '1' }]],
    [[{ data: '12/11/2026', valor: '13,75' }]],
  ])('%j → UNEXPECTED_RESPONSE', (raw) => {
    expect(sanitizeSgsPoints(raw)).toMatchObject({
      ok: false,
      error: { code: 'UNEXPECTED_RESPONSE' },
    });
  });
});

describe('SgsSeries', () => {
  it('queries with dataInicial/dataFinal in dd/mm/aaaa and returns the points', async () => {
    const fetch = scriptedFetch([{ status: 200, body: [{ data: '12/11/2026', valor: '13.75' }] }]);
    const r = await new SgsSeries().series(
      432,
      { from: d('2026-11-01'), to: d('2026-11-12') },
      live(fetch),
    );
    expect(r).toEqual({ ok: true, value: [{ date: '2026-11-12', value: '13.75' }] });
    expect(fetch.calls).toEqual([
      'https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados?formato=json&dataInicial=01/11/2026&dataFinal=12/11/2026',
    ]);
  });

  it('queries each 10-year block; a block without data (404) is skipped', async () => {
    const fetch = scriptedFetch([
      { status: 404 },
      { status: 200, body: [{ data: '02/01/2020', valor: '4.5' }] },
    ]);
    const r = await new SgsSeries().series(
      11,
      { from: d('2010-01-01'), to: d('2020-01-02') },
      live(fetch),
    );
    expect(r).toEqual({ ok: true, value: [{ date: '2020-01-02', value: '4.5' }] });
    expect(fetch.calls).toHaveLength(2);
  });

  it('no data at all → NOT_FOUND; bad period → INVALID; outage → typed error; replay → no call', async () => {
    const period = { from: d('2026-11-01'), to: d('2026-11-12') };
    expect(
      await new SgsSeries().series(433, period, live(scriptedFetch([{ status: 200, body: [] }]))),
    ).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
    expect(
      await new SgsSeries().series(433, { from: d('x'), to: d('y') }, live(scriptedFetch([]))),
    ).toMatchObject({ ok: false, error: { code: 'INVALID' } });
    expect(
      await new SgsSeries().series(4389, period, live(scriptedFetch([{ status: 500 }]))),
    ).toMatchObject({
      ok: false,
      error: { code: 'UNAVAILABLE', source: 'sgs' },
    });
    expect(
      await new SgsSeries({ timeoutMs: 10 }).series(432, period, live(scriptedFetch(['hang']))),
    ).toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
    expect(
      await new SgsSeries().series(
        432,
        period,
        live(scriptedFetch([{ status: 200, body: { x: 1 } }])),
      ),
    ).toMatchObject({ ok: false, error: { code: 'UNEXPECTED_RESPONSE' } });
    const fetch = scriptedFetch([]);
    expect(await new SgsSeries().series(432, period, { mode: 'replay', fetch })).toMatchObject({
      ok: false,
      error: { code: 'NOT_CONFIGURED' },
    });
    expect(fetch.calls).toHaveLength(0);
  });
});

describe('ReplaySeries', () => {
  it("serves the hero's Selic fixture: 15,00% (ENGINE-SPEC F.2)", async () => {
    const r = await new ReplaySeries().series(
      432,
      { from: d('2026-11-12'), to: d('2026-11-12') },
      { mode: 'replay' },
    );
    expect(r).toEqual({ ok: true, value: [{ date: '2026-11-12', value: '15.00' }] });
  });

  it('filters a covering fixture to the requested period', async () => {
    const r = await new ReplaySeries().series(
      432,
      { from: d('2026-10-30'), to: d('2026-11-02') },
      { mode: 'replay' },
    );
    expect(r.ok && r.value.map((p) => p.date)).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
  });

  it('an uncovered period or another code → FIXTURE_MISSING', async () => {
    const replay = new ReplaySeries();
    for (const [code, from, to] of [
      [432, '2026-11-01', '2026-11-13'],
      [432, '2025-10-31', '2025-11-02'],
      [11, '2026-11-12', '2026-11-12'],
    ] as const) {
      expect(
        await replay.series(code, { from: d(from), to: d(to) }, { mode: 'replay' }),
      ).toMatchObject({
        ok: false,
        error: { code: 'FIXTURE_MISSING', recoverable: false },
      });
    }
  });

  it('a tampered or malformed fixture is refused', async () => {
    const env = createEnvelope({
      source: 'sgs.series',
      key: seriesKey(11, { from: d('2026-01-01'), to: d('2026-01-31') }),
      origin: 'live',
      recordedAt: 'x',
      recordedBy: 'test',
      sanitization: { whitelist: 'sgs@1', discardedFields: [], replacedDocuments: 0 },
      data: [{ date: '2026-01-02', value: '0.05' }],
    });
    const period = { from: d('2026-01-01'), to: d('2026-01-31') };
    const tampered = { ...env, data: [{ date: '2026-01-02', value: '9.99' }] };
    expect(
      await new ReplaySeries({ fixtures: [tampered] }).series(11, period, { mode: 'replay' }),
    ).toMatchObject({
      ok: false,
      error: { code: 'UNEXPECTED_RESPONSE' },
    });
    const malformed = createEnvelope({ ...env, data: [{ date: '2026-01-02', value: 'x' }] });
    expect(
      await new ReplaySeries({ fixtures: [malformed, null, { key: 1 }] }).series(11, period, {
        mode: 'replay',
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'UNEXPECTED_RESPONSE' },
    });
  });
});

describe('ChainedSeries: SGS → external_cache → fixture', () => {
  const period = { from: d('2026-11-12'), to: d('2026-11-12') };
  const points = [{ date: d('2026-11-12'), value: '13.75' }];

  it('writes the live answer to the cache', async () => {
    const set = vi.fn(async () => {});
    const r = await new ChainedSeries({
      live: { series: async () => ({ ok: true, value: points }) },
      cache: { get: async () => null, set },
      now: () => new Date('2026-11-17T12:00:00Z'),
    }).series(432, period, { mode: 'live' });
    expect(r).toEqual({ ok: true, value: points });
    expect(set).toHaveBeenCalledWith(
      'sgs',
      '432-2026-11-12-2026-11-12',
      points,
      '2026-11-17T12:00:00.000Z',
    );
  });

  const down = {
    series: async () =>
      ({
        ok: false,
        error: { code: 'TIMEOUT', message: 'x', recoverable: true, source: 'sgs' },
      }) as const,
  };

  it('SGS down → cached value; cache down too → fixture; nothing → the SGS error', async () => {
    const cache: ExternalCachePort = {
      get: async () => ({ payload: points, fetchedAt: '', expiresAt: '' }),
    };
    expect(
      await new ChainedSeries({ live: down, cache }).series(432, period, { mode: 'live' }),
    ).toEqual({
      ok: true,
      value: points,
    });
    const broken: ExternalCachePort = {
      get: async () => {
        throw new Error('db');
      },
      set: async () => {
        throw new Error('db');
      },
    };
    const log = vi.fn();
    const recordedLive = createEnvelope({
      source: 'sgs.series',
      key: '432-2026-11-01-2026-11-30',
      origin: 'live',
      recordedAt: '2026-11-17T12:00:00Z',
      recordedBy: 'test',
      sanitization: { whitelist: 'sgs@1', discardedFields: [], replacedDocuments: 0 },
      data: [{ date: '2026-11-12', value: '13.75' }],
    });
    const fromFixture = await new ChainedSeries({
      live: down,
      cache: broken,
      replay: new ReplaySeries({ fixtures: [recordedLive] }),
    }).series(432, period, { mode: 'live', log });
    expect(fromFixture).toEqual({ ok: true, value: [{ date: '2026-11-12', value: '13.75' }] });
    expect(log).toHaveBeenCalledWith('provider.failure', { source: 'sgs', code: 'TIMEOUT' });
    // Code review 14/11 (LOW): in live mode a synthetic fixture (the hero's 15,00%) is never served.
    const onlySynthetic = await new ChainedSeries({
      live: down,
      replay: new ReplaySeries(),
    }).series(432, period, { mode: 'live' });
    expect(onlySynthetic).toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
    expect(
      await new ChainedSeries({ live: down }).series(432, period, { mode: 'live' }),
    ).toMatchObject({
      ok: false,
      error: { code: 'TIMEOUT' },
    });
    const writeFails = await new ChainedSeries({
      live: { series: async () => ({ ok: true, value: points }) },
      cache: broken,
    }).series(432, period, { mode: 'live' });
    expect(writeFails.ok).toBe(true);
  });

  it('replay mode uses only the fixture', async () => {
    expect(
      await new ChainedSeries({ live: down, replay: new ReplaySeries() }).series(432, period, {
        mode: 'replay',
      }),
    ).toMatchObject({
      ok: true,
    });
    expect(
      await new ChainedSeries({ live: down }).series(432, period, { mode: 'replay' }),
    ).toMatchObject({
      ok: false,
      error: { code: 'FIXTURE_MISSING' },
    });
  });
});
