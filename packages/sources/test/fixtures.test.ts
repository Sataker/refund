import { describe, expect, it } from 'vitest';
import { FIXTURES } from '../fixtures/index.ts';
import { markSanitized } from '../src/fixtures/sanitization.ts';
import {
  type CivilDate,
  type Cnpj,
  type CnpjProvider,
  createEnvelope,
  dataSha256,
  detectPii,
  type FinancialProvider,
  fixtureKey,
  recording,
  type SeriesProvider,
  type SourceTransaction,
  sanitizeBrasilApiCompany,
  sanitizePluggyTransaction,
  stableStringify,
  verifyEnvelope,
} from '../src/index.ts';
import { CPF, formatCpf, NUMERIC_CNPJ, PERSONAL_EMAIL } from './helpers.ts';

describe('committed fixtures (integrity, ARCHITECTURE §5.2)', () => {
  it('there is at least the hero Selic fixture', () => {
    expect(FIXTURES.length).toBeGreaterThan(0);
  });

  it.each(FIXTURES.map((f) => [(f as { key: string }).key, f]))(
    '%s: valid envelope, hash matches, no personal data',
    (_key, fixture) => {
      const r = verifyEnvelope(fixture);
      expect(r.ok).toBe(true);
      if (r.ok) expect(detectPii(r.value.data)).toEqual([]);
    },
  );

  it('the hero Selic fixture is synthetic and at 15,00% (ENGINE-SPEC F.2)', () => {
    const selic = FIXTURES.find((f) => (f as { key: string }).key === '432-2025-11-01-2026-11-12');
    expect(selic).toMatchObject({ source: 'sgs.series', origin: 'synthetic' });
    const data = (selic as { data: { value: string }[] }).data;
    expect(new Set(data.map((p) => p.value))).toEqual(new Set(['15.00']));
  });
});

describe('envelope helpers', () => {
  it('stableStringify sorts keys at every depth and drops undefined', () => {
    expect(stableStringify({ b: 1, a: { d: [2, { f: 1, e: undefined }], c: null } })).toBe(
      '{"a":{"c":null,"d":[2,{"f":1}]},"b":1}',
    );
    expect(dataSha256({ a: 1, b: 2 })).toBe(dataSha256({ b: 2, a: 1 }));
  });

  it('verifyEnvelope rejects wrong format and wrong hash', () => {
    const env = createEnvelope({
      source: 'sgs.series',
      key: 'k',
      origin: 'synthetic',
      recordedAt: 'x',
      recordedBy: 'y',
      sanitization: { whitelist: 'sgs@1', discardedFields: [], replacedDocuments: 0 },
      data: [1],
    });
    expect(verifyEnvelope(env).ok).toBe(true);
    expect(verifyEnvelope({ ...env, data: [2] })).toMatchObject({
      ok: false,
      error: { code: 'UNEXPECTED_RESPONSE' },
    });
    expect(verifyEnvelope({ ...env, $format: 'v0' }).ok).toBe(false);
    expect(verifyEnvelope({ ...env, extra: 1 }).ok).toBe(false);
  });
});

describe('recorder', () => {
  const cnpj = NUMERIC_CNPJ as Cnpj;
  const raw = {
    cnpj: NUMERIC_CNPJ,
    razao_social: 'ACME LTDA',
    codigo_natureza_juridica: 2062,
    cnae_fiscal: 6201501,
    data_inicio_atividade: '2019-03-11',
    qsa: [{ nome_socio: 'SOCIO FICTICIO' }],
    email: PERSONAL_EMAIL,
  };

  function sink() {
    const files: Record<string, string> = {};
    const write = (path: string, content: string): void => {
      files[path] = content;
    };
    return { files, write };
  }

  it('records only the sanitized object, inside the §5.2 envelope', async () => {
    const { files, write } = sink();
    const provider: CnpjProvider = {
      lookup: async (c) => sanitizeBrasilApiCompany(raw, c, '2026-11-17T12:00:00.000Z'),
    };
    const recorded: string[] = [];
    const wrapped = recording(
      provider,
      { dir: 'fx/cnpj', source: 'brasilapi.cnpj' },
      {
        write,
        recordedBy: 'test@abc',
        now: () => new Date('2026-11-17T12:00:00Z'),
        onRecorded: (p) => recorded.push(p),
      },
    );
    const r = await wrapped.lookup(cnpj, { mode: 'live' });
    expect(r.ok).toBe(true);
    expect(recorded).toEqual([`fx/cnpj/${NUMERIC_CNPJ}.json`]);
    const text = files[`fx/cnpj/${NUMERIC_CNPJ}.json`] ?? '';
    const envelope = JSON.parse(text);
    expect(envelope).toMatchObject({
      $format: 'refund.fixture/v1',
      source: 'brasilapi.cnpj',
      key: NUMERIC_CNPJ,
      origin: 'live',
      recordedAt: '2026-11-17T12:00:00.000Z',
      recordedBy: 'test@abc',
      sanitization: { whitelist: 'cnpj@1', replacedDocuments: 0 },
    });
    expect(envelope.sanitization.discardedFields).toEqual(['email', 'qsa']);
    expect(verifyEnvelope(envelope).ok).toBe(true);
    expect(text).not.toContain('SOCIO');
    expect(text).not.toContain('"qsa":');
  });

  it('refuses an object that did not go through a whitelist (no raw response is ever written)', async () => {
    const { files, write } = sink();
    const rawProvider = { lookup: async () => ({ ok: true as const, value: raw }) };
    const r = await recording(
      rawProvider,
      { dir: 'fx', source: 'brasilapi.cnpj' },
      { write },
    ).lookup();
    expect(r).toMatchObject({
      ok: false,
      error: { code: 'UNEXPECTED_RESPONSE', source: 'recorder' },
    });
    expect(files).toEqual({});
  });

  it('refuses when detectPii finds anything, even in a "sanitized" object', async () => {
    const { files, write } = sink();
    const leaky = markSanitized(
      { note: `cliente ${formatCpf(CPF)}` },
      { whitelist: 'cnpj@1', discardedFields: [], replacedDocuments: 0 },
    );
    const provider = { lookup: async () => ({ ok: true as const, value: leaky }) };
    const r = await recording(
      provider,
      { dir: 'fx', source: 'brasilapi.cnpj' },
      { write },
    ).lookup();
    expect(r).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('formatted-cpf') },
    });
    expect(files).toEqual({});
  });

  it('does not record failures and passes non-function members through', async () => {
    const { files, write } = sink();
    const provider = {
      label: 'x',
      sync: () => 1,
      lookup: async () => ({
        ok: false as const,
        error: {
          code: 'NOT_FOUND' as const,
          message: 'x',
          recoverable: false,
          source: 'brasilapi',
        },
      }),
    };
    const wrapped = recording(provider, { dir: 'fx', source: 'brasilapi.cnpj' }, { write });
    expect(wrapped.label).toBe('x');
    expect(wrapped.sync()).toBe(1);
    expect((await wrapped.lookup()).ok).toBe(false);
    expect(files).toEqual({});
  });

  it('records a series under <code>-<from>-<to>', async () => {
    const { files, write } = sink();
    const sgs: SeriesProvider = {
      series: async () => ({
        ok: true,
        value: markSanitized([{ date: '2026-11-12' as CivilDate, value: '13.75' }], {
          whitelist: 'sgs@1',
          discardedFields: [],
          replacedDocuments: 0,
        }),
      }),
    };
    await recording(sgs, { dir: 'fx/sgs', source: 'sgs.series' }, { write }).series(
      432,
      { from: '2026-11-01' as CivilDate, to: '2026-11-12' as CivilDate },
      { mode: 'live' },
    );
    expect(Object.keys(files)).toEqual(['fx/sgs/432-2026-11-01-2026-11-12.json']);
  });

  it('records a paged transaction listing once, with every page, when the whole listing succeeded', async () => {
    const { files, write } = sink();
    const tx = (id: string) => {
      const r = sanitizePluggyTransaction(
        {
          id,
          accountId: 'acc',
          date: '2026-10-01',
          amount: -1,
          type: 'DEBIT',
          description: 'TARIFA',
        },
        { pepper: null },
      );
      if (!r.ok) throw new Error('fixture');
      return r.value;
    };
    const pages = (fail: boolean): FinancialProvider['listTransactions'] =>
      async function* () {
        yield { ok: true, value: [tx('a'), tx('b')] };
        if (fail)
          yield {
            ok: false,
            error: { code: 'TIMEOUT', message: 'x', recoverable: true, source: 'pluggy' },
          };
        else yield { ok: true, value: [tx('c')] };
      };
    const period = { from: '2026-01-01' as CivilDate, to: '2026-12-31' as CivilDate };
    const ok = recording(
      { listTransactions: pages(false) },
      { dir: 'fx', source: 'pluggy.transactions' },
      { write },
    );
    const seen: string[] = [];
    for await (const p of ok.listTransactions('acc', period, { mode: 'live' })) {
      if (p.ok) seen.push(...p.value.map((t: SourceTransaction) => t.sourceId));
    }
    expect(seen).toEqual(['a', 'b', 'c']);
    const envelope = JSON.parse(files['fx/acc-2026-01-01-2026-12-31.json'] ?? '{}');
    expect(envelope.data.map((t: SourceTransaction) => t.sourceId)).toEqual(['a', 'b', 'c']);

    const failing = recording(
      { listTransactions: pages(true) },
      { dir: 'fy', source: 'pluggy.transactions' },
      { write },
    );
    for await (const _ of failing.listTransactions('acc', period, { mode: 'live' })) {
      // drain
    }
    expect(Object.keys(files).some((k) => k.startsWith('fy/'))).toBe(false);
  });

  it('refuses a paged listing with personal data and yields the refusal', async () => {
    const { files, write } = sink();
    const leaky = markSanitized(
      { note: PERSONAL_EMAIL },
      { whitelist: 'pluggy@1', discardedFields: [], replacedDocuments: 0 },
    );
    const provider = {
      async *listTransactions() {
        yield { ok: true as const, value: [leaky] };
      },
    };
    const out: unknown[] = [];
    for await (const p of recording(
      provider,
      { dir: 'fx', source: 'pluggy.transactions' },
      { write },
    ).listTransactions()) {
      out.push(p);
    }
    expect(out).toHaveLength(2);
    expect(out[1]).toMatchObject({ ok: false, error: { source: 'recorder' } });
    expect(files).toEqual({});
  });

  it('fixtureKey ignores the context and sanitizes the file name', () => {
    expect(fixtureKey(['RFDEV001000158', { mode: 'live' }])).toBe('RFDEV001000158');
    expect(fixtureKey([432, { from: '2026-01-01', to: '2026-01-31' }, { mode: 'live' }])).toBe(
      '432-2026-01-01-2026-01-31',
    );
    expect(fixtureKey(['a/b c', null, {}])).toBe('a_b_c');
  });
});
