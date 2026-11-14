// TESTS §2.1: money.ts and time.ts.
import { describe, expect, it } from 'vitest';
import {
  brl,
  D,
  maxCents,
  minCents,
  r2,
  rate,
  rateOf,
  reais,
  roundToCents,
  subCents,
  sumCents,
  toCents,
  truncate,
} from '../src/money.ts';
import {
  addMonths,
  civilDate,
  compareYearMonth,
  daysInMonth,
  monthOf,
  monthOfDate,
  monthRange,
  monthsBetween,
  yearMonth,
  yearOf,
} from '../src/time.ts';
import { cents } from '../src/types.ts';

describe('money', () => {
  it('cents() rejects non-integers and unsafe integers', () => {
    expect(() => cents(1.5)).toThrow(RangeError);
    expect(() => cents(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
    expect(cents(-3)).toBe(-3);
  });

  it('r2 rounds half-up to the cent (1.790,635 → 1.790,64, OR-IR-08)', () => {
    expect(r2(D('1790.635')).toFixed(2)).toBe('1790.64');
    expect(r2(D('665.7264')).toFixed(2)).toBe('665.73');
    expect(r2(D('0.004')).toFixed(2)).toBe('0.00');
    expect(r2(D('-0.005')).toFixed(2)).toBe('-0.01');
  });

  it('toCents never rounds silently; roundToCents rounds at the rounding point', () => {
    expect(() => toCents(D('1.005'))).toThrow(RangeError);
    expect(toCents(D('1.01'))).toBe(101);
    expect(roundToCents(D('1.005'))).toBe(101);
    expect(reais(cents(12345)).toFixed()).toBe('123.45');
  });

  it('precision 34 keeps repeating decimals (effective rate is not rounded, C.8)', () => {
    expect(D(55260).dividedBy(540000).toFixed()).toBe('0.1023333333333333333333333333333333');
  });

  it('truncate rounds down (display of the Fator R)', () => {
    expect(truncate(D('0.2799'), 2).toFixed(2)).toBe('0.27');
  });

  it('rate() validates exact decimal strings', () => {
    expect(rate('0.133145')).toBe('0.133145');
    expect(() => rate('1,5')).toThrow(RangeError);
    expect(() => rate('abc')).toThrow(RangeError);
    expect(rateOf(D('0.50'))).toBe('0.5');
  });

  it('brl() parses the Brazilian format of the spec', () => {
    expect(brl('4.664,68')).toBe(466468);
    expect(brl('100.000')).toBe(10000000);
    expect(brl('607,20')).toBe(60720);
    expect(brl('-1,00')).toBe(-100);
    expect(() => brl('1.5')).toThrow(RangeError);
    expect(() => brl('12,3')).toThrow(RangeError);
  });

  it('sums of cents add integers with no new rounding and stay safe', () => {
    expect(sumCents([cents(1), cents(2), cents(3)])).toBe(6);
    expect(() => sumCents([cents(Number.MAX_SAFE_INTEGER), cents(1)])).toThrow(RangeError);
    expect(subCents(cents(5), cents(7))).toBe(-2);
    expect(minCents(cents(1), cents(2))).toBe(1);
    expect(maxCents(cents(1), cents(2))).toBe(2);
  });
});

describe('time', () => {
  it('adds months across years in both directions', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2027-01', -13)).toBe('2025-12');
    expect(addMonths('2026-03', 0)).toBe('2026-03');
    expect(() => addMonths('2026-03', 0.5)).toThrow(RangeError);
  });

  it('counts months between accrual months', () => {
    expect(monthsBetween('2026-01', '2026-03')).toBe(2);
    expect(monthsBetween('2027-02', '2026-01')).toBe(-13);
    expect(compareYearMonth('2026-12', '2027-01')).toBe(-1);
    expect(compareYearMonth('2027-01', '2027-01')).toBe(0);
    expect(compareYearMonth('2027-02', '2027-01')).toBe(1);
  });

  it('lists inclusive ranges', () => {
    expect(monthRange('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(monthRange('2026-02', '2026-01')).toEqual([]);
  });

  it('validates year-months and civil dates (leap years included)', () => {
    expect(yearMonth('2026-11')).toBe('2026-11');
    expect(() => yearMonth('2026-13')).toThrow(RangeError);
    expect(() => yearMonth('26-11')).toThrow(RangeError);
    expect(civilDate('2024-02-29')).toBe('2024-02-29');
    expect(() => civilDate('2026-02-29')).toThrow(RangeError);
    expect(() => civilDate('2026-04-31')).toThrow(RangeError);
    expect(() => civilDate('2026-4-1')).toThrow(RangeError);
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(monthOfDate('2026-11-12')).toBe('2026-11');
    expect(yearOf('2027-01')).toBe(2027);
    expect(monthOf('2027-01')).toBe(1);
  });
});
