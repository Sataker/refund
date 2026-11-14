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
  'simples.anexo.III',
  'simples.anexo.V',
  'simples.effectiveRate',
  'simples.export.exclude',
  'simples.monofasico.exclude',
  'simples.fatorR.limit',
  'simples.fatorR.formula',
  'simples.fatorR.window',
  'simples.rbt12.window',
  'dividends.withholding',
];

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
      for (const key of ['simples.anexo.I', 'simples.anexo.III', 'simples.anexo.V'] as const) {
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
      for (const key of ['simples.anexo.I', 'simples.anexo.III', 'simples.anexo.V'] as const) {
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
  });
});

describe('parameter sets and legal refs', () => {
  it('exposes the official set and its version', () => {
    expect(parameterSets).toEqual([
      { id: OFFICIAL_SET_ID, label: expect.any(String), simulation: false },
    ]);
    expect(PARAMETERS_VERSION).toMatch(/^\d{4}\.\d{2}\.\d{2}$/);
  });

  it('builds the LegalRef of a parameter (provisional id convention, aligned with @refund/law in E8)', () => {
    const ref = legalRefOf(param('simples.fatorR.limit', '2026-06'));
    expect(ref).toEqual({
      id: 'lc-123-2006-redacao-da-lc-155-2016#art-18-par-5-j-e-5-m',
      label: 'LC 123/2006 (redação da LC 155/2016), art. 18, §§ 5º-J e 5º-M',
      url: 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm',
      verifiedAt: '2026-11-12',
      type: 'regulation',
    });
  });
});
