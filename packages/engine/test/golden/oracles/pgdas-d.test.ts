// ENGINE-SPEC B.3: Manual do PGDAS-D oracles (section 12: "considera todas as casas decimais"; section 8).
// DAS rounded PER TAX, half-up, then summed (D12). OR-SN-08 is out of P0 (minimum municipal ISS).
// Never adjust an expected value to make the engine pass (D10).
import { describe, expect, it } from 'vitest';
import { brl } from '../../../src/money.ts';
import {
  anexoForPa,
  dasForPa,
  displayFatorR,
  effectiveRate,
  fatorR,
  proportionalRbt12,
} from '../../../src/primitives/simples.ts';
import type { Anexo, Series, Tax } from '../../../src/types.ts';
import { SOURCES } from './sources.ts';

const SOURCE = SOURCES.pgdasManual;
// The manual's examples are from 2018; the LC 155 tables they use are the ones in force in 2026 (ENGINE-SPEC A.3).
const PA = '2026-01';

type ByTax = Partial<Record<Tax, string>>;
const toCents = (t: ByTax) =>
  Object.fromEntries(Object.entries(t).map(([k, v]) => [k, brl(v as string)]));

describe(`ENGINE-SPEC B.3 — PGDAS-D manual oracles (${SOURCE.id}, sha256 ${SOURCE.sha256.slice(0, 12)}…)`, () => {
  it('OR-SN-01: Ex. 1 (ABC, Anexo I), RPA 100.000, RBT12 300.000 → 5,32%, 5.320,00', () => {
    const r = dasForPa({
      pa: PA,
      anexo: 'I',
      domestic: { revenue: brl('100.000,00'), rbt12: brl('300.000,00') },
    });
    expect(r.byMarket[0]?.effectiveRate).toBe('0.0532');
    expect(r.byMarket[0]?.byTax).toEqual(
      toCents({
        IRPJ: '292,60',
        CSLL: '186,20',
        COFINS: '677,77',
        PIS: '146,83',
        CPP: '2.207,80',
        ICMS: '1.808,80',
      }),
    );
    expect(r.das).toBe(brl('5.320,00'));
  });

  it('OR-SN-02: Ex. 2 (Anexo III), RPA 100.000, RBT12 300.000 → 8,08%, 8.080,00', () => {
    const r = dasForPa({
      pa: PA,
      anexo: 'III',
      domestic: { revenue: brl('100.000,00'), rbt12: brl('300.000,00') },
    });
    expect(r.byMarket[0]?.effectiveRate).toBe('0.0808');
    expect(r.byMarket[0]?.byTax).toEqual(
      toCents({
        IRPJ: '323,20',
        CSLL: '282,80',
        COFINS: '1.135,24',
        PIS: '246,44',
        CPP: '3.506,72',
        ISS: '2.585,60',
      }),
    );
    expect(r.das).toBe(brl('8.080,00'));
  });

  describe('OR-SN-03: Ex. 3 (start of activity, Anexo I, opened in the 1st month)', () => {
    const opened = '2026-01';
    const revenue: Series = {
      '2026-01': brl('10.000,00'),
      '2026-02': brl('100.000,00'),
      '2026-03': brl('100.000,00'),
    };

    it('jan: RBT12p = 10.000 × 12 = 120.000 → 400,00', () => {
      const rb = proportionalRbt12('2026-01', opened, revenue);
      expect(rb.toFixed()).toBe('120000');
      expect(
        dasForPa({ pa: '2026-01', anexo: 'I', domestic: { revenue: brl('10.000,00'), rbt12: rb } })
          .das,
      ).toBe(brl('400,00'));
    });

    it('feb: RBT12p = 10.000 × 12 = 120.000 → 4.000,00', () => {
      const rb = proportionalRbt12('2026-02', opened, revenue);
      expect(rb.toFixed()).toBe('120000');
      expect(
        dasForPa({ pa: '2026-02', anexo: 'I', domestic: { revenue: brl('100.000,00'), rbt12: rb } })
          .das,
      ).toBe(brl('4.000,00'));
    });

    it('mar: RBT12p = average 55.000 × 12 = 660.000 → 7,40%, 7.400,00', () => {
      const rb = proportionalRbt12('2026-03', opened, revenue);
      expect(rb.toFixed()).toBe('660000');
      const r = dasForPa({
        pa: '2026-03',
        anexo: 'I',
        domestic: { revenue: brl('100.000,00'), rbt12: rb },
      });
      expect(r.byMarket[0]?.effectiveRate).toBe('0.074');
      expect(r.byMarket[0]?.byTax).toEqual(
        toCents({
          IRPJ: '407,00',
          CSLL: '259,00',
          COFINS: '942,76',
          PIS: '204,24',
          CPP: '3.108,00',
          ICMS: '2.479,00',
        }),
      );
      expect(r.das).toBe(brl('7.400,00'));
    });
  });

  it('OR-SN-04: Ex. 4 (Alfa, Fator R 0,50 → Anexo III), RPA 10.000, RBT12 500.000 → 9,972%, 997,20', () => {
    const r = fatorR(brl('250.000,00'), brl('500.000,00'), PA);
    expect(r.value).toBe('0.5');
    const anexo: Anexo = anexoForPa(r.value, { subjectToFatorR: true, baseAnexo: 'V' }, PA);
    expect(anexo).toBe('III');
    const das = dasForPa({
      pa: PA,
      anexo,
      domestic: { revenue: brl('10.000,00'), rbt12: brl('500.000,00') },
    });
    expect(das.byMarket[0]?.effectiveRate).toBe('0.09972');
    expect(das.byMarket[0]?.byTax).toEqual(
      toCents({
        IRPJ: '39,89',
        CSLL: '34,90',
        COFINS: '136,02',
        PIS: '29,52',
        CPP: '432,78',
        ISS: '324,09',
      }),
    );
    expect(das.das).toBe(brl('997,20'));
  });

  it('OR-SN-05: Ex. 5 (Alfa, Fator R 0,20 → Anexo V), RPA 10.000, RBT12 500.000 → 17,52%, 1.752,00', () => {
    const r = fatorR(brl('100.000,00'), brl('500.000,00'), PA);
    expect(r.value).toBe('0.2');
    const anexo = anexoForPa(r.value, { subjectToFatorR: true, baseAnexo: 'V' }, PA);
    expect(anexo).toBe('V');
    const das = dasForPa({
      pa: PA,
      anexo,
      domestic: { revenue: brl('10.000,00'), rbt12: brl('500.000,00') },
    });
    expect(das.byMarket[0]?.effectiveRate).toBe('0.1752');
    expect(das.byMarket[0]?.byTax).toEqual(
      toCents({
        IRPJ: '420,48',
        CSLL: '262,80',
        COFINS: '261,40',
        PIS: '56,59',
        CPP: '417,85',
        ISS: '332,88',
      }),
    );
    expect(das.das).toBe(brl('1.752,00'));
  });

  it('OR-SN-06: Ex. 6 (JBP, Anexo I, domestic + export with SEPARATE RBT12) → 9.935,02 + 2.154,76 = 12.089,78', () => {
    const r = dasForPa({
      pa: PA,
      anexo: 'I',
      domestic: { revenue: brl('100.000,00'), rbt12: brl('2.000.000,00') },
      export: { revenue: brl('50.000,00'), rbt12: brl('1.000.000,00') },
      segregateExport: true,
    });
    const [domestic, foreign] = r.byMarket;
    expect(domestic?.effectiveRate).toBe('0.09935');
    expect(domestic?.byTax).toEqual(
      toCents({
        IRPJ: '546,43',
        CSLL: '347,73',
        COFINS: '1.265,72',
        PIS: '274,21',
        CPP: '4.172,70',
        ICMS: '3.328,23',
      }),
    );
    expect(domestic?.subtotal).toBe(brl('9.935,02'));
    expect(foreign?.effectiveRate).toBe('0.0845');
    // Export: Cofins, PIS and ICMS disregarded (LC 123, art. 18, § 4º-A, IV, and § 14).
    expect(foreign?.byTax).toEqual(
      toCents({
        IRPJ: '232,38',
        CSLL: '147,88',
        COFINS: '0,00',
        PIS: '0,00',
        CPP: '1.774,50',
        ICMS: '0,00',
      }),
    );
    expect(foreign?.subtotal).toBe(brl('2.154,76'));
    expect(r.das).toBe(brl('12.089,78'));
  });

  it('OR-SN-07: Ex. 7 (cash basis), RPA 60.000, RBT12 250.000 → 4,924%, 2.954,40 (CPP 1.226,08; the manual prints 1.226,80, G5)', () => {
    const r = dasForPa({
      pa: PA,
      anexo: 'I',
      domestic: { revenue: brl('60.000,00'), rbt12: brl('250.000,00') },
    });
    expect(r.byMarket[0]?.effectiveRate).toBe('0.04924');
    expect(r.byMarket[0]?.byTax).toEqual(
      toCents({
        IRPJ: '162,49',
        CSLL: '103,40',
        COFINS: '376,39',
        PIS: '81,54',
        CPP: '1.226,08',
        ICMS: '1.004,50',
      }),
    );
    expect(r.das).toBe(brl('2.954,40'));
  });

  it('OR-SN-09: item 8.2.1, FS12 = 0 and RBT12 > 0 → Fator R 0,01', () => {
    expect(fatorR(brl('0,00'), brl('500.000,00'), PA).value).toBe('0.01');
  });

  it('OR-SN-10: item 8.2.1, FS12 > 0 and RBT12 = 0 → Fator R 0,28', () => {
    expect(fatorR(brl('10.000,00'), brl('0,00'), PA).value).toBe('0.28');
  });

  it('OR-SN-11: item 8.2.1, computed 0,2774 → displayed 0,27 (truncated) → Anexo V', () => {
    const r = fatorR(brl('27.740,00'), brl('100.000,00'), PA);
    expect(r.value).toBe('0.2774');
    expect(displayFatorR(r.value)).toBe('0.27');
    expect(r.display).toBe('0.27');
    expect(anexoForPa(r.value, { subjectToFatorR: true, baseAnexo: 'V' }, PA)).toBe('V');
  });

  it('OR-SN-12: item 8.1, RBT12 = 0 → RBT12 = 1 in the effective rate', () => {
    const r = effectiveRate(brl('0,00'), 'III', PA);
    expect(r.bracket).toBe(1);
    expect(r.effectiveRate.toFixed()).toBe('0.06');
    expect(r.rbt12Used.toFixed()).toBe('1');
  });
});
