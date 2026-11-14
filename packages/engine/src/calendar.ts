// Civil-date arithmetic for the C.12.2 deadlines, without the JS clock type (ENGINE-SPEC C.1, item 3; C.12, item 4).
import { param } from './parameters/index.ts';
import { addMonths, civilDate, daysInMonth } from './time.ts';
import type { CivilDate, YearMonth } from './types.ts';

const parts = (d: CivilDate): [number, number, number] => {
  const [y, m, day] = civilDate(d).split('-').map(Number) as [number, number, number];
  return [y, m, day];
};
const fmt = (y: number, m: number, d: number): CivilDate =>
  civilDate(
    `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
  );

/** Days since 1970-01-01 (proleptic Gregorian; H. Hinnant's days_from_civil). */
function daysFromCivil(y0: number, m: number, d: number): number {
  const y = m <= 2 ? y0 - 1 : y0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(d: CivilDate): number {
  const [y, m, day] = parts(d);
  return (((daysFromCivil(y, m, day) + 4) % 7) + 7) % 7;
}

export function addDays(d: CivilDate, n: number): CivilDate {
  let [y, m, day] = parts(d);
  let left = n;
  while (left > 0) {
    day += 1;
    if (day > daysInMonth(y, m)) {
      day = 1;
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
    left -= 1;
  }
  return fmt(y, m, day);
}

/**
 * Same day and month `n` years later; a 29/02 with no counterpart goes to 01/03 (Lei 810/1949, arts. 1º and 3º;
 * ENGINE-SPEC C.12.2, T12-09).
 */
export function addYears(d: CivilDate, n: number): CivilDate {
  const [y, m, day] = parts(d);
  const year = y + n;
  if (day > daysInMonth(year, m)) return fmt(year, m + 1, 1);
  return fmt(year, m, day);
}

export function isBusinessDay(d: CivilDate): boolean {
  const wd = weekday(d);
  if (wd === 0 || wd === 6) return false;
  const [y] = parts(d);
  const md = d.slice(5);
  const holidays = param('calendar.nationalHolidays', `${y}-01` as YearMonth).value;
  return !holidays.some((h) => h.monthDay === md && y >= h.fromYear);
}

/** The date itself when it is a business day; otherwise the next one (CTN, art. 210, parágrafo único). */
export function nextBusinessDay(d: CivilDate): CivilDate {
  let out = d;
  while (!isBusinessDay(out)) out = addDays(out, 1);
  return out;
}

/** DAS due date: day 20 of the month after the PA, postponed to the next business day (Res. CGSN 140, art. 40, § 3º). */
export function dasDueDate(pa: YearMonth): CivilDate {
  const rule = param('simples.das.dueDate', pa).value;
  const m = addMonths(pa, rule.monthsAfterPa);
  return nextBusinessDay(civilDate(`${m}-${String(rule.day).padStart(2, '0')}`));
}

/** First month in which the federal refund of the PA can be claimed: PA + 4 months (Manual da Restituição 3.1.1). */
export function claimFrom(pa: YearMonth): YearMonth {
  return addMonths(pa, param('simples.refund.claimFromMonths', pa).value);
}

/**
 * Last day to claim: 5 years from the payment (CTN, art. 168, I), excluding the start day and including the due day,
 * moved to the next business day (CTN, art. 210; Lei 810/1949). Projected items use the estimated due date.
 */
export function claimUntil(paymentDate: CivilDate, pa: YearMonth): CivilDate {
  const years = param('statuteOfLimitations.years', pa).value;
  return nextBusinessDay(addYears(paymentDate, years));
}
