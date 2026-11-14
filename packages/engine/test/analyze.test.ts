// Boundary of analyze()/recalculate(): Result with stable codes, never an exception (CLAUDE.md; EXECUTION §9, E5),
// assumption validation (ARCHITECTURE §4.2: unknown key = validation error) and the hashes (INV-6).
import { describe, expect, it } from 'vitest';
import { analyze, recalculate, rulesByRef } from '../src/analyze.ts';
import { resolveAssumptions } from '../src/assumptions.ts';
import { addYears, isBusinessDay, nextBusinessDay } from '../src/calendar.ts';
import { EngineError, toDomainError } from '../src/errors.ts';
import { canonicalJson, sha256Hex } from '../src/hash.ts';
import { brl } from '../src/money.ts';
import { paramOrNull } from '../src/parameters/index.ts';
import { formatBrl } from '../src/rules/common.ts';
import type { Facts } from '../src/types.ts';
import { constant, heroFacts, syntheticFacts } from './golden/fixtures/facts.ts';

const assumption = (value: unknown): Facts['assumptions'][string] => ({
  value: value as Facts['assumptions'][string]['value'],
  origin: 'user',
  editable: true,
  source: 'test',
});

const codeOf = (f: Facts, options?: { parameters?: string }) => {
  const r = analyze(f, options);
  return r.ok ? 'OK' : r.error.code;
};

describe('analyze() errors cross the boundary as Result', () => {
  it('RBT12 above the Simples ceiling → RBT12_ABOVE_CEILING', () => {
    const r = analyze(syntheticFacts({ domestic: constant(brl('450.000,00')) }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('RBT12_ABOVE_CEILING');
      expect(r.error.message).toContain('teto do Simples');
      expect(r.error.recoverable).toBe(false);
    }
  });

  it('Anexo without a table (II/IV) → ANEXO_WITHOUT_TABLE', () => {
    const f = syntheticFacts({ domestic: constant(brl('10.000,00')), subjectToFatorR: false });
    f.companyDetails.value.baseAnexo = 'IV';
    expect(codeOf(f)).toBe('ANEXO_WITHOUT_TABLE');
  });

  it('a month without parameters in force → PARAMETER_NOT_IN_FORCE', () => {
    expect(codeOf(syntheticFacts({ assumptions: { start: assumption('2017-01') } }))).toBe(
      'PARAMETER_NOT_IN_FORCE',
    );
  });

  it('a company in its start of activity fails closed → START_OF_ACTIVITY_NOT_SUPPORTED', () => {
    const f = syntheticFacts({ openedOn: '2026-05-04', domestic: constant(brl('10.000,00')) });
    expect(codeOf(f)).toBe('START_OF_ACTIVITY_NOT_SUPPORTED');
  });

  it('unknown and invalid assumptions → UNKNOWN_ASSUMPTION / INVALID_ASSUMPTION', () => {
    expect(codeOf(syntheticFacts({ assumptions: { foo: assumption(1) } }))).toBe(
      'UNKNOWN_ASSUMPTION',
    );
    const invalid: [string, unknown][] = [
      ['fatorRMargin', '1,5'],
      ['fatorRMargin', true],
      ['start', '2026-13'],
      ['start', 12],
      ['horizonMonths', 24],
      ['revenueProjection', 'last'],
      ['payrollProjection', 'avg'],
      ['r01Threshold', null],
      ['r01Threshold', { absoluteMinimum: -1, rbt12Percentage: '0.01' }],
    ];
    for (const [key, value] of invalid) {
      const f = syntheticFacts({ assumptions: { [key]: assumption(value) } });
      expect(codeOf(f), `${key}=${JSON.stringify(value)}`).toBe('INVALID_ASSUMPTION');
    }
  });

  it('unknown parameter set → UNKNOWN_PARAMETER_SET; malformed facts → ENGINE_INTERNAL_ERROR', () => {
    expect(codeOf(syntheticFacts(), { parameters: 'law-changed-2027' })).toBe(
      'UNKNOWN_PARAMETER_SET',
    );
    const f = syntheticFacts();
    f.company.value.openedOn = '2019-02-30';
    expect(codeOf(f)).toBe('ENGINE_INTERNAL_ERROR');
    expect(toDomainError('x').detail).toEqual({ reason: 'x' });
    expect(toDomainError(new EngineError('INVALID_FACTS', 'm')).detail).toBeUndefined();
  });
});

describe('assumptions (C.2)', () => {
  it('defaults: start = month after the analysis, margin 1 p.p., refund June of next year', () => {
    const a = resolveAssumptions(syntheticFacts());
    expect(a.start).toBe('2026-12');
    expect(a.fatorRMargin).toBe('0.01');
    expect(a.dividendRefundMonth).toBe('2027-06');
    expect(a.selicAnnual).toBeUndefined();
    expect(a.r01Threshold).toEqual({ absoluteMinimum: 300000, rbt12Percentage: '0.01' });
  });

  it('accepts every editable key', () => {
    const a = resolveAssumptions(
      syntheticFacts({
        assumptions: {
          start: assumption('2027-01'),
          horizonMonths: assumption(12),
          fatorRMargin: assumption(0.02),
          revenueProjection: assumption('avg12'),
          payrollProjection: assumption('sameMonthPriorYear'),
          selicAnnual: assumption('0.1475'),
          dividendRefundMonth: assumption('2027-07'),
          pgblRedemptionRate: assumption('0.15'),
          monofasicoPct: assumption('0.4'),
          r01Threshold: assumption({ absoluteMinimum: 100000, rbt12Percentage: '0.02' }),
        },
      }),
    );
    expect(a).toMatchObject({
      start: '2027-01',
      fatorRMargin: '0.02',
      selicAnnual: '0.1475',
      dividendRefundMonth: '2027-07',
      pgblRedemptionRate: '0.15',
      monofasicoPct: '0.4',
      r01Threshold: { absoluteMinimum: 100000, rbt12Percentage: '0.02' },
    });
  });

  it('recalculate() replaces the assumptions (slider): margin 0 → P* = P_28 = 1.760,00', () => {
    const r = recalculate(heroFacts(), {
      fatorRMargin: assumption('0'),
      selicAnnual: assumption('0.15'),
    });
    if (!r.ok) throw new Error(r.error.code);
    const p = r.value.findings[0]?.trace.find((s) => s.id === 'R01.P_STAR')?.result.value;
    expect(p).toBe(brl('1.760,00'));
  });
});

describe('result metadata', () => {
  it('stable hashes: same facts → same inputsHash; parameters hash fixed for the set', () => {
    const a = analyze(heroFacts());
    const b = analyze(heroFacts());
    if (!a.ok || !b.ok) throw new Error('analysis failed');
    expect(a.value.inputsHash).toBe(b.value.inputsHash);
    expect(a.value.inputsHash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.value.parametersHash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.value.engineVersion).toBe('0.2.0');
  });

  it('SHA-256 test vectors and canonical JSON', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('ção §')).toBe(sha256Hex('ção §'));
    expect(sha256Hex('😀'.repeat(40))).toMatch(/^[0-9a-f]{64}$/);
    expect(canonicalJson({ b: 1, a: [2, { d: undefined, c: null }] })).toBe(
      '{"a":[2,{"c":null}],"b":1}',
    );
  });

  it('rulesByRef maps corpus ids to the rules that cite them', () => {
    expect(rulesByRef['lc123-2006/art18/p5-j']).toEqual(['R01']);
    expect(rulesByRef['lc116-2003/art2']).toEqual(['R05', 'R05-REC']);
    expect(rulesByRef['lei9250-1995/art6-a']).toEqual(['R02']);
  });
});

describe('calendar and formatting helpers', () => {
  it('addYears, business days and holidays by year', () => {
    expect(addYears('2023-12-31', 1)).toBe('2024-12-31');
    expect(nextBusinessDay('2026-12-31')).toBe('2026-12-31');
    expect(nextBusinessDay('2027-01-01')).toBe('2027-01-04');
    expect(isBusinessDay('2021-11-19')).toBe(true);
    expect(isBusinessDay('2023-11-20')).toBe(true); // before Lei 14.759/2023 made it a holiday
  });

  it('formatBrl and paramOrNull', () => {
    expect(formatBrl(6231892)).toBe('62.318,92');
    expect(formatBrl(-5)).toBe('−0,05');
    expect(paramOrNull('dividends.withholding', '2025-12')).toBeNull();
    expect(paramOrNull('dividends.withholding', '2026-01')?.value.rate).toBe('0.10');
  });
});
