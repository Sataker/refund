// D52 (PLAN §18): Simples Nacional Anexos II (industry) and IV (LC 123, art. 18, § 5º-C services).
// 1. The tables, transcribed here cell by cell from the law, in the law's own format, against the engine's parameters.
//    2026: LC 123/2006, Anexos II and IV, wording of LC 155/2016 (Planalto lcp155.htm and lcp123.htm; Res. CGSN 140,
//    Anexos II and IV, Normas RFB ato 92278, anexos 48431 and 48433: same cells). 2027–2028: LC 214/2025, Anexos XIX and
//    XXI, wording of LC 227/2026 (Planalto lcp214.htm; Res. CGSN 190/2026, Anexo II, ato 152832, anexo 85770: same).
// 2. Hand-computed DAS reference cases. The Manual do PGDAS-D has NO numerical example for Anexo II or IV (its examples
//    1–12 are Anexos I and III), so every expected value below is derived by hand in the comment, from the tables in
//    (1), with the manual's rules: all decimal places (item 12), each tax rounded half-up to the cent, then summed (D12).
// 3. Rules on II/IV companies: R01 (no Fator R: the anexo never changes), R05 (IPI removed on export, LC 123, art. 18,
//    § 14), R06 (manufacturers are not entitled, D.6), CPP outside the DAS in Anexo IV (C.3.3).
// Never adjust an expected value to make the engine pass (CLAUDE.md, rule 11).
import { describe, expect, it } from 'vitest';
import { analyze } from '../../src/analyze.ts';
import { resolveAssumptions } from '../../src/assumptions.ts';
import { brl } from '../../src/money.ts';
import { param } from '../../src/parameters/index.ts';
import type { SimplesAnexoTable } from '../../src/parameters/types.ts';
import { cppOutsideDas } from '../../src/primitives/inss.ts';
import { dasByMarket, dasForPa, effectiveRate } from '../../src/primitives/simples.ts';
import { createCtx } from '../../src/projection.ts';
import { appliesR06 } from '../../src/rules/r06.ts';
import { regimeStart, simulatePa } from '../../src/scenario.ts';
import { addMonths } from '../../src/time.ts';
import type {
  Anexo,
  Cents,
  EngineResult,
  Facts,
  Finding,
  Tax,
  YearMonth,
} from '../../src/types.ts';
import { constant, syntheticFacts } from './fixtures/facts.ts';

// ---------- 1. The tables as the law prints them ----------

type Row = [upTo: string | null, nominal: string, deduction: string];
type Split = Record<string, string>;
interface LawTable {
  rows: Row[];
  splits: Split[]; // one per bracket, percentages as printed ('11,51%'); a missing tax = '—' in the law
  cap?: { threshold: string; fixedIss: string; federal: Split };
}

const BRACKETS_UP_TO = [
  '180.000,00',
  '360.000,00',
  '720.000,00',
  '1.800.000,00',
  '3.600.000,00',
  '4.800.000,00',
];

/** LC 155/2016, Anexo II: "1a Faixa | Até 180.000,00 | 4,50% | -" … "6a Faixa | … | 30,00% | 720.000,00". */
const II_2026: LawTable = {
  rows: [
    ['180.000,00', '4,50%', '0,00'],
    ['360.000,00', '7,80%', '5.940,00'],
    ['720.000,00', '10,00%', '13.860,00'],
    ['1.800.000,00', '11,20%', '22.500,00'],
    ['3.600.000,00', '14,70%', '85.500,00'],
    ['4.800.000,00', '30,00%', '720.000,00'],
  ],
  // IRPJ | CSLL | Cofins | PIS/Pasep | CPP | IPI | ICMS
  splits: [
    ...Array.from({ length: 5 }, () => ({
      IRPJ: '5,50%',
      CSLL: '3,50%',
      COFINS: '11,51%',
      PIS: '2,49%',
      CPP: '37,50%',
      IPI: '7,50%',
      ICMS: '32,00%',
    })),
    { IRPJ: '8,50%', CSLL: '7,50%', COFINS: '20,96%', PIS: '4,54%', CPP: '23,50%', IPI: '35,00%' },
  ],
};

/** LC 155/2016, Anexo IV, with note (*): "na 5a faixa, quando a alíquota efetiva for superior a 12,5%". */
const IV_2026: LawTable = {
  rows: [
    ['180.000,00', '4,50%', '0,00'],
    ['360.000,00', '9,00%', '8.100,00'],
    ['720.000,00', '10,20%', '12.420,00'],
    ['1.800.000,00', '14,00%', '39.780,00'],
    ['3.600.000,00', '22,00%', '183.780,00'],
    ['4.800.000,00', '33,00%', '828.000,00'],
  ],
  // IRPJ | CSLL | Cofins | PIS/Pasep | ISS (*)
  splits: [
    { IRPJ: '18,80%', CSLL: '15,20%', COFINS: '17,67%', PIS: '3,83%', ISS: '44,50%' },
    { IRPJ: '19,80%', CSLL: '15,20%', COFINS: '20,55%', PIS: '4,45%', ISS: '40,00%' },
    { IRPJ: '20,80%', CSLL: '15,20%', COFINS: '19,73%', PIS: '4,27%', ISS: '40,00%' },
    { IRPJ: '17,80%', CSLL: '19,20%', COFINS: '18,90%', PIS: '4,10%', ISS: '40,00%' },
    { IRPJ: '18,80%', CSLL: '19,20%', COFINS: '18,08%', PIS: '3,92%', ISS: '40,00%' },
    { IRPJ: '53,50%', CSLL: '21,50%', COFINS: '20,55%', PIS: '4,45%' },
  ],
  // "(Alíquota efetiva – 5%) x 31,33% | x 32,00% | x 30,13% | x 6,54% | Percentual de ISS fixo em 5%"
  cap: {
    threshold: '12,5%',
    fixedIss: '5%',
    federal: { IRPJ: '31,33%', CSLL: '32,00%', COFINS: '30,13%', PIS: '6,54%' },
  },
};

/** LC 214/2025, Anexo XIX (LC 123, Anexo II, "Para os anos-calendário 2027 e 2028"). */
const II_2027: LawTable = {
  rows: [
    ['180.000,00', '4,50%', '0,00'],
    ['360.000,00', '7,80%', '5.940,00'],
    ['720.000,00', '10,00%', '13.860,00'],
    ['1.800.000,00', '11,20%', '22.500,00'],
    ['3.600.000,00', '14,70%', '85.500,00'],
    ['4.800.000,00', '29,90%', '720.000,00'],
  ],
  // IRPJ | CSLL | CBS | CPP | IPI | ICMS | IBS
  splits: [
    ...Array.from({ length: 5 }, () => ({
      IRPJ: '5,50%',
      CSLL: '3,50%',
      CBS: '13,85%',
      CPP: '37,50%',
      IPI: '7,50%',
      ICMS: '32,00%',
      IBS: '0,15%',
    })),
    { IRPJ: '8,53%', CSLL: '7,53%', CBS: '25,22%', CPP: '23,59%', IPI: '35,13%' },
  ],
};

/** LC 214/2025, Anexo XXI (LC 123, Anexo IV, "Para os anos-calendário 2027 e 2028"), with note (*). */
const IV_2027: LawTable = {
  rows: [
    ['180.000,00', '4,50%', '0,00'],
    ['360.000,00', '9,00%', '8.100,00'],
    ['720.000,00', '10,20%', '12.420,00'],
    ['1.800.000,00', '14,00%', '39.780,00'],
    ['3.600.000,00', '22,00%', '183.780,00'],
    ['4.800.000,00', '32,90%', '828.000,00'],
  ],
  // IRPJ | CSLL | CBS | ISS (*) | IBS
  splits: [
    { IRPJ: '18,80%', CSLL: '15,20%', CBS: '21,26%', ISS: '44,50%', IBS: '0,24%' },
    { IRPJ: '19,80%', CSLL: '15,20%', CBS: '24,73%', ISS: '40,00%', IBS: '0,27%' },
    { IRPJ: '20,80%', CSLL: '15,20%', CBS: '23,74%', ISS: '40,00%', IBS: '0,26%' },
    { IRPJ: '17,80%', CSLL: '19,20%', CBS: '22,75%', ISS: '40,00%', IBS: '0,25%' },
    { IRPJ: '18,80%', CSLL: '19,20%', CBS: '21,76%', ISS: '40,00%', IBS: '0,24%' },
    { IRPJ: '53,71%', CSLL: '21,59%', CBS: '24,70%' },
  ],
  cap: {
    threshold: '12,5%',
    fixedIss: '5%',
    federal: { IRPJ: '31,33%', CSLL: '32,00%', CBS: '36,27%', IBS: '0,40%' },
  },
};

/** '11,51%' → '11.51' (apportionment, as written); '4,50%' → '0.045' (rate). */
const pct = (s: string) => s.replace('%', '').replace(',', '.');
const asRate = (s: string) => {
  const [int, dec = ''] = pct(s).split('.');
  const n = (Number(`${int}${dec}`) / 10 ** (dec.length + 2)).toString();
  return n;
};
const sameNumber = (a: string, b: string) => Number(a) === Number(b);

function expectTable(table: SimplesAnexoTable, law: LawTable, label: string) {
  expect(table.brackets.length, label).toBe(6);
  law.rows.forEach(([upTo, nominal, deduction], i) => {
    const b = table.brackets[i];
    if (b === undefined) throw new Error(`${label}: bracket ${i + 1} missing`);
    expect(b.bracket, label).toBe(i + 1);
    expect(b.upTo, `${label} ${i + 1}ª faixa: limite`).toBe(upTo === null ? null : brl(upTo));
    expect(b.upTo, label).toBe(brl(BRACKETS_UP_TO[i] as string));
    expect(sameNumber(b.nominal, asRate(nominal)), `${label} ${i + 1}ª faixa: ${nominal}`).toBe(
      true,
    );
    expect(b.deduction, `${label} ${i + 1}ª faixa: deduzir`).toBe(brl(deduction));
    const split = law.splits[i] as Split;
    expect(Object.keys(b.apportionment).sort(), `${label} ${i + 1}ª faixa: tributos`).toEqual(
      Object.keys(split).sort(),
    );
    for (const [tax, value] of Object.entries(split)) {
      const engine = b.apportionment[tax as Tax];
      expect(
        engine !== undefined && sameNumber(engine, pct(value)),
        `${label} ${i + 1}ª ${tax}`,
      ).toBe(true);
    }
  });
  if (law.cap === undefined) {
    expect(table.issCap, label).toBeUndefined();
    return;
  }
  const cap = table.issCap;
  if (cap === undefined) throw new Error(`${label}: ISS cap missing`);
  expect(cap.bracket).toBe(5);
  expect(sameNumber(cap.threshold, asRate(law.cap.threshold)), `${label} cap threshold`).toBe(true);
  expect(sameNumber(cap.fixedIssRate, asRate(law.cap.fixedIss)), `${label} fixed ISS`).toBe(true);
  expect(Object.keys(cap.federalSplit).sort()).toEqual(Object.keys(law.cap.federal).sort());
  for (const [tax, value] of Object.entries(law.cap.federal)) {
    const engine = cap.federalSplit[tax as Tax];
    expect(engine !== undefined && sameNumber(engine, pct(value)), `${label} cap ${tax}`).toBe(
      true,
    );
  }
}

describe('D52 — Anexo II and IV tables, cell by cell against the law', () => {
  it('2026 (LC 155/2016): Anexo II, with the IPI share and no ICMS in the 6th bracket', () => {
    for (const m of ['2018-01', '2026-01', '2026-12'] as const) {
      const p = param('simples.anexo.II', m);
      expectTable(p.value, II_2026, `II ${m}`);
      expect(p.status).toBe('verified');
      expect(p.source.regulation).toBe('LC 123/2006 (redação da LC 155/2016)');
    }
  });

  it('2026 (LC 155/2016): Anexo IV, no CPP share, ISS cap above 12,5% in the 5th bracket', () => {
    for (const m of ['2018-01', '2026-01', '2026-12'] as const) {
      const p = param('simples.anexo.IV', m);
      expectTable(p.value, IV_2026, `IV ${m}`);
      for (const b of p.value.brackets) expect(b.apportionment.CPP).toBeUndefined();
    }
  });

  it('2027–2028 (LC 214, Anexo XIX, wording of LC 227): Anexo II, CBS + IBS = Cofins + PIS', () => {
    for (const m of ['2027-01', '2028-12'] as const) {
      const p = param('simples.anexo.II', m);
      expectTable(p.value, II_2027, `II ${m}`);
      expect(p.projected).toBe(false);
    }
    expect(param('simples.anexo.II', '2029-01').projected).toBe(true);
  });

  it('2027–2028 (LC 214, Anexo XXI, wording of LC 227): Anexo IV, cap split CBS 36,27 + IBS 0,40', () => {
    for (const m of ['2027-01', '2028-12'] as const) {
      const p = param('simples.anexo.IV', m);
      expectTable(p.value, IV_2027, `IV ${m}`);
      expect(p.projected).toBe(false);
    }
  });
});

// ---------- 2. Hand-computed DAS reference cases ----------

const toCents = (t: Partial<Record<Tax, string>>) =>
  Object.fromEntries(Object.entries(t).map(([k, v]) => [k, brl(v as string)]));

describe('D52 — DAS reference cases, hand-computed (no PGDAS-D manual example exists for II/IV)', () => {
  it('REF-II-01: Anexo II 2026, RPA 100.000, RBT12 300.000 → 5,82%, 5.820,00', () => {
    // 2nd bracket: (300.000 × 7,80% − 5.940) ÷ 300.000 = (23.400 − 5.940) ÷ 300.000 = 17.460 ÷ 300.000 = 5,82%.
    // 100.000 × 5,82% = 5.820,00 split: IRPJ 5,50% = 320,10 · CSLL 3,50% = 203,70 · Cofins 11,51% = 669,882 → 669,88 ·
    // PIS 2,49% = 144,918 → 144,92 · CPP 37,50% = 2.182,50 · IPI 7,50% = 436,50 · ICMS 32,00% = 1.862,40.
    // Σ = 320,10 + 203,70 + 669,88 + 144,92 + 2.182,50 + 436,50 + 1.862,40 = 5.820,00.
    const r = dasForPa({
      pa: '2026-06',
      anexo: 'II',
      domestic: { revenue: brl('100.000,00'), rbt12: brl('300.000,00') },
    });
    expect(r.byMarket[0]?.effectiveRate).toBe('0.0582');
    expect(r.byMarket[0]?.byTax).toEqual(
      toCents({
        IRPJ: '320,10',
        CSLL: '203,70',
        COFINS: '669,88',
        PIS: '144,92',
        CPP: '2.182,50',
        IPI: '436,50',
        ICMS: '1.862,40',
      }),
    );
    expect(r.das).toBe(brl('5.820,00'));
  });

  it('REF-IV-01: Anexo IV 2026, RPA 100.000, RBT12 300.000 → 6,30%, 6.300,00, no CPP in the DAS', () => {
    // 2nd bracket: (300.000 × 9,00% − 8.100) ÷ 300.000 = 18.900 ÷ 300.000 = 6,30%. 100.000 × 6,30% = 6.300,00:
    // IRPJ 19,80% = 1.247,40 · CSLL 15,20% = 957,60 · Cofins 20,55% = 1.294,65 · PIS 4,45% = 280,35 · ISS 40,00% = 2.520,00.
    // Σ = 6.300,00. No CPP share (LC 123, art. 18, § 5º-C).
    const r = dasForPa({
      pa: '2026-06',
      anexo: 'IV',
      domestic: { revenue: brl('100.000,00'), rbt12: brl('300.000,00') },
    });
    expect(r.byMarket[0]?.effectiveRate).toBe('0.063');
    expect(r.byMarket[0]?.byTax).toEqual(
      toCents({
        IRPJ: '1.247,40',
        CSLL: '957,60',
        COFINS: '1.294,65',
        PIS: '280,35',
        ISS: '2.520,00',
      }),
    );
    expect(r.byMarket[0]?.byTax.CPP).toBeUndefined();
    expect(r.das).toBe(brl('6.300,00'));
  });

  it('REF-IV-02: ISS cap, Anexo IV 2026, 5th bracket, RBT12 3.000.000, RPA 100.000 → ISS 5.000,00; 15.874,00', () => {
    // (3.000.000 × 22% − 183.780) ÷ 3.000.000 = 476.220 ÷ 3.000.000 = 15,874% > 12,5% → note (*).
    // Without the cap ISS would be 100.000 × 15,874% × 40% = 6.349,60 > 5% of revenue.
    // ISS = 5% × 100.000 = 5.000,00. Federal on (15,874% − 5%) = 10,874% → 10.874,00 split:
    // IRPJ 31,33% = 3.406,8242 → 3.406,82 · CSLL 32,00% = 3.479,68 · Cofins 30,13% = 3.276,3362 → 3.276,34 ·
    // PIS 6,54% = 711,1596 → 711,16. Σ = 5.000,00 + 3.406,82 + 3.479,68 + 3.276,34 + 711,16 = 15.874,00.
    const r = dasForPa({
      pa: '2026-06',
      anexo: 'IV',
      domestic: { revenue: brl('100.000,00'), rbt12: brl('3.000.000,00') },
    });
    expect(r.byMarket[0]?.bracket).toBe(5);
    expect(r.byMarket[0]?.effectiveRate).toBe('0.15874');
    expect(r.byMarket[0]?.byTax).toEqual(
      toCents({
        ISS: '5.000,00',
        IRPJ: '3.406,82',
        CSLL: '3.479,68',
        COFINS: '3.276,34',
        PIS: '711,16',
      }),
    );
    expect(r.das).toBe(brl('15.874,00'));
  });

  it('REF-IV-03: ISS cap, Anexo IV 2027, same company → CBS 3.944,00 + IBS 43,50; 15.874,00', () => {
    // Same effective rate (brackets 1–5 unchanged). Federal 10.874,00: IRPJ 31,33% = 3.406,82 · CSLL 32,00% = 3.479,68 ·
    // CBS 36,27% = 3.943,9998 → 3.944,00 · IBS 0,40% = 43,496 → 43,50; ISS 5.000,00. Σ = 15.874,00.
    const r = dasForPa({
      pa: '2027-06',
      anexo: 'IV',
      domestic: { revenue: brl('100.000,00'), rbt12: brl('3.000.000,00') },
    });
    expect(r.byMarket[0]?.byTax).toEqual(
      toCents({
        ISS: '5.000,00',
        IRPJ: '3.406,82',
        CSLL: '3.479,68',
        CBS: '3.944,00',
        IBS: '43,50',
      }),
    );
    expect(r.das).toBe(brl('15.874,00'));
  });

  it('REF-IV-04: 5th bracket at or below 12,5% keeps the table split (RBT12 1.900.000 → 12,327…%)', () => {
    // (1.900.000 × 22% − 183.780) ÷ 1.900.000 = 234.220 ÷ 1.900.000 = 12,32736842…% ≤ 12,5% → no cap.
    // 100.000 × e = 12.327,36842…: IRPJ 18,80% = 2.317,545… → 2.317,55 · CSLL 19,20% = 2.366,854… → 2.366,85 ·
    // Cofins 18,08% = 2.228,788… → 2.228,79 · PIS 3,92% = 483,232… → 483,23 · ISS 40,00% = 4.930,947… → 4.930,95.
    // Σ = 12.327,37.
    const r = dasForPa({
      pa: '2026-06',
      anexo: 'IV',
      domestic: { revenue: brl('100.000,00'), rbt12: brl('1.900.000,00') },
    });
    expect(r.byMarket[0]?.byTax).toEqual(
      toCents({
        IRPJ: '2.317,55',
        CSLL: '2.366,85',
        COFINS: '2.228,79',
        PIS: '483,23',
        ISS: '4.930,95',
      }),
    );
    expect(r.das).toBe(brl('12.327,37'));
  });

  it('REF-II-02 / REF-II-03: 6th bracket, RBT12 4.000.000, RPA 100.000 → 2026 12.000,00; 2027 11.900,00', () => {
    // 2026: (4.000.000 × 30% − 720.000) ÷ 4.000.000 = 12%. 12.000,00: IRPJ 8,50% = 1.020,00 · CSLL 7,50% = 900,00 ·
    // Cofins 20,96% = 2.515,20 · PIS 4,54% = 544,80 · CPP 23,50% = 2.820,00 · IPI 35,00% = 4.200,00 (no ICMS). Σ 12.000,00.
    const y26 = dasForPa({
      pa: '2026-06',
      anexo: 'II',
      domestic: { revenue: brl('100.000,00'), rbt12: brl('4.000.000,00') },
    });
    expect(y26.byMarket[0]?.byTax).toEqual(
      toCents({
        IRPJ: '1.020,00',
        CSLL: '900,00',
        COFINS: '2.515,20',
        PIS: '544,80',
        CPP: '2.820,00',
        IPI: '4.200,00',
      }),
    );
    expect(y26.das).toBe(brl('12.000,00'));
    // 2027: (4.000.000 × 29,90% − 720.000) ÷ 4.000.000 = 476.000 ÷ 4.000.000 = 11,90%. 11.900,00: IRPJ 8,53% = 1.015,07 ·
    // CSLL 7,53% = 896,07 · CBS 25,22% = 3.001,18 · CPP 23,59% = 2.807,21 · IPI 35,13% = 4.180,47. Σ 11.900,00.
    const y27 = dasForPa({
      pa: '2027-06',
      anexo: 'II',
      domestic: { revenue: brl('100.000,00'), rbt12: brl('4.000.000,00') },
    });
    expect(y27.byMarket[0]?.byTax).toEqual(
      toCents({
        IRPJ: '1.015,07',
        CSLL: '896,07',
        CBS: '3.001,18',
        CPP: '2.807,21',
        IPI: '4.180,47',
      }),
    );
    expect(y27.das).toBe(brl('11.900,00'));
  });

  it('REF-IV-05: 6th bracket, RBT12 4.000.000, RPA 100.000 → 2026 12.300,00; 2027 12.200,00', () => {
    // 2026: (4.000.000 × 33% − 828.000) ÷ 4.000.000 = 12,30%: IRPJ 53,50% = 6.580,50 · CSLL 21,50% = 2.644,50 ·
    // Cofins 20,55% = 2.527,65 · PIS 4,45% = 547,35. Σ 12.300,00 (no ISS above the sublimit, no CPP).
    const y26 = dasForPa({
      pa: '2026-06',
      anexo: 'IV',
      domestic: { revenue: brl('100.000,00'), rbt12: brl('4.000.000,00') },
    });
    expect(y26.byMarket[0]?.byTax).toEqual(
      toCents({ IRPJ: '6.580,50', CSLL: '2.644,50', COFINS: '2.527,65', PIS: '547,35' }),
    );
    expect(y26.das).toBe(brl('12.300,00'));
    // 2027: (4.000.000 × 32,90% − 828.000) ÷ 4.000.000 = 12,20%: IRPJ 53,71% = 6.552,62 · CSLL 21,59% = 2.633,98 ·
    // CBS 24,70% = 3.013,40. Σ 12.200,00.
    const y27 = dasForPa({
      pa: '2027-06',
      anexo: 'IV',
      domestic: { revenue: brl('100.000,00'), rbt12: brl('4.000.000,00') },
    });
    expect(y27.byMarket[0]?.byTax).toEqual(
      toCents({ IRPJ: '6.552,62', CSLL: '2.633,98', CBS: '3.013,40' }),
    );
    expect(y27.das).toBe(brl('12.200,00'));
  });

  it('REF-II-04: RBT12 = 0 → 1 (manual 8.1): 1st bracket, effective = nominal 4,50%; per-tax rounding gives 450,01', () => {
    // 10.000 × 4,50% = 450,00 split: IRPJ 24,75 · CSLL 15,75 · Cofins 51,795 → 51,80 · PIS 11,205 → 11,21 · CPP 168,75 ·
    // IPI 33,75 · ICMS 144,00. Σ = 450,01 (each tax rounded first, D12).
    expect(effectiveRate(0 as Cents, 'II', '2026-06').effectiveRate.toFixed()).toBe('0.045');
    const r = dasForPa({
      pa: '2026-06',
      anexo: 'II',
      domestic: { revenue: brl('10.000,00'), rbt12: 0 as Cents },
    });
    expect(r.byMarket[0]?.byTax).toEqual(
      toCents({
        IRPJ: '24,75',
        CSLL: '15,75',
        COFINS: '51,80',
        PIS: '11,21',
        CPP: '168,75',
        IPI: '33,75',
        ICMS: '144,00',
      }),
    );
    expect(r.das).toBe(brl('450,01'));
  });

  it('brackets 1–5 are continuous in II and IV (2026 and 2027): the deduction closes each step', () => {
    // E.g. IV 1st→2nd at 180.000: 180.000 × 4,5% = 8.100 = 180.000 × 9% − 8.100.
    for (const anexo of ['II', 'IV'] as const) {
      for (const pa of ['2026-06', '2027-06'] as const) {
        for (const limit of ['180.000,00', '360.000,00', '720.000,00', '1.800.000,00']) {
          const below = effectiveRate(brl(limit), anexo, pa);
          const above = effectiveRate((brl(limit) + 1) as Cents, anexo, pa);
          expect(above.bracket).toBe(below.bracket + 1);
          expect(above.effectiveRate.minus(below.effectiveRate).abs().lt('0.0000001')).toBe(true);
        }
      }
    }
  });
});

// ---------- 3. Rules on Anexo II and IV companies ----------

function run(f: Facts): EngineResult {
  const r = analyze(f);
  if (!r.ok) throw new Error(r.error.code);
  return r.value;
}
const finding = (r: EngineResult, id: string) => r.findings.find((f) => f.ruleId === id);

/** A company of a CNAE not subject to the Fator R in Anexo II or IV (the CNAE table gives subjectToFatorR false). */
function company(anexo: Anexo, cnae: string, o: Parameters<typeof syntheticFacts>[0] = {}): Facts {
  const f = syntheticFacts({ ...o, subjectToFatorR: false });
  f.companyDetails.value.baseAnexo = anexo;
  f.company.value.primaryCnae = cnae;
  return f;
}

/** Every PA from `start` to the end of the steady-state block of the status quo (S0 decisions). */
function statusQuoPas(f: Facts, proLabore: Cents) {
  const ctx = createCtx(f, resolveAssumptions(f));
  const start = ctx.assumptions.start;
  const last = addMonths(regimeStart(ctx), 11);
  const out = [];
  for (let pa: YearMonth = start; pa <= last; pa = addMonths(pa, 1)) {
    out.push(
      simulatePa(
        ctx,
        { proLabore, segregateExport: false, segregateMonofasico: false, pgblContribution: {} },
        pa,
      ),
    );
  }
  return out;
}

describe('D52 — R01 on Anexo II and IV companies (no Fator R)', () => {
  it('the anexo of every PA is the base anexo, whatever the payroll (no Fator R, no switch to III/V)', () => {
    for (const [anexo, cnae] of [
      ['II', '1091-1/01'],
      ['IV', '4120-4/00'],
    ] as const) {
      // A payroll far above 28% of revenue: still the base anexo (LC 123, art. 18, §§ 4º, II, 5º and 5º-C).
      const f = company(anexo, cnae, {
        domestic: constant(brl('30.000,00')),
        cltGross: constant(brl('20.000,00')),
      });
      const pas = statusQuoPas(f, brl('1.621,00'));
      expect(pas.length).toBeGreaterThanOrEqual(24);
      for (const p of pas) {
        expect(p.anexo, `${anexo} ${p.pa}`).toBe(anexo);
        expect(p.fatorR, `${anexo} ${p.pa}`).toBeNull();
      }
    }
  });

  it('pró-labore already at the minimum wage → no R01 finding (T01-15 for II and IV)', () => {
    for (const [anexo, cnae] of [
      ['II', '1091-1/01'],
      ['IV', '4120-4/00'],
    ] as const) {
      const r = run(company(anexo, cnae, { domestic: constant(brl('30.000,00')) }));
      expect(finding(r, 'R01'), anexo).toBeUndefined();
    }
  });

  it('Anexo IV: the CPP outside the DAS is 20% of the pró-labore (C.3.3; Lei 8.212, art. 22, III); 0 in II', () => {
    // 20% × 1.621,00 = 324,20 per PA in IV; II pays its CPP inside the DAS (37,50% share).
    expect(cppOutsideDas(brl('1.621,00'), 'IV', '2026-12')).toBe(brl('324,20'));
    expect(cppOutsideDas(brl('1.621,00'), 'IV', '2027-06')).toBe(brl('324,20'));
    expect(cppOutsideDas(brl('1.621,00'), 'II', '2026-12')).toBe(0);
    const iv = statusQuoPas(
      company('IV', '4120-4/00', { domestic: constant(brl('30.000,00')) }),
      brl('1.621,00'),
    );
    for (const p of iv) expect(p.cppOutsideDas, p.pa).toBe(brl('324,20'));
  });

  it('Anexo IV, P0 5.000,00 (D.1 trigger (b): CNAE not subject to the Fator R) → P* 1.621,00; 12.569,88 per year', () => {
    // The DAS does not depend on the pró-labore in IV (no Fator R), so the cost falls with P: P* = SM = 1.621,00.
    // Per month: partner INSS 11% × 5.000,00 = 550,00 → 11% × 1.621,00 = 178,31 (−371,69); CPP outside the DAS
    // 20% × 5.000,00 = 1.000,00 → 20% × 1.621,00 = 324,20 (−675,80). Annual IR: RT 60.000,00 ≤ 60.000,00 → the Lei 15.270
    // reduction (2.694,15) zeroes it (simplified: 48.000 × 22,5% − 8.105,85 = 2.694,15), and at 1.621,00 it is zero
    // too, so ΔIR = 0. Gain = 12 × (371,69 + 675,80) = 12 × 1.047,49 = 12.569,88 ≥ max(3.000; 1% × 360.000) (D14).
    const r = run(
      company('IV', '4120-4/00', {
        domestic: constant(brl('30.000,00')),
        proLabore: constant(brl('5.000,00')),
      }),
    );
    const r01 = finding(r, 'R01') as Finding;
    expect(r01).toBeDefined();
    expect(r01.trace.find((s) => s.id === 'R01.P_STAR')?.result.value).toBe(brl('1.621,00'));
    expect(r01.annualRegimeValue).toBe(brl('12.569,88'));
    expect(r01.marginalValue12m).toBe(brl('12.569,88'));
  });
});

describe('D52 — R05 with Anexo II goods and Anexo IV services', () => {
  it('Anexo II export (2026): the IPI share is removed with Cofins, PIS and ICMS (LC 123, art. 18, § 14)', () => {
    // Export RPA 50.000, own RBT12 600.000 (3rd bracket): (600.000 × 10% − 13.860) ÷ 600.000 = 46.140 ÷ 600.000 = 7,69%.
    // 50.000 × 7,69% = 3.845,00: IRPJ 5,50% = 211,475 → 211,48 · CSLL 3,50% = 134,575 → 134,58 · Cofins 11,51% =
    // 442,5595 → 442,56 · PIS 2,49% = 95,7405 → 95,74 · CPP 37,50% = 1.441,875 → 1.441,88 · IPI 7,50% = 288,375 →
    // 288,38 · ICMS 32,00% = 1.230,40. Unsegregated Σ = 3.845,02. Segregated keeps IRPJ + CSLL + CPP = 1.787,94.
    const kept = dasByMarket(brl('50.000,00'), brl('600.000,00'), 'II', 'export', '2026-06', {
      segregateExport: true,
    });
    expect(kept.byTax).toEqual(
      toCents({
        IRPJ: '211,48',
        CSLL: '134,58',
        COFINS: '0,00',
        PIS: '0,00',
        CPP: '1.441,88',
        IPI: '0,00',
        ICMS: '0,00',
      }),
    );
    expect(kept.subtotal).toBe(brl('1.787,94'));
    const all = dasByMarket(brl('50.000,00'), brl('600.000,00'), 'II', 'domestic', '2026-06');
    expect(all.byTax.IPI).toBe(brl('288,38'));
    expect(all.subtotal).toBe(brl('3.845,02'));
  });

  it('Anexo II export (2027): CBS, IBS, IPI and ICMS removed (art. 18, §§ 14 and 14-A) → same 1.787,94', () => {
    // CBS 13,85% = 532,5325 → 532,53 · IBS 0,15% = 5,7675 → 5,77 (= Cofins 442,56 + PIS 95,74 = 538,30 in 2026).
    const kept = dasByMarket(brl('50.000,00'), brl('600.000,00'), 'II', 'export', '2027-06', {
      segregateExport: true,
    });
    expect(kept.subtotal).toBe(brl('1.787,94'));
    expect(kept.byTax).toMatchObject({ CBS: 0, IBS: 0, IPI: 0, ICMS: 0 });
    const all = dasByMarket(brl('50.000,00'), brl('600.000,00'), 'II', 'domestic', '2027-06');
    expect(all.byTax).toMatchObject(toCents({ CBS: '532,53', IBS: '5,77', IPI: '288,38' }));
    expect(all.subtotal).toBe(brl('3.845,02'));
  });

  it('Anexo II company exporting 50.000/month, not segregated → R05 24.684,96 per year (IPI included)', () => {
    // Per PA: 3.845,02 − 1.787,94 = 2.057,08 (Cofins 442,56 + PIS 95,74 + IPI 288,38 + ICMS 1.230,40; in 2027 CBS
    // 532,53 + IBS 5,77 + IPI + ICMS, the same 2.057,08). × 12 = 24.684,96 in the horizon and at steady state.
    const r = run(
      company('II', '1091-1/01', { export: constant(brl('50.000,00')), exportResultAbroad: true }),
    );
    const r05 = finding(r, 'R05') as Finding;
    expect(r05).toBeDefined();
    expect(r05.marginalValue12m).toBe(brl('24.684,96'));
    expect(r05.annualRegimeValue).toBe(brl('24.684,96'));
  });

  it('Anexo IV export of services (2026 and 2027): Cofins/PIS (CBS/IBS) and ISS removed; 708,75 kept', () => {
    // Export RPA 30.000, RBT12 360.000 (2nd bracket): (360.000 × 9% − 8.100) ÷ 360.000 = 24.300 ÷ 360.000 = 6,75%.
    // 30.000 × 6,75% = 2.025,00: IRPJ 19,80% = 400,95 · CSLL 15,20% = 307,80 · Cofins 20,55% = 416,1375 → 416,14 ·
    // PIS 4,45% = 90,1125 → 90,11 · ISS 40% = 810,00. Kept IRPJ + CSLL = 708,75; removed 1.316,25 per PA.
    // 2027: CBS 24,73% = 500,7825 → 500,78 · IBS 0,27% = 5,4675 → 5,47 (= 506,25 = Cofins + PIS); same 708,75.
    for (const pa of ['2026-06', '2027-06'] as const) {
      const kept = dasByMarket(brl('30.000,00'), brl('360.000,00'), 'IV', 'export', pa, {
        segregateExport: true,
      });
      expect(kept.subtotal, pa).toBe(brl('708,75'));
      expect(kept.byTax.IRPJ).toBe(brl('400,95'));
      expect(kept.byTax.CSLL).toBe(brl('307,80'));
      const all = dasByMarket(brl('30.000,00'), brl('360.000,00'), 'IV', 'domestic', pa);
      expect(all.subtotal, pa).toBe(brl('2.025,00'));
    }
    // × 12 = 15.795,00 per year.
    const r = run(
      company('IV', '6911-7/01', { export: constant(brl('30.000,00')), exportResultAbroad: true }),
    );
    const r05 = finding(r, 'R05') as Finding;
    expect(r05.marginalValue12m).toBe(brl('15.795,00'));
    expect(r05.annualRegimeValue).toBe(brl('15.795,00'));
  });
});

describe('D52 — R06 never applies to a manufacturer (Anexo II)', () => {
  it('a division 10–33 CNAE flagged as monofásico still does not trigger R06 (D.6: not entitled)', () => {
    const f = company('II', '1091-1/01', { domestic: constant(brl('50.000,00')) });
    f.companyDetails.value.resellsMonofasico = true;
    expect(appliesR06(createCtx(f, resolveAssumptions(f)))).toBe(false);
  });
});
