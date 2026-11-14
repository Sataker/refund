// Trace steps (ENGINE-SPEC C.10; ARCHITECTURE §4.2 `Step`). Labels and formulas are user-visible: Portuguese.
import { legalRefOf } from './parameters/index.ts';
import type { ParameterKey, ParameterLookup } from './parameters/types.ts';
import type { Step, StepRounding, YearMonth } from './types.ts';

type StepInputs = Step['inputs'];

export interface StepSpec {
  id: string;
  label: string;
  formula: string;
  inputs: StepInputs;
  result: Step['result'];
  rounding: StepRounding;
  month?: YearMonth;
  parameter?: ParameterLookup<ParameterKey>;
}

/** Builds a Step; when it uses a parameter, `ref` points to the parameter's LegalRef (C.10). */
export function step(spec: StepSpec): Step {
  const out: Step = {
    id: spec.id,
    label: spec.label,
    formula: spec.formula,
    inputs: spec.inputs,
    result: spec.result,
    rounding: spec.rounding,
  };
  if (spec.month !== undefined) out.month = spec.month;
  if (spec.parameter !== undefined) {
    out.ref = legalRefOf(spec.parameter);
    if (spec.parameter.projected) out.projectedNote = projectedNote(spec.parameter, spec.month);
  }
  return out;
}

/** C.1, item 4: the trace says the parameter of the month was not published and which one was used. */
export function projectedNote(
  lookup: { effectiveFrom: YearMonth },
  month: YearMonth | undefined,
): string {
  const used = lookup.effectiveFrom.slice(0, 4);
  return month === undefined
    ? `parâmetro ainda não publicado; usado o de ${used}`
    : `parâmetro de ${month.slice(0, 4)} ainda não publicado; usado o de ${used}`;
}

/** Step id '<prefix>.<quantity>[.<month>]'. */
export const stepId = (prefix: string, quantity: string, month?: YearMonth): string =>
  month === undefined ? `${prefix}.${quantity}` : `${prefix}.${quantity}.${month}`;
