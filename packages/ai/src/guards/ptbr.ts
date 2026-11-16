// PT-BR number reading shared by the guards (ARCHITECTURE §4.5, REVISAO M6). Exact integer arithmetic only:
// a value is kept as `mantissa × 10^-scale`, never as a float, so "41,6 mil" is exactly 4.160.000 cents.

/** An exact decimal: value = mantissa / 10^scale. */
export interface Exact {
  mantissa: number;
  scale: number;
}

/** A PT-BR number: "41.600,00", "41,6", "1.234", "28". Dots group thousands, the comma is the decimal mark. */
export const NUM = String.raw`\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?`;

export function parsePtBr(raw: string): Exact | null {
  const [int = '', frac = ''] = raw.replaceAll('.', '').split(',');
  if (!/^\d+$/.test(int) || !/^\d*$/.test(frac)) return null;
  const mantissa = Number(int + frac);
  if (!Number.isSafeInteger(mantissa)) return null;
  return { mantissa, scale: frac.length };
}

/** A machine decimal from the trace ("0.2772", "-12.5", 0.15). */
export function parseMachine(value: string | number): Exact | null {
  const s = typeof value === 'number' ? String(value) : value.trim();
  const m = /^-?(\d+)(?:\.(\d+))?$/.exec(s);
  if (m === null) return null;
  const frac = m[2] ?? '';
  const mantissa = Number((m[1] ?? '') + frac);
  if (!Number.isSafeInteger(mantissa)) return null;
  return { mantissa, scale: frac.length };
}

/** `x × 10^exp` as an Exact (exp may be negative). */
export function shift(x: Exact, exp: number): Exact {
  if (exp >= x.scale) {
    const mantissa = x.mantissa * 10 ** (exp - x.scale);
    return { mantissa, scale: 0 };
  }
  return { mantissa: x.mantissa, scale: x.scale - exp };
}

/** Integer value of an Exact when it has no fractional part, else null. */
export function asInteger(x: Exact): number | null {
  if (x.scale === 0) return x.mantissa;
  const div = 10 ** x.scale;
  return x.mantissa % div === 0 ? x.mantissa / div : null;
}

/**
 * The integer `x × 10^digits`, truncated and rounded half-up (both are accepted as display rounding).
 * Only for |x| small enough to stay a safe integer (rates and percentages).
 */
export function atPrecision(x: Exact, digits: number): { trunc: number; round: number } {
  if (digits >= x.scale) {
    const v = x.mantissa * 10 ** (digits - x.scale);
    return { trunc: v, round: v };
  }
  const div = 10 ** (x.scale - digits);
  const trunc = Math.trunc(x.mantissa / div);
  const rest = x.mantissa - trunc * div;
  return { trunc, round: rest * 2 >= div ? trunc + 1 : trunc };
}

/** Folds accents and case for keyword matching ("milhões" → "milhoes"). */
export const fold = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
