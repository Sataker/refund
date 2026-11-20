import { describe, expect, it } from 'vitest';
import {
  BrasilApiCnpj,
  ChainedCnpj,
  type CivilDate,
  CNPJ_SOURCES,
  CnpjWsCnpj,
  detectPii,
  LiveCnpj,
  publicCompanySchema,
  SgsSeries,
  sanitizationOf,
  validateCnpj,
} from '../../src/index.ts';

// Live contract (TESTS §3.2): calls the internet, so the `unit` project only runs it with LIVE=1
// (`LIVE=1 pnpm vitest run --project unit live`). Never in CI. Writes nothing to disk; it only checks
// that the real schema still goes through the whitelist before fixtures are recorded.
// Company: Banco do Brasil S.A., a listed company whose registry data is public.

const bb = validateCnpj('00.000.000/0001-91');
if (!bb.ok) throw new Error('control CNPJ');
const ctx = { mode: 'live' as const };

describe('live contract: CNPJ providers', () => {
  it('BrasilAPI → whitelisted company, no QSA or contact data', { timeout: 15_000 }, async () => {
    const r = await new BrasilApiCnpj().lookup(bb.value, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(publicCompanySchema.safeParse(r.value).success).toBe(true);
    expect(r.value).toMatchObject({
      cnpj: bb.value,
      masked: false,
      size: 'OTHER',
      source: 'brasilapi',
    });
    // Research 03 §2.1 gotcha: non-optant with equal opt-in/exclusion dates.
    expect(r.value.simples).toEqual({ optedIn: false, since: null, excludedAt: null });
    expect(sanitizationOf(r.value)?.discardedFields).toEqual(
      expect.arrayContaining(['qsa', 'email']),
    );
    expect(detectPii(r.value)).toEqual([]);
  });

  it('CNPJ.ws → same whitelist (3 requests/min per IP)', { timeout: 15_000 }, async () => {
    const r = await new CnpjWsCnpj().lookup(bb.value, ctx);
    if (!r.ok && r.error.code === 'RATE_LIMITED') return;
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(publicCompanySchema.safeParse(r.value).success).toBe(true);
    expect(sanitizationOf(r.value)?.discardedFields).toContain('socios');
    expect(detectPii(r.value)).toEqual([]);
  });
});

// E21: every one of the six public sources, then the chain itself. The 3/min sources may answer 429.
describe('live contract: the six CNPJ sources (E21)', () => {
  it.each(CNPJ_SOURCES.map((s) => [s.source, s] as const))(
    '%s → whitelisted company, no QSA or contact data',
    { timeout: 15_000 },
    async (source, spec) => {
      const r = await new LiveCnpj(spec, { timeoutMs: 10_000 }).lookup(bb.value, ctx);
      if (!r.ok && r.error.code === 'RATE_LIMITED') return;
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value).toMatchObject({ cnpj: bb.value, source, size: 'OTHER', uf: 'DF' });
      expect(r.value.primaryCnae.code).toBe('6422-1/00');
      expect(detectPii(r.value)).toEqual([]);
    },
  );

  it('the chain answers with BrasilAPI left out', { timeout: 30_000 }, async () => {
    const chain = new ChainedCnpj({
      live: CNPJ_SOURCES.map((s) => new LiveCnpj(s)),
      skip: ['brasilapi'],
    });
    const r = await chain.lookup(bb.value, ctx);
    expect(r.ok && r.value.source).not.toBe('brasilapi');
  });
});

describe('live contract: BCB SGS', () => {
  it('series 432 (Selic target) returns decimal strings', { timeout: 15_000 }, async () => {
    const r = await new SgsSeries().series(
      432,
      { from: '2026-11-01' as CivilDate, to: '2026-11-12' as CivilDate },
      ctx,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.length).toBeGreaterThan(0);
    for (const p of r.value) {
      expect(p.date).toMatch(/^2026-11-\d{2}$/);
      expect(p.value).toMatch(/^\d+\.\d+$/);
    }
  });
});
