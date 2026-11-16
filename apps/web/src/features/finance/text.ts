// Fixed copy and display formatting of the Finanças screen (IDENTITY-AND-UI Screen 5b, §2.3). Formatting only:
// every number arrives ready from `buildFinancialView` or from the finding (no sum, no subtraction, no percentage).
import { formatBRL, formatYearMonth } from '../../lib/format.ts';
import type { SealFinding, TaxSealKind } from './types.ts';

/** D27 chip labels. "gera crédito" is in the contract and shown nowhere in P0. */
export const SEAL_LABEL: Record<TaxSealKind, string> = {
  money_to_receive: 'tem dinheiro a receber',
  lower_tax: 'pode pagar menos',
  deductible: 'é dedutível',
  generates_credit: 'gera crédito',
  risk: 'é risco',
  attention: 'atenção',
};

export const DEDUCTIBLE_TEXT = 'Dedutível no Imposto de Renda, na declaração completa.';

/**
 * What goes next to the chip (ENGINE-SPEC E.9.2 "Seal text on screen"): the linked finding's own amount or title.
 * money_to_receive → range (R02 has none: its title, EXECUTION §9 16/11); lower_tax → marginalValue12m;
 * risk and attention → title; deductible → "na declaração completa".
 */
export function sealDetail(kind: TaxSealKind, finding: SealFinding | undefined): string {
  if (kind === 'deductible') return 'na declaração completa';
  if (finding === undefined) return '';
  if (kind === 'money_to_receive') {
    return finding.range === null
      ? finding.title
      : `${formatBRL(finding.range[0])} a ${formatBRL(finding.range[1])} · estimativa`;
  }
  if (kind === 'lower_tax') return `${formatBRL(finding.marginalValue12m)} a menos em 12 meses`;
  return finding.title;
}

/** Integer basis points → "49,82%" (string formatting of a ready value; 10000 → "100%"). */
export function formatBps(bps: number): string {
  if (!Number.isSafeInteger(bps)) throw new RangeError(`bps must be an integer: ${bps}`);
  const abs = Math.abs(bps);
  const cents = abs % 100;
  const whole = (abs - cents) / 100;
  const sign = bps < 0 ? '−' : '';
  return cents === 0 ? `${sign}${whole}%` : `${sign}${whole},${String(cents).padStart(2, '0')}%`;
}

/** "2026-07-10" → "10/07/2026". */
export function formatDate(date: string): string {
  const [y, m, d] = date.split('-');
  if (y === undefined || m === undefined || d === undefined)
    throw new RangeError(`invalid date: ${date}`);
  return `${d}/${m}/${y}`;
}

/** "R$ 8.925,00 · igual a set/2026" / "R$ 1.200,00 a mais que set/2026" / "… a menos que …". */
export function comparedTo(deltaCents: number, previousMonth: string): string {
  const prev = formatYearMonth(previousMonth);
  if (deltaCents === 0) return `igual a ${prev}`;
  const amount = formatBRL(Math.abs(deltaCents));
  return deltaCents > 0 ? `${amount} a mais que ${prev}` : `${amount} a menos que ${prev}`;
}

/** "+R$ 63.000,00" for a positive delta. */
export function signedBRL(cents: number): string {
  return cents > 0 ? `+${formatBRL(cents)}` : formatBRL(cents);
}

export const ORIGIN_LABEL = { rule: 'regra', llm: 'IA', user: 'você' } as const;

/** "2025-11" → "nov/25" (chart axis). */
export function shortMonth(ym: string): string {
  const full = formatYearMonth(ym);
  return `${full.slice(0, 3)}/${full.slice(-2)}`;
}

/** "10/07/2026", "10/07/2026 e 12/07/2026", "a, b e c". */
export function listDates(dates: readonly string[]): string {
  const f = dates.map(formatDate);
  if (f.length <= 1) return f.join('');
  return `${f.slice(0, -1).join(', ')} e ${f.at(-1)}`;
}
