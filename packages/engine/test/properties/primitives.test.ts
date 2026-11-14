// TESTS §2.4 and ENGINE-SPEC C.6: INV-3 (tax never negative; DAS per tax ≥ 0) and INV-4 (monotonicity) at the
// primitive level. numRuns: 200 locally, FC_NUM_RUNS (1000) in CI. The seed is printed on failure.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { inssEmployee, inssPartner } from '../../src/primitives/inss.ts';
import { annualIr, monthlyIr } from '../../src/primitives/irpf.ts';
import { dasForPa } from '../../src/primitives/simples.ts';
import { type Anexo, type Cents, cents, type YearMonth } from '../../src/types.ts';

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
const numRuns = Number(env?.FC_NUM_RUNS ?? 200);

const money = (max: number) => fc.integer({ min: 0, max }).map((n) => cents(n));
const month = fc.constantFrom<YearMonth>(
  '2026-01',
  '2026-07',
  '2026-12',
  '2027-01',
  '2027-08',
  '2028-12',
);
const anexo = fc.constantFrom<Anexo>('I', 'III', 'V');
// Up to the ISS/ICMS sublimit: in the 6th bracket ISS/ICMS leave the DAS and the effective rate drops by design
// (e.g. Anexo III: 17,51% at 3.600.000,00 → 15,00% just above), so monotonicity is only claimed up to 3,6 mi.
const rbt12 = money(360_000_000);
const revenue = money(40_000_000);

const isSafe = (c: Cents) => Number.isSafeInteger(c);

describe('INV-3: never negative, always integer cents', () => {
  it('DAS per tax ≥ 0 and the subtotal equals the sum of the taxes', () => {
    fc.assert(
      // Total RBT12 (domestic + export) within the Simples ceiling: merged markets use the total (C.3.4).
      fc.property(
        month,
        anexo,
        revenue,
        money(480_000_000),
        revenue,
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.boolean(),
        (m, a, rd, total, re, share, seg) => {
          const bd = cents(Math.floor(total * share));
          const be = cents(total - bd);
          const r = dasForPa({
            pa: m,
            anexo: a,
            domestic: { revenue: rd, rbt12: bd },
            export: { revenue: re, rbt12: be },
            segregateExport: seg,
          });
          for (const market of r.byMarket) {
            const taxes = Object.values(market.byTax);
            for (const v of taxes) expect(v >= 0 && isSafe(v)).toBe(true);
            expect(market.subtotal).toBe(taxes.reduce((s, v) => s + v, 0));
          }
          expect(r.das).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns },
    );
  });

  it('monthly and annual IR and INSS are ≥ 0', () => {
    fc.assert(
      fc.property(
        month,
        money(10_000_000),
        money(500_000),
        fc.integer({ min: 0, max: 5 }),
        (m, rt, ded, deps) => {
          const ir = monthlyIr(rt, ded, deps, m);
          expect(ir.ir >= 0 && ir.reduction >= 0 && ir.tableTax >= 0 && isSafe(ir.ir)).toBe(true);
          expect(inssPartner(rt, m)).toBeGreaterThanOrEqual(0);
          expect(inssEmployee(rt, m)).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns },
    );
    fc.assert(
      fc.property(
        money(100_000_000),
        money(10_000_000),
        money(5_000_000),
        fc.boolean(),
        (rt, ded, pgbl, rgps) => {
          const r = annualIr(2026, rt, ded, pgbl, rgps);
          expect(r.ir >= 0 && r.simplified.ir >= 0 && r.full.ir >= 0 && isSafe(r.ir)).toBe(true);
        },
      ),
      { numRuns },
    );
  });
});

describe('INV-4: monotonicity', () => {
  it('more revenue in the same anexo and RBT12 does not lower the DAS', () => {
    fc.assert(
      fc.property(month, anexo, revenue, money(1_000_000), rbt12, (m, a, rev, extra, rb) => {
        const das = (r: Cents) =>
          dasForPa({ pa: m, anexo: a, domestic: { revenue: r, rbt12: rb } }).das;
        expect(das(cents(rev + extra))).toBeGreaterThanOrEqual(das(rev));
      }),
      { numRuns },
    );
  });

  it('a larger RBT12 (higher effective rate) does not lower the DAS of the same revenue beyond rounding', () => {
    // revenue × e grows with the RBT12, but the DAS is rounded PER TAX (D12) and the apportionment changes between
    // brackets: each of the ≤ 6 taxes moves by up to ½ cent, so two totals can invert by up to 6 cents.
    // Found by fast-check: Anexo V, revenue 0,12, RBT12 0 → 0,01 and RBT12 360.000,01 → 0,00.
    const ROUNDING_SLACK = 6;
    fc.assert(
      fc.property(month, anexo, revenue, rbt12, money(50_000_000), (m, a, rev, rb, extra) => {
        const bigger = cents(Math.min(rb + extra, 360_000_000));
        const das = (b: Cents) =>
          dasForPa({ pa: m, anexo: a, domestic: { revenue: rev, rbt12: b } }).das;
        expect(das(bigger)).toBeGreaterThanOrEqual(das(rb) - ROUNDING_SLACK);
      }),
      { numRuns },
    );
  });

  it('more pró-labore does not lower INSS or the monthly IR', () => {
    fc.assert(
      fc.property(month, money(5_000_000), money(500_000), money(100_000), (m, p, ded, extra) => {
        const more = cents(p + extra);
        expect(inssPartner(more, m)).toBeGreaterThanOrEqual(inssPartner(p, m));
        expect(inssEmployee(more, m)).toBeGreaterThanOrEqual(inssEmployee(p, m));
        expect(monthlyIr(more, ded, 0, m).ir).toBeGreaterThanOrEqual(monthlyIr(p, ded, 0, m).ir);
      }),
      { numRuns },
    );
  });

  it('more taxable income does not lower the annual IR (same deductions)', () => {
    fc.assert(
      fc.property(money(50_000_000), money(5_000_000), money(1_000_000), (rt, ded, extra) => {
        const more = cents(rt + extra);
        expect(annualIr(2026, more, ded, cents(0), true).ir).toBeGreaterThanOrEqual(
          annualIr(2026, rt, ded, cents(0), true).ir,
        );
      }),
      { numRuns },
    );
  });
});
