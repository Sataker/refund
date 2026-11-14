// ENGINE-SPEC B.1: monthly IR with the Lei 15.270 reduction. Expected values copied from the official examples;
// never adjust them to make the engine pass (D10; EXECUTION §1).
import { describe, expect, it } from 'vitest';
import { brl } from '../../../src/money.ts';
import { monthlyIr } from '../../../src/primitives/irpf.ts';
import { type OracleSource, SOURCES } from './sources.ts';

interface MonthlyIrOracle {
  id: string;
  source: OracleSource;
  example: string;
  rt: string;
  legalDeductions: string; // official social security provided ("Ded."); 0,00 when none
  expected: { base?: string; tableTax?: string; reduction?: string; ir: string };
}

const ORACLES: MonthlyIrOracle[] = [
  {
    id: 'OR-IR-01',
    source: SOURCES.receitaLei15270Examples,
    example: 'Exemplo 1 (João)',
    rt: '3.036,00',
    legalDeductions: '257,73',
    expected: { base: '2.428,80', tableTax: '0,00', ir: '0,00' },
  },
  {
    id: 'OR-IR-02',
    source: SOURCES.receitaLei15270Examples,
    example: 'Exemplo 2 (José)',
    rt: '4.000,00',
    legalDeductions: '373,41',
    expected: { base: '3.392,80', tableTax: '114,76', reduction: '114,76', ir: '0,00' },
  },
  {
    id: 'OR-IR-03',
    source: SOURCES.receitaLei15270Examples,
    example: 'Exemplo 3 (Maria)',
    rt: '5.000,00',
    legalDeductions: '509,60',
    expected: { base: '4.392,80', tableTax: '312,89', reduction: '312,89', ir: '0,00' },
  },
  {
    id: 'OR-IR-04',
    source: SOURCES.receitaLei15270Examples,
    example: 'Exemplo 4 (Rita)',
    rt: '6.000,00',
    legalDeductions: '649,60',
    expected: { base: '5.350,40', tableTax: '562,63', reduction: '179,75', ir: '382,88' },
  },
  {
    id: 'OR-IR-05',
    source: SOURCES.receitaLei15270Examples,
    example: 'Exemplo 5 (Vera)',
    rt: '7.607,20',
    legalDeductions: '0,00',
    expected: { base: '7.000,00', tableTax: '1.016,27', reduction: '0,00', ir: '1.016,27' },
  },
  {
    id: 'OR-IR-06',
    source: SOURCES.sipec566295,
    example: 'Exemplo 3',
    rt: '5.000,01',
    legalDeductions: '509,60',
    expected: { base: '4.392,81', tableTax: '312,89', reduction: '312,89', ir: '0,00' },
  },
  {
    id: 'OR-IR-07',
    source: SOURCES.sipec566295,
    example: 'Exemplo 4',
    rt: '5.250,00',
    legalDeductions: '544,60',
    expected: { base: '4.642,80', tableTax: '369,14', reduction: '279,61', ir: '89,53' },
  },
  {
    id: 'OR-IR-08',
    source: SOURCES.sipec566295,
    example: 'Exemplo 5',
    rt: '7.350,00',
    legalDeductions: '838,60',
    expected: { base: '6.511,40', tableTax: '881,91', reduction: '0,00', ir: '881,91' },
  },
  {
    id: 'OR-IR-09',
    source: SOURCES.sipec566295,
    example: 'Exemplo 6',
    rt: '7.350,01',
    legalDeductions: '838,60',
    expected: { base: '6.511,41', tableTax: '881,91', reduction: '0,00', ir: '881,91' },
  },
  {
    id: 'OR-IR-10',
    source: SOURCES.sipec566295,
    example: 'Exemplo 7 (1º cálculo)',
    rt: '6.482,38',
    legalDeductions: '623,18',
    expected: { base: '5.859,20', tableTax: '702,55', reduction: '115,52', ir: '587,03' },
  },
  {
    id: 'OR-IR-11',
    source: SOURCES.coadSecondary,
    example: 'RT 6.000,00 com deduções ≤ 607,20 (G1)',
    rt: '6.000,00',
    legalDeductions: '0,00',
    expected: { base: '5.392,80', tableTax: '574,29', reduction: '179,75', ir: '394,54' },
  },
  {
    id: 'OR-IR-12a',
    source: SOURCES.sipec566295,
    example: 'Exemplo 1',
    rt: '4.000,00',
    legalDeductions: '0,00',
    expected: { base: '3.392,80', tableTax: '114,76', reduction: '114,76', ir: '0,00' },
  },
  {
    id: 'OR-IR-12b',
    source: SOURCES.sipec566295,
    example: 'Exemplo 2',
    rt: '5.000,00',
    legalDeductions: '0,00',
    expected: { base: '4.392,80', tableTax: '312,89', reduction: '312,89', ir: '0,00' },
  },
];

describe('ENGINE-SPEC B.1 — monthly IR oracles (Receita, SIPEC)', () => {
  for (const o of ORACLES) {
    it(`${o.id}: ${o.source.id}, ${o.example} → IR ${o.expected.ir}`, () => {
      const result = monthlyIr(brl(o.rt), brl(o.legalDeductions), 0, '2026-01');
      expect(result.ir).toBe(brl(o.expected.ir));
      if (o.expected.base !== undefined) expect(result.base).toBe(brl(o.expected.base));
      if (o.expected.tableTax !== undefined) expect(result.tableTax).toBe(brl(o.expected.tableTax));
      if (o.expected.reduction !== undefined)
        expect(result.reduction).toBe(brl(o.expected.reduction));
    });
  }

  it('every primary oracle cites a captured source with a SHA-256', () => {
    for (const o of ORACLES) {
      if (o.source.kind === 'secondary') continue;
      expect(o.source.url).toMatch(/^https:\/\//);
      expect(o.source.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('B.1 divergence: at RT 7.350,00 SIPEC (half-up) gives 881,91; the Receita simulator truncates to 881,90', () => {
    // DECISION (B.1): follow SIPEC/Receita examples (half-up on products). Documented, not "fixed".
    expect(monthlyIr(brl('7.350,00'), brl('838,60'), 0, '2026-06').ir).toBe(brl('881,91'));
  });
});
