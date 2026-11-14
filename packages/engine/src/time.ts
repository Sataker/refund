// Accrual-month arithmetic without the JS clock type (ENGINE-SPEC C.1, item 3).
import type { CivilDate, YearMonth } from './types.ts';

const YEAR_MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const CIVIL_DATE = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Validates and brands a "YYYY-MM" string. */
export function yearMonth(s: string): YearMonth {
  if (!YEAR_MONTH.test(s)) throw new RangeError(`invalid year-month: ${s}`);
  return s as YearMonth;
}

/** Validates a "YYYY-MM-DD" civil date (day checked against the month length, leap years included). */
export function civilDate(s: string): CivilDate {
  const m = CIVIL_DATE.exec(s);
  if (!m) throw new RangeError(`invalid civil date: ${s}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (Number(m[3]) > daysInMonth(year, month)) throw new RangeError(`invalid civil date: ${s}`);
  return s as CivilDate;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function toIndex(m: YearMonth): number {
  const parsed = YEAR_MONTH.exec(m);
  if (!parsed) throw new RangeError(`invalid year-month: ${m}`);
  return Number(parsed[1]) * 12 + (Number(parsed[2]) - 1);
}

function fromIndex(i: number): YearMonth {
  const year = Math.floor(i / 12);
  const month = (i % 12) + 1;
  return yearMonth(`${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`);
}

export const yearOf = (m: YearMonth): number => Math.floor(toIndex(m) / 12);
export const monthOf = (m: YearMonth): number => (toIndex(m) % 12) + 1;

/** `m` shifted by `n` months (n may be negative). */
export const addMonths = (m: YearMonth, n: number): YearMonth => {
  if (!Number.isSafeInteger(n)) throw new RangeError(`invalid month offset: ${n}`);
  return fromIndex(toIndex(m) + n);
};

/** Number of months from `a` to `b` (b − a): monthsBetween('2026-01', '2026-03') = 2. */
export const monthsBetween = (a: YearMonth, b: YearMonth): number => toIndex(b) - toIndex(a);

/** −1, 0 or 1, for sorting and comparisons. */
export const compareYearMonth = (a: YearMonth, b: YearMonth): number =>
  Math.sign(monthsBetween(b, a));

/** Inclusive list of months from `from` to `to` (empty when from > to). */
export function monthRange(from: YearMonth, to: YearMonth): YearMonth[] {
  const n = monthsBetween(from, to);
  const out: YearMonth[] = [];
  for (let i = 0; i <= n; i++) out.push(addMonths(from, i));
  return out;
}

/** Accrual month of a civil date ("2026-11-12" → "2026-11"). */
export const monthOfDate = (d: CivilDate): YearMonth => yearMonth(civilDate(d).slice(0, 7));
