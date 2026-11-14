// Arithmetic in cents (ENGINE-SPEC C.1, item 1; C.8). Intermediate values are Decimal in REAIS at precision 34,
// half-up; they only become Cents at the rounding points of table C.8, always through `r2`/`toCents`.
import Decimal from 'decimal.js';
import { type Cents, cents, type Rate } from './types.ts';

export const Dec = Decimal.clone({ precision: 34, rounding: Decimal.ROUND_HALF_UP });
export type Dec = Decimal;

/** Decimal from a number, string, Rate or Decimal (ENGINE-SPEC notation `D(x)`). */
export const D = (x: Decimal.Value): Dec => new Dec(x);

const RATE_PATTERN = /^-?\d+(\.\d+)?$/;

/** Validates an exact decimal string and brands it as a Rate (ENGINE-SPEC C.1, item 2). */
export function rate(s: string): Rate {
  if (!RATE_PATTERN.test(s)) throw new RangeError(`invalid rate: ${s}`);
  return s as Rate;
}

/** Rate from a Decimal at full precision (no rounding: e.g. the Simples effective rate, C.8). */
export function rateOf(x: Dec): Rate {
  return rate(x.toFixed());
}

/** Rounds reais to the cent, half-up (ENGINE-SPEC `r2`). */
export const r2 = (x: Dec): Dec => x.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

/** Truncates to `places` decimals (display of the Fator R, OR-SN-11). */
export const truncate = (x: Dec, places: number): Dec =>
  x.toDecimalPlaces(places, Decimal.ROUND_DOWN);

/** Reais → Cents. Requires a value already at a rounding point (at most 2 decimals); never rounds silently. */
export function toCents(reais: Dec): Cents {
  const c = reais.times(100);
  if (!c.isInteger()) throw new RangeError(`not rounded to the cent: ${reais.toFixed()}`);
  return cents(c.toNumber());
}

/** Rounds reais half-up to the cent and converts (the usual rounding point of C.8). */
export const roundToCents = (reais: Dec): Cents => toCents(r2(reais));

/** Cents → reais (exact). */
export const reais = (c: Cents): Dec => D(c).dividedBy(100);

/** Sum of cents with no new rounding (C.8, last row); fails if the sum leaves the safe-integer range. */
export function sumCents(values: readonly Cents[]): Cents {
  let total = 0;
  for (const v of values) total += v;
  return cents(total);
}

export const subCents = (a: Cents, b: Cents): Cents => cents(a - b);

export const minCents = (a: Cents, b: Cents): Cents => (a <= b ? a : b);
export const maxCents = (a: Cents, b: Cents): Cents => (a >= b ? a : b);

/** Converts reais written in the Brazilian format of the spec ("4.664,68") to Cents. */
export function brl(text: string): Cents {
  if (!/^-?\d{1,3}(\.\d{3})*(,\d{2})?$|^-?\d+(,\d{2})?$/.test(text)) {
    throw new RangeError(`invalid BRL amount: ${text}`);
  }
  const normalized = text.replaceAll('.', '').replace(',', '.');
  return toCents(D(normalized));
}
