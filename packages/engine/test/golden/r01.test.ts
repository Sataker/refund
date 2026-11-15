// ENGINE-SPEC D.1 tests T01-01…T01-18 (values in R$ written as in the spec; compared in cents).
// Unless stated: start 2026-12, margin 0,01, revenue only in the domestic market (D intro).
import { describe, expect, it } from 'vitest';
import { analyze } from '../../src/analyze.ts';
import { brl } from '../../src/money.ts';
import { inssPartner } from '../../src/primitives/inss.ts';
import { monthlyIr } from '../../src/primitives/irpf.ts';
import { anexoForPa, dasForPa, fatorR, window } from '../../src/primitives/simples.ts';
import type { Cents, EngineResult, Facts, Finding, Series } from '../../src/types.ts';
import { constant, OBSERVED, type SyntheticOptions, syntheticFacts } from './fixtures/facts.ts';

const MARGIN_0: Facts['assumptions'] = {
  fatorRMargin: { value: '0', origin: 'user', editable: true, source: 'slider' },
};

function run(f: Facts): EngineResult {
  const r = analyze(f);
  if (!r.ok) throw new Error(r.error.code);
  return r.value;
}
const r01 = (r: EngineResult) => r.findings.find((f) => f.ruleId === 'R01') as Finding;
const stepValue = (f: Finding, id: string) => f.trace.find((s) => s.id === id)?.result.value;

/** Research 02, Ex. 1: RBT12 600.000 (50.000/month); CLT 120.000 + FGTS 9.600 = FSo 129.600; P0 = 1.621. */
const ex1 = (o: SyntheticOptions = {}) =>
  syntheticFacts({
    domestic: constant(brl('50.000,00')),
    cltGross: constant(brl('10.000,00')),
    fgts: constant(brl('800,00')),
    ...o,
  });

describe('ENGINE-SPEC D.1 — R01', () => {
  it('T01-01: research 02 Ex. 1, margin 0 → P* 3.200,00; 41.655,72 per year', () => {
    const f = r01(run(ex1({ assumptions: MARGIN_0 })));
    expect(stepValue(f, 'R01.P_STAR')).toBe(brl('3.200,00'));
    expect(f.annualRegimeValue).toBe(brl('41.655,72'));
    expect(f.countsInTotal).toBe(true);
  });

  it('T01-02: same, margin 0,01 → P* 3.700,00; 40.995,72 per year', () => {
    const r = run(ex1());
    const f = r01(r);
    expect(stepValue(f, 'R01.P_STAR')).toBe(brl('3.700,00'));
    expect(f.annualRegimeValue).toBe(brl('40.995,72'));
    expect(r.total.annualRegimeSavings).toBe(brl('40.995,72'));
  });

  it('T01-03: no employees, margin 0 → gain 4.247,66 < threshold 6.000: does not recommend', () => {
    const f = r01(
      run(syntheticFacts({ domestic: constant(brl('50.000,00')), assumptions: MARGIN_0 })),
    );
    expect(stepValue(f, 'R01.P_STAR')).toBe(brl('14.000,00'));
    expect(stepValue(f, 'R01.REGIME_GAIN')).toBe(brl('4.247,66'));
    expect(f.trace.find((s) => s.id === 'R01.REGIME_GAIN')?.inputs.after?.value).toBe(
      brl('104.992,06'),
    );
    expect(f.trace.find((s) => s.id === 'R01.REGIME_GAIN')?.inputs.before?.value).toBe(
      brl('109.239,72'),
    );
    expect(f.marginalValue12m).toBe(0);
    expect(f.annualRegimeValue).toBe(0);
    expect(f.countsInTotal).toBe(false);
    expect(f.title).toBe(
      'Mudar o pró-labore não compensa: ganho de R$ 4.247,66 por ano, abaixo do mínimo de R$ 6.000,00',
    );
  });

  it('T01-04: no employees, margin 0,01 → P* 14.500,00; gain 2.597,66: does not recommend', () => {
    const r = run(syntheticFacts({ domestic: constant(brl('50.000,00')) }));
    const f = r01(r);
    expect(stepValue(f, 'R01.P_STAR')).toBe(brl('14.500,00'));
    expect(stepValue(f, 'R01.REGIME_GAIN')).toBe(brl('2.597,66'));
    expect(f.countsInTotal).toBe(false);
    expect(r.total.savings12m).toBe(0);
  });

  it('T01-05/T01-06: boundary 27,99% → V, 8.925,00; 28,00% → III, 5.280,00', () => {
    const company = { subjectToFatorR: true, baseAnexo: 'III' as const };
    for (const [fs, anexo, das] of [
      ['167.940,00', 'V', '8.925,00'],
      ['168.000,00', 'III', '5.280,00'],
    ] as const) {
      const fr = fatorR(brl(fs), brl('600.000,00'), '2026-12').value;
      const a = anexoForPa(fr, company, '2026-12');
      expect(a).toBe(anexo);
      const r = dasForPa({
        pa: '2026-12',
        anexo: a,
        domestic: { revenue: brl('50.000,00'), rbt12: brl('600.000,00') },
      });
      expect(r.das).toBe(brl(das));
    }
  });

  it('T01-08: window at the rule change (same window in 12/2026 and 01/2027)', () => {
    expect(window('2026-12')).toEqual(['2025-12', '2026-11']);
    expect(window('2027-01')).toEqual(['2025-12', '2026-11']);
    expect(window('2027-02')).toEqual(['2026-01', '2026-12']);
  });

  it('T01-09: reduce the pró-labore (Anexo III, FSo 200.000, P0 12.000) → P* 1.621,00; 32.892,34', () => {
    const gross = constant(brl('16.000,00'));
    const fgts: Series = {};
    for (const m of OBSERVED.slice(0, 8)) fgts[m] = brl('1.000,00');
    const f = r01(
      run(
        syntheticFacts({
          domestic: constant(brl('50.000,00')),
          cltGross: gross,
          fgts,
          proLabore: constant(brl('12.000,00')),
        }),
      ),
    );
    expect(stepValue(f, 'R01.FS12_WITHOUT_PRO_LABORE')).toBe(brl('200.000,00'));
    expect(stepValue(f, 'R01.P_STAR')).toBe(brl('1.621,00'));
    expect(f.annualRegimeValue).toBe(brl('32.892,34'));
    expect(f.title).toBe(
      'Reduza o pró-labore para R$ 1.621,00/mês: R$ 32.892,34 a menos de IR e INSS por ano',
    );
    expect(f.tradeoffs.some((t) => t.includes('aposentadoria'))).toBe(true);
    // C.7.4 only applies when the ramp crosses into Anexo III; reducing the pró-labore has no alternative.
    expect(f.trace.some((s) => s.id.startsWith('R01.EARLY_ALTERNATIVE'))).toBe(false);
  });

  it('T01-10: partner works and P0 = 0 → S0 regularized at 1.621; no savings from paying the minimum', () => {
    const regularized = r01(run(ex1({ proLabore: constant(0 as Cents) })));
    const atMinimum = r01(run(ex1()));
    expect(stepValue(regularized, 'R01.P_STAR')).toBe(brl('3.700,00'));
    expect(regularized.annualRegimeValue).toBe(atMinimum.annualRegimeValue);
  });

  it('T01-11: INSS ceiling, P = 9.000,00 → 932,31', () => {
    expect(inssPartner(brl('9.000,00'), '2026-12')).toBe(brl('932,31'));
  });

  it('T01-12: monthly IR on a pró-labore of 5.000,00 / 5.000,01 → 0,00 / 0,00', () => {
    for (const p of ['5.000,00', '5.000,01']) {
      const P = brl(p);
      expect(monthlyIr(P, inssPartner(P, '2026-12'), 0, '2026-12').ir).toBe(0);
    }
  });

  it('T01-13: monthly IR on 7.350,00 / 7.350,01 → 890,18 / 890,19', () => {
    for (const [p, ir] of [
      ['7.350,00', '890,18'],
      ['7.350,01', '890,19'],
    ] as const) {
      const P = brl(p);
      expect(monthlyIr(P, inssPartner(P, '2026-12'), 0, '2026-12').ir).toBe(brl(ir));
    }
  });

  it('T01-14: Simples bracket change (Anexo III, RPA 60.000; RBT12 720.000,00 × 720.000,01) → 6.630,00', () => {
    for (const rbt of ['720.000,00', '720.000,01']) {
      const r = dasForPa({
        pa: '2026-12',
        anexo: 'III',
        domestic: { revenue: brl('60.000,00'), rbt12: brl(rbt) },
      });
      expect(r.byMarket[0]?.byTax).toEqual({
        IRPJ: brl('265,20'),
        CSLL: brl('232,05'),
        COFINS: brl('904,33'),
        PIS: brl('196,25'),
        CPP: brl('2.877,42'),
        ISS: brl('2.154,75'),
      });
      expect(r.das).toBe(brl('6.630,00'));
    }
  });

  it('T01-15: CNAE outside the Fator R, P0 = SM → finding null', () => {
    const r = run(ex1({ subjectToFatorR: false }));
    expect(r.findings.find((f) => f.ruleId === 'R01')).toBeUndefined();
    expect(r.total.savings12m).toBe(0);
  });

  it('T01-16: P* rounded UP to the cent (FSo 129.601, margin 0) → 3.199,92', () => {
    const fgts = constant(brl('800,00'));
    fgts['2026-03'] = brl('801,00');
    const f = r01(run(ex1({ fgts, assumptions: MARGIN_0 })));
    expect(stepValue(f, 'R01.FS12_WITHOUT_PRO_LABORE')).toBe(brl('129.601,00'));
    expect(stepValue(f, 'R01.P_28')).toBe(brl('3.199,92'));
    expect(stepValue(f, 'R01.P_STAR')).toBe(brl('3.199,92'));
    // FS12 = 168.000,04 ≥ 168.000 → III; with 3.199,91: 167.999,92 → V.
    const at = (p: string) =>
      anexoForPa(
        fatorR((brl('129.601,00') + 12 * brl(p)) as Cents, brl('600.000,00'), '2028-01').value,
        { subjectToFatorR: true, baseAnexo: 'III' },
        '2028-01',
      );
    expect(at('3.199,92')).toBe('III');
    expect(at('3.199,91')).toBe('V');
  });

  it('T01-18: already at 28,5% (FSo 151.548, P0 1.621) → no finding (the margin does not apply to the status quo)', () => {
    const r = run(
      syntheticFacts({
        domestic: constant(brl('50.000,00')),
        cltGross: constant(brl('11.629,00')),
        fgts: constant(brl('1.000,00')),
      }),
    );
    expect(r.findings.find((f) => f.ruleId === 'R01')).toBeUndefined();
  });

  it('R01 is estimated when the pró-labore is an assumption (C.9)', () => {
    const f = ex1();
    f.partner.grossProLabore.provenance = { origin: 'default_assumption' };
    const finding = r01(run(f));
    expect(finding.confidence).toBe('estimated');
    expect(finding.range).toEqual([finding.marginalValue12m, finding.marginalValue12m]);
  });

  it('R01 does not run outside the Simples (D.1: MEI, Presumido, Real)', () => {
    const r = run(ex1({ regime: 'PRESUMIDO' }));
    expect(r.findings.find((f) => f.ruleId === 'R01')).toBeUndefined();
    expect(r.total.annualRegimeSavings).toBeNull();
  });
});
