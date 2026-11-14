import type { CivilDate } from '@refund/sources';
import type { YearMonth } from './types.ts';

// Civil-date helpers without `Date` (the Brasília time zone breaks dates; ARCHITECTURE §4.1).

/** National bank holidays (and Carnival) that fall on weekdays in the persona window. */
const BANK_HOLIDAYS: ReadonlySet<string> = new Set([
  '2025-11-20', // Dia Nacional de Zumbi e da Consciência Negra
  '2025-12-25',
  '2026-01-01',
  '2026-02-16', // Carnival (no banking)
  '2026-02-17',
  '2026-04-03', // Good Friday
  '2026-04-21',
  '2026-05-01',
  '2026-06-04', // Corpus Christi (no banking)
  '2026-09-07',
  '2026-10-12',
]);

export function ym(year: number, month: number): YearMonth {
  return `${year}-${String(month).padStart(2, '0')}` as YearMonth;
}

export function civil(year: number, month: number, day: number): CivilDate {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function addMonths(m: YearMonth, n: number): YearMonth {
  const [y, mm] = m.split('-').map(Number) as [number, number];
  const index = y * 12 + (mm - 1) + n;
  return ym(Math.floor(index / 12), (index % 12) + 1);
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** 0 = Sunday … 6 = Saturday (Sakamoto). */
export function dayOfWeek(year: number, month: number, day: number): number {
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4] as const;
  const y = month < 3 ? year - 1 : year;
  return (
    (y +
      Math.floor(y / 4) -
      Math.floor(y / 100) +
      Math.floor(y / 400) +
      (t[month - 1] ?? 0) +
      day) %
    7
  );
}

export function isBusinessDay(year: number, month: number, day: number): boolean {
  const dow = dayOfWeek(year, month, day);
  return dow !== 0 && dow !== 6 && !BANK_HOLIDAYS.has(civil(year, month, day));
}

/** The `n`-th business day of the month (n ≥ 1). */
export function nthBusinessDay(m: YearMonth, n: number): CivilDate {
  const [year, month] = m.split('-').map(Number) as [number, number];
  let count = 0;
  for (let day = 1; day <= daysInMonth(year, month); day++) {
    if (isBusinessDay(year, month, day) && ++count === n) return civil(year, month, day);
  }
  throw new RangeError(`month ${m} has fewer than ${n} business days`);
}

/** `day` if it is a business day, otherwise the closest earlier one (payment on or before a due date). */
export function businessDayOnOrBefore(m: YearMonth, day: number): CivilDate {
  const [year, month] = m.split('-').map(Number) as [number, number];
  for (let d = day; d >= 1; d--) if (isBusinessDay(year, month, d)) return civil(year, month, d);
  throw new RangeError(`no business day on or before ${m}-${day}`);
}

/** `day` if it is a business day, otherwise the next one in the same month. */
export function businessDayOnOrAfter(m: YearMonth, day: number): CivilDate {
  const [year, month] = m.split('-').map(Number) as [number, number];
  for (let d = day; d <= daysInMonth(year, month); d++) {
    if (isBusinessDay(year, month, d)) return civil(year, month, d);
  }
  throw new RangeError(`no business day on or after ${m}-${day}`);
}
