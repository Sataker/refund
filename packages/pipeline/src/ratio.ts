// Display percentages in integer basis points (1 bp = 0,01%; ARCHITECTURE §4.1: no float in the money path).
// EXECUTION E14b places this helper in @refund/engine `money.ts`; E8b owns the engine package while E14b runs, so it
// lives here until it moves (EXECUTION §9, 16/11). Same arithmetic as the engine: decimal.js, precision 34, half-up.
import Decimal from 'decimal.js';

const Dec = Decimal.clone({ precision: 34, rounding: Decimal.ROUND_HALF_UP });

/**
 * numerator ÷ denominator in basis points, rounded half-up (away from zero on a tie, as the engine's `Dec`).
 * Null when the denominator is zero (there is no ratio to show). Both arguments are integer cents.
 */
export function ratioBps(numerator: number, denominator: number): number | null {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) {
    throw new RangeError('ratioBps takes integer cents');
  }
  if (denominator === 0) return null;
  return new Dec(numerator)
    .times(10_000)
    .dividedBy(denominator)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
}
