// IRPF primitives (ENGINE-SPEC C.3.1 and C.3.2). Rounding points: C.8 (OR-IR-06/08/10).
import { D, type Dec, maxCents, minCents, reais, roundToCents, subCents } from '../money.ts';
import { param } from '../parameters/index.ts';
import type { IrReduction, IrTable } from '../parameters/types.ts';
import { step, stepId } from '../trace.ts';
import { type Cents, cents, type Step, type YearMonth } from '../types.ts';

/** Table tax: bracket of `base`; `r2(base × rate)` then minus the deduction amount (C.8; OR-IR-08). */
export function tableTaxOf(base: Cents, table: IrTable): Cents {
  const bracket = table.brackets.find((b) => b.upTo === null || base <= b.upTo);
  if (bracket === undefined) throw new RangeError('IR table without a last bracket');
  if (D(bracket.rate).isZero()) return cents(0);
  const gross = roundToCents(reais(base).times(bracket.rate));
  return maxCents(cents(0), subCents(gross, bracket.deduction));
}

/** Lei 15.270 reduction before the cap at the table tax: `r2(coefficient × RT)` is rounded first (OR-IR-06/10). */
export function reductionOf(rt: Cents, r: IrReduction): Cents {
  if (rt <= r.fullUpTo) return r.full;
  if (rt <= r.linearUpTo) {
    const product = roundToCents(reais(rt).times(r.coefficient));
    return maxCents(cents(0), subCents(r.constant, product));
  }
  return cents(0);
}

export interface MonthlyIrResult {
  deduction: Cents; // max(legal deductions, simplified discount)
  usedSimplifiedDiscount: boolean;
  base: Cents;
  tableTax: Cents;
  reduction: Cents;
  ir: Cents;
  steps: Step[];
}

/**
 * Monthly IR (cash: IRRF on pró-labore, salary, carnê-leão), ENGINE-SPEC C.3.1.
 * `rt` = gross taxable income of the month; the reduction uses RT, not the base (Receita, example 5).
 */
export function monthlyIr(
  rt: Cents,
  legalDeductions: Cents,
  nDependents: number,
  month: YearMonth,
  options: { stepPrefix?: string } = {},
): MonthlyIrResult {
  if (!Number.isSafeInteger(nDependents) || nDependents < 0) {
    throw new RangeError(`invalid number of dependents: ${nDependents}`);
  }
  const prefix = options.stepPrefix ?? 'IR';
  const table = param('irpf.monthly.table', month);
  const discount = param('irpf.monthly.simplifiedDiscount', month);
  const dependent = param('irpf.monthly.dependent', month);
  const reductionParam = param('irpf.monthly.reduction', month);

  const dedLeg = cents(legalDeductions + nDependents * dependent.value);
  const usedSimplifiedDiscount = discount.value > dedLeg;
  const deduction = usedSimplifiedDiscount ? discount.value : dedLeg;
  const base = maxCents(cents(0), subCents(rt, deduction));
  const tableTax = tableTaxOf(base, table.value);
  const reduction = minCents(reductionOf(rt, reductionParam.value), tableTax);
  const ir = subCents(tableTax, reduction);

  const steps = [
    step({
      id: stepId(prefix, 'BASE', month),
      label: usedSimplifiedDiscount
        ? 'Base com desconto simplificado mensal'
        : 'Base com deduções legais',
      formula: 'rendimento tributável − max(deduções legais, desconto simplificado)',
      inputs: {
        rt: { value: rt, unit: 'cents' },
        legalDeductions: { value: dedLeg, unit: 'cents' },
        simplifiedDiscount: { value: discount.value, unit: 'cents' },
      },
      result: { value: base, unit: 'cents' },
      rounding: 'NONE',
      month,
      parameter: discount,
    }),
    step({
      id: stepId(prefix, 'TABLE_TAX', month),
      label: 'Imposto pela tabela progressiva mensal',
      formula: 'base × alíquota (arredondado ao centavo) − parcela a deduzir',
      inputs: { base: { value: base, unit: 'cents' } },
      result: { value: tableTax, unit: 'cents' },
      rounding: 'HALF_UP_CENT',
      month,
      parameter: table,
    }),
    step({
      id: stepId(prefix, 'REDUCTION', month),
      label: 'Redução da Lei 15.270/2025',
      formula:
        'RT ≤ 5.000,00: até 312,89 · RT ≤ 7.350,00: 978,62 − 0,133145 × RT (arredondado ao centavo) · acima: 0; limitada ao imposto da tabela',
      inputs: { rt: { value: rt, unit: 'cents' }, tableTax: { value: tableTax, unit: 'cents' } },
      result: { value: reduction, unit: 'cents' },
      rounding: 'HALF_UP_CENT',
      month,
      parameter: reductionParam,
    }),
    step({
      id: stepId(prefix, 'IR', month),
      label: 'IR do mês',
      formula: 'imposto da tabela − redução',
      inputs: {
        tableTax: { value: tableTax, unit: 'cents' },
        reduction: { value: reduction, unit: 'cents' },
      },
      result: { value: ir, unit: 'cents' },
      rounding: 'NONE',
      month,
    }),
  ];

  return { deduction, usedSimplifiedDiscount, base, tableTax, reduction, ir, steps };
}

export interface AnnualIrModel {
  base: Cents;
  tableTax: Cents;
  reduction: Cents;
  ir: Cents;
}
export interface AnnualIrResult {
  model: 'simplified' | 'full';
  ir: Cents;
  reduction: Cents;
  simplified: AnnualIrModel & { discount: Cents };
  full: AnnualIrModel & { pgblDeduction: Cents };
}

/** `annualTable(base)`: same rule as the monthly one, with the annual table (C.3.2). */
export function annualTable(base: Cents, year: number): Cents {
  return tableTaxOf(base, param('irpf.annual.table', annualMonth(year)).value);
}

const annualMonth = (year: number): YearMonth => {
  if (!Number.isSafeInteger(year) || year < 1000 || year > 9999)
    throw new RangeError(`invalid year: ${year}`);
  return `${year}-12` as YearMonth;
};

/**
 * Annual IR (economic cost; R04), ENGINE-SPEC C.3.2. `fullDeductions` excludes PGBL (separate because of the 12% cap).
 * Ties go to the simplified model. At RT 60.000,01 the 2nd-bracket formula gives 2.695,23 > 2.694,15: that is the
 * text of the law (art. 11-A) and the engine does not "fix" it (T04-03).
 */
export function annualIr(
  year: number,
  rt: Cents,
  fullDeductions: Cents,
  pgbl: Cents,
  contributesToRgps: boolean,
): AnnualIrResult {
  const month = annualMonth(year);
  const table = param('irpf.annual.table', month).value;
  const discountParam = param('irpf.annual.simplifiedDiscount', month).value;
  const reductionParam = param('irpf.annual.reduction', month).value;
  const pgblLimit = param('irpf.pgbl.limit', month).value;

  const rtReais: Dec = reais(rt);
  const discount = minCents(roundToCents(rtReais.times(discountParam.rate)), discountParam.cap);
  const pgblDeduction = contributesToRgps
    ? minCents(pgbl, roundToCents(rtReais.times(pgblLimit)))
    : cents(0);

  const model = (base: Cents): AnnualIrModel => {
    const tableTax = tableTaxOf(base, table);
    const reduction = minCents(reductionOf(rt, reductionParam), tableTax);
    return { base, tableTax, reduction, ir: subCents(tableTax, reduction) };
  };

  const simplified = model(maxCents(cents(0), subCents(rt, discount)));
  const full = model(maxCents(cents(0), cents(rt - fullDeductions - pgblDeduction)));
  const pick = simplified.ir <= full.ir ? 'simplified' : 'full';
  const chosen = pick === 'simplified' ? simplified : full;
  return {
    model: pick,
    ir: chosen.ir,
    reduction: chosen.reduction,
    simplified: { ...simplified, discount },
    full: { ...full, pgblDeduction },
  };
}
