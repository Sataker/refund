// MEI primitives (ENGINE-SPEC A.4).
import { D, reais, roundToCents } from '../money.ts';
import { param } from '../parameters/index.ts';
import type { Cents, YearMonth } from '../types.ts';

/**
 * Revenue up to which the MEI excess is ≤ 20% (LC 123, art. 18-A, § 7º, III): 20% over the § 1º limit in force.
 * 97.200 in 2026; 132.000 in 2027 and 168.000 in 2028, conditioned on the LOA like the limit (LC 238, art. 3º).
 */
export function meiExcessLimit(month: YearMonth): { value: Cents; dependsOnRegulation: boolean } {
  const limit = param('mei.limit', month);
  const { tolerance } = param('mei.excess', month).value;
  return {
    value: roundToCents(reais(limit.value.annual).times(D(1).plus(tolerance))),
    dependsOnRegulation: limit.dependsOnRegulation,
  };
}
