// Dividend withholding (cash), ENGINE-SPEC C.3.6 and A.5. Not an economic cost (D3).
import { reais, roundToCents } from '../money.ts';
import { param } from '../parameters/index.ts';
import { type Cents, cents, type Distribution, type YearMonth } from '../types.ts';

export interface WithholdingResult {
  total: Cents; // distributions of the month from this payer, outside the 2025 transition
  withholding: Cents;
}

/**
 * 10% on the TOTAL paid in the month by the same PJ to the same resident PF when the total exceeds 50.000,00
 * (Lei 9.250, art. 6º-A, §§ 1º–2º; RFB Q&A Qs. 4 and 7). Profits through 2025 approved by 31/12/2025 are excluded (§ 3º).
 * `distributions` are those received by one PF.
 */
export function monthlyWithholding(
  month: YearMonth,
  payerCnpj: string,
  distributions: readonly Distribution[],
): WithholdingResult {
  const p = param('dividends.withholding', month).value;
  let total = 0;
  for (const d of distributions) {
    if (d.month !== month || d.payerCnpj !== payerCnpj || d.profitThrough2025Approved) continue;
    total += d.grossAmount;
  }
  const sum = cents(total);
  const withholding = sum > p.monthlyThreshold ? roundToCents(reais(sum).times(p.rate)) : cents(0);
  return { total: sum, withholding };
}
