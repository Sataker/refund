// TESTS §2.1 (parameter tables) and ENGINE-SPEC H.2, item 1: every parameter used by the primitives has a
// source URL and a verification date; lookup by effective period; `projected` after the last published month.
import { describe, expect, it } from 'vitest';
import { D } from '../src/money.ts';
import {
  ALL_PARAMETERS,
  legalRefOf,
  OFFICIAL_SET_ID,
  PARAMETERS_VERSION,
  param,
  parameterSets,
} from '../src/parameters/index.ts';
import type { ParameterKey, SimplesAnexoTable } from '../src/parameters/types.ts';
import { civilDate } from '../src/time.ts';
import type { YearMonth } from '../src/types.ts';

/** Keys read by the primitives in src/primitives (H.2, item 1). */
const USED_BY_PRIMITIVES: readonly ParameterKey[] = [
  'irpf.monthly.table',
  'irpf.monthly.simplifiedDiscount',
  'irpf.monthly.dependent',
  'irpf.monthly.reduction',
  'irpf.annual.table',
  'irpf.annual.reduction',
  'irpf.annual.simplifiedDiscount',
  'irpf.pgbl.limit',
  'inss.ceiling',
  'inss.proLabore.rate',
  'inss.employee.brackets',
  'inss.cpp.rate',
  'simples.anexo.I',
  'simples.anexo.II',
  'simples.anexo.III',
  'simples.anexo.IV',
  'simples.anexo.V',
  'simples.effectiveRate',
  'simples.export.exclude',
  'simples.monofasico.exclude',
  'simples.fatorR.limit',
  'simples.fatorR.formula',
  'simples.fatorR.window',
  'simples.rbt12.window',
  'dividends.withholding',
  'simples.startOfActivity',
  'mei.limit',
  'mei.excess',
];

const ANEXO_KEYS = [
  'simples.anexo.I',
  'simples.anexo.II',
  'simples.anexo.III',
  'simples.anexo.IV',
  'simples.anexo.V',
] as const;

const MONTHS: YearMonth[] = ['2026-01', '2026-12', '2027-01', '2027-06', '2028-12'];

describe('parameters: source and verification (H.2, item 1)', () => {
  for (const key of USED_BY_PRIMITIVES) {
    it(`${key} resolves in 2026–2028 with source.url and verifiedAt`, () => {
      for (const month of MONTHS) {
        const p = param(key, month);
        expect(p.source.url, `${key} ${month}`).toMatch(/^https?:\/\/\S+$/);
        expect(p.source.regulation.length).toBeGreaterThan(0);
        expect(p.source.provision.length).toBeGreaterThan(0);
        expect(civilDate(p.verifiedAt)).toBe(p.verifiedAt);
      }
    });
  }

  it('every record has a source, a valid verification date and a note when it is not verified', () => {
    for (const e of ALL_PARAMETERS) {
      expect(e.source.url, e.key).toMatch(/^https?:\/\/\S+$/);
      expect(civilDate(e.verifiedAt)).toBe(e.verifiedAt);
      if (e.status !== 'verified') expect(e.note, e.key).toBeTruthy();
    }
  });

  it('no record is duplicated for the same key and effective month', () => {
    const seen = new Set<string>();
    for (const e of ALL_PARAMETERS) {
      const id = `${e.key}@${e.effectiveFrom}`;
      expect(seen.has(id), id).toBe(false);
      seen.add(id);
    }
  });

  it('the Simples apportionments sum to 100% in every bracket (2026 and 2027–2028)', () => {
    for (const month of ['2026-06', '2027-06'] as const) {
      for (const key of ANEXO_KEYS) {
        const table: SimplesAnexoTable = param(key, month).value;
        for (const b of table.brackets) {
          const sum = Object.values(b.apportionment).reduce((acc, v) => acc.plus(v), D(0));
          expect(sum.toFixed(2), `${key} ${month} bracket ${b.bracket}`).toBe('100.00');
        }
        if (table.issCap) {
          const sum = Object.values(table.issCap.federalSplit).reduce(
            (acc, v) => acc.plus(v),
            D(0),
          );
          expect(sum.toFixed(2), `${key} ${month} ISS cap`).toBe('100.00');
        }
      }
    }
  });

  it('effective rates are continuous between brackets 1–5 (the deduction amounts close the steps)', () => {
    for (const month of ['2026-06', '2027-06'] as const) {
      for (const key of ANEXO_KEYS) {
        const brackets = param(key, month).value.brackets;
        for (let i = 0; i < 4; i++) {
          const a = brackets[i];
          const b = brackets[i + 1];
          if (!a || !b || a.upTo === null) throw new Error('table shape');
          const limit = D(a.upTo).dividedBy(100);
          const left = limit.times(a.nominal).minus(D(a.deduction).dividedBy(100));
          const right = limit.times(b.nominal).minus(D(b.deduction).dividedBy(100));
          expect(left.toFixed(2), `${key} ${month} ${a.bracket}→${b.bracket}`).toBe(
            right.toFixed(2),
          );
        }
      }
    }
  });
});

describe('param(key, month): effective period', () => {
  it('returns the 2026 window up to PA 12/2026 and the Res. CGSN 190 window from PA 01/2027', () => {
    expect(param('simples.fatorR.window', '2026-12').value).toEqual({
      startOffset: -12,
      endOffset: -1,
    });
    expect(param('simples.fatorR.window', '2027-01').value).toEqual({
      startOffset: -13,
      endOffset: -2,
    });
    expect(param('simples.rbt12.window', '2027-01').effectiveFrom).toBe('2027-01');
  });

  it('marks annually published values as projected after 2026 (C.1, item 4)', () => {
    expect(param('irpf.monthly.table', '2026-12').projected).toBe(false);
    const ir2027 = param('irpf.monthly.table', '2027-03');
    expect(ir2027.projected).toBe(true);
    expect(ir2027.effectiveFrom).toBe('2026-01');
    expect(param('minimumWage', '2027-01').projected).toBe(true);
    // A rule fixed in law is not projected.
    expect(param('simples.fatorR.limit', '2027-01').projected).toBe(false);
  });

  it('uses the 2027–2028 Simples tables and projects them from 2029 on', () => {
    expect(param('simples.anexo.III', '2026-12').value.brackets[2]?.apportionment.COFINS).toBe(
      '13.64',
    );
    expect(param('simples.anexo.III', '2027-01').value.brackets[2]?.apportionment.CBS).toBe(
      '16.41',
    );
    expect(param('simples.anexo.III', '2028-12').projected).toBe(false);
    expect(param('simples.anexo.III', '2029-01').projected).toBe(true);
    expect(param('simples.anexo.I', '2027-01').value.brackets[5]?.nominal).toBe('0.189');
  });

  it('flags the MEI limits that depend on the LOA (G7)', () => {
    expect(param('mei.limit', '2026-06').dependsOnRegulation).toBe(false);
    expect(param('mei.limit', '2027-06').value.annual).toBe(11_000_000);
    expect(param('mei.limit', '2027-06').dependsOnRegulation).toBe(true);
    expect(param('mei.limit', '2028-01').value.annual).toBe(14_000_000);
  });

  it('fails for a month before the first published record', () => {
    expect(() => param('irpf.monthly.table', '2025-12')).toThrow(RangeError);
    // Res. CGSN 140 produces effects from 01/08/2018 (art. 154, II).
    expect(() => param('simples.fatorR.formula', '2018-07')).toThrow(RangeError);
  });

  it('values in force before 2026 carry their real effectiveFrom (from the captures)', () => {
    const since = (key: ParameterKey, m: YearMonth) => param(key, m).effectiveFrom;
    // LC 155/2016, "Vigência: 01/01/2018" (lc-123-2006-planalto.md).
    for (const key of [
      'simples.anexo.I',
      'simples.anexo.II',
      'simples.anexo.III',
      'simples.anexo.IV',
      'simples.anexo.V',
      'simples.effectiveRate',
      'simples.fatorR.limit',
      'simples.fatorR.payroll',
      'simples.fatorR.window',
      'simples.rbt12.window',
      'simples.export.exclude',
      'simples.monofasico.exclude',
      'simples.limits',
      'simples.excess',
      'mei.limit',
      'mei.excess',
    ] as const) {
      expect(since(key, '2021-10'), key).toBe('2018-01');
    }
    // Res. CGSN 140/2018: effects from 01/08/2018.
    for (const key of [
      'simples.fatorR.formula',
      'simples.rbt12.byMarket',
      'simples.export.concept',
    ] as const) {
      expect(since(key, '2021-10'), key).toBe('2018-08');
    }
    // Changed in 2026: stays 2026-01.
    for (const key of [
      'irpf.monthly.table',
      'inss.ceiling',
      'minimumWage',
      'dividends.withholding',
    ] as const) {
      expect(since(key, '2026-06'), key).toBe('2026-01');
    }
    expect(param('simples.anexo.III', '2025-11').projected).toBe(false);
  });

  it('start-of-activity rule by effective period (manual 8.3 up to 12/2026; Res. CGSN 190 from 01/2027)', () => {
    expect(param('simples.startOfActivity', '2026-12').value).toEqual({
      firstBracketMonths: 0,
      firstMonthRevenueTimes12: true,
      averageEndOffset: -1,
      untilMonthOfActivity: 12,
    });
    expect(param('simples.startOfActivity', '2027-01').value).toEqual({
      firstBracketMonths: 2,
      firstMonthRevenueTimes12: false,
      averageEndOffset: -2,
      untilMonthOfActivity: 13,
    });
  });

  it('simples.export.concept stays to_confirm (only the PN COSIT 1/2018 summary was captured)', () => {
    expect(param('simples.export.concept', '2026-06').status).toBe('to_confirm');
  });

  it('links the 2026 IR, INSS and minimum-wage records to their captures', () => {
    expect(ALL_PARAMETERS.find((e) => e.key === 'inss.employee.brackets')?.note).toContain(
      'inss-tabela-contribuicao-mensal-2026',
    );
    expect(ALL_PARAMETERS.find((e) => e.key === 'irpf.annual.table')?.note).toContain(
      'rfb-tributacao-2026',
    );
    expect(ALL_PARAMETERS.find((e) => e.key === 'minimumWage')?.note).toContain(
      'decreto-12797-2025-planalto',
    );
  });
});

describe('parameter sets and legal refs', () => {
  it('exposes the official set and its version', () => {
    expect(parameterSets).toEqual([
      { id: OFFICIAL_SET_ID, label: expect.any(String), simulation: false },
    ]);
    expect(PARAMETERS_VERSION).toMatch(/^\d{4}\.\d{2}\.\d{2}$/);
  });

  it('cites a parameter by its @refund/law provision (CLAUDE.md rule 3; engine review of E5)', () => {
    expect(legalRefOf(param('simples.fatorR.limit', '2026-06'))).toEqual({
      id: 'lc123-2006/art18/p5-j',
      label: 'LC 123/2006, art. 18, § 5º-J',
      url: 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm',
      verifiedAt: '2026-11-14',
      type: 'regulation',
      captureSha256: 'd660912f6ffaf94250a80a0fea1a8e35b9cdbb8a1f595e4673c6cfad7887820d',
    });
    // The window has one provision per period (D4): LC 123, § 5º-K up to 12/2026; Res. CGSN 190 from 01/2027.
    expect(legalRefOf(param('simples.fatorR.window', '2026-12'))?.id).toBe('lc123-2006/art18/p5-k');
    expect(legalRefOf(param('simples.fatorR.window', '2027-01'))?.id).toBe(
      'res-cgsn190-2026/art1/res140-art26',
    );
    // A non-law source is a 'procedure' ref, never a made-up law id; an uncaptured law gives no ref.
    expect(legalRefOf(param('simples.calculation', '2026-06'))?.type).toBe('procedure');
    expect(legalRefOf(param('calendar.nationalHolidays', '2026-06'))).toBeUndefined();
  });
});
