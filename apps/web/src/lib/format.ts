// pt-BR display of engine values (IDENTITY-AND-UI §4.5). Integer arithmetic only: cents never become
// floats here (CLAUDE.md rule 2), the split into reais/cents is exact for any safe integer.

const GROUPING = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0, useGrouping: true });

/** Thin non-breaking space between "R$" and the number (§4.5). */
export const THIN_NBSP = ' ';

export interface MoneyParts {
  negative: boolean;
  /** Integer part with pt-BR grouping, e.g. "62.318". */
  reais: string;
  /** Always two digits, e.g. "92". */
  cents: string;
}

export function moneyParts(cents: number): MoneyParts {
  if (!Number.isSafeInteger(cents)) throw new RangeError(`cents must be a safe integer: ${cents}`);
  const abs = Math.abs(cents);
  const centPart = abs % 100;
  const reais = (abs - centPart) / 100;
  return {
    negative: cents < 0,
    reais: GROUPING.format(reais),
    cents: String(centPart).padStart(2, '0'),
  };
}

/** "R$ 62.318,92" (with a thin non-breaking space). */
export function formatBRL(cents: number): string {
  const p = moneyParts(cents);
  return `${p.negative ? '−' : ''}R$${THIN_NBSP}${p.reais},${p.cents}`;
}

/** "R$ 62.318" — whole reais, for headlines; the calculation shows the cents (§4.5). */
export function formatBRLWhole(cents: number): string {
  const p = moneyParts(cents);
  return `${p.negative ? '−' : ''}R$${THIN_NBSP}${p.reais}`;
}

/** "R$ 62,3 mil" — short form for the spoken/video number (ENGINE-SPEC F.4), truncated, never rounded up. */
export function formatBRLThousands(cents: number): string {
  const abs = Math.abs(cents);
  const hundreds = (abs - (abs % 10_000)) / 10_000; // units of R$ 100
  const whole = (hundreds - (hundreds % 10)) / 10;
  const tenth = hundreds % 10;
  const sign = cents < 0 ? '−' : '';
  return `${sign}R$${THIN_NBSP}${GROUPING.format(whole)}${tenth === 0 ? '' : `,${tenth}`} mil`;
}

/** Spoken value for aria-live (§4.9: "Encontramos 23 mil 480 reais"): "62.318 reais e 92 centavos". */
export function speakBRL(cents: number): string {
  const p = moneyParts(cents);
  const reais = `${p.reais} ${p.reais === '1' ? 'real' : 'reais'}`;
  return p.cents === '00' ? reais : `${reais} e ${Number(p.cents)} centavos`;
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** YearMonth "2027-04" → "abr/2027". */
export function formatYearMonth(ym: string): string {
  const [year, month] = ym.split('-');
  const name = MONTHS[Number(month) - 1];
  if (year === undefined || name === undefined) throw new RangeError(`invalid YearMonth: ${ym}`);
  return `${name}/${year}`;
}

/**
 * Rate as a decimal string → percent, truncated (never rounded up) to `decimals`: "0.27722" → "27,72%",
 * "0.28" → "28%". String arithmetic only.
 */
export function formatRatePercent(rate: string, decimals = 2): string {
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(rate);
  if (!m) throw new RangeError(`invalid rate: ${rate}`);
  const [, sign = '', int = '0', frac = ''] = m;
  const digits = frac.padEnd(2 + decimals, '0');
  const whole = String(Number(`${int}${digits.slice(0, 2)}`));
  const rest = digits.slice(2, 2 + decimals).replace(/0+$/, '');
  return `${sign}${whole}${rest === '' ? '' : `,${rest}`}%`;
}

/** Rate as a decimal string ("0.28") → "0,28" (no float conversion). */
export function formatRateDecimal(rate: string): string {
  return rate.replace('.', ',');
}
