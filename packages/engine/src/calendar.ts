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

/** The day before `d` (calendar). */
function previousDay(d: CivilDate): CivilDate {
  const [y, m, day] = parts(d);
  if (day > 1) return fmt(y, m, day - 1);
  if (m > 1) return fmt(y, m - 1, daysInMonth(y, m - 1));
  return fmt(y - 1, 12, 31);
}

/** The date itself when it is a business day; otherwise the previous one. */
export function previousBusinessDay(d: CivilDate): CivilDate {
  let out = d;
  while (!isBusinessDay(out)) out = previousDay(out);
  return out;
}

/** Calendar days from `from` to `to` (to − from; negative when `to` is earlier). */
export function daysBetween(from: CivilDate, to: CivilDate): number {
  const [y1, m1, d1] = parts(from);
  const [y2, m2, d2] = parts(to);
  return daysFromCivil(y2, m2, d2) - daysFromCivil(y1, m1, d1);
}

const dayOfMonthAfter = (competence: YearMonth, day: number): CivilDate =>
  civilDate(`${addMonths(competence, 1)}-${String(day).padStart(2, '0')}`);

/**
 * INSS withheld from the pró-labore of `competence`: day 20 of the following month, brought FORWARD to the previous
 * business day when there is no banking day (Lei 10.666/2003, art. 4º; the opposite of the DAS, research 08 §1).
 */
export function inssDueDate(competence: YearMonth): CivilDate {
  return previousBusinessDay(dayOfMonthAfter(competence, 20));
}

/**
 * eSocial S-1200/S-1299 and DCTFWeb of `competence`: day 15 of the following month, postponed to the next business day
 * (MOS eSocial S-1.3; IN RFB 2.005/2021, art. 10, as amended in 2023, per the RFB notice in research 08 [F23]).
 */
export function esocialDueDate(competence: YearMonth): CivilDate {
  return nextBusinessDay(dayOfMonthAfter(competence, 15));
}

/**
 * IRRF on dividends paid in `month` (DARF 1841): last business day of the 2nd decêndio (days 11–20) of the following
 * month (RFB, P&R Tributação de Altas Rendas, pergunta 6).
 */
export function secondDecendioLastBusinessDay(month: YearMonth): CivilDate {
  return previousBusinessDay(dayOfMonthAfter(month, 20));
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
