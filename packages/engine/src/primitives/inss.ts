// INSS primitives (ENGINE-SPEC C.3.3; rounding points C.8).
import { D, minCents, reais, roundToCents } from '../money.ts';
import { param } from '../parameters/index.ts';
import { type Anexo, type Cents, cents, type YearMonth } from '../types.ts';

/** Partner INSS on the pró-labore: r2(11% × min(P, ceiling)) → 932,31 at the ceiling. */
export function inssPartner(proLabore: Cents, month: YearMonth): Cents {
  const ceiling = param('inss.ceiling', month).value;
  const rate = param('inss.proLabore.rate', month).value;
  return roundToCents(reais(minCents(proLabore, ceiling)).times(rate));
}

/** Employee INSS: exact sum of the progressive brackets, one half-up rounding at the end (988,09 at the ceiling). */
export function inssEmployee(salary: Cents, month: YearMonth): Cents {
  const brackets = param('inss.employee.brackets', month).value;
  let total = D(0);
  let lower = 0;
  for (const b of brackets) {
    const slice = Math.min(salary, b.upTo) - lower;
    if (slice > 0) total = total.plus(reais(cents(slice)).times(b.rate));
    lower = b.upTo;
  }
  return roundToCents(total);
}

/** Employer CPP outside the DAS: only Anexo IV (LC 123, art. 18, § 5º-C); 0 in I, II, III and V (inside the DAS). */
export function cppOutsideDas(proLabore: Cents, anexo: Anexo, month: YearMonth): Cents {
  if (anexo !== 'IV') return cents(0);
  return roundToCents(reais(proLabore).times(param('inss.cpp.rate', month).value));
}
