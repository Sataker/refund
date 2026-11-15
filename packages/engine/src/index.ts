// Public API of @refund/engine (ARCHITECTURE §4.2).
export const PACKAGE_NAME = '@refund/engine';

export { analyze, recalculate, rulesByRef } from './analyze.ts';
export type { EngineErrorCode } from './errors.ts';
export { brl, rate, roundToCents, sumCents } from './money.ts';
export {
  legalRefOf,
  OFFICIAL_SET_ID,
  PARAMETERS_VERSION,
  param,
  parameterSets,
} from './parameters/index.ts';
export type * from './parameters/types.ts';
export { monthlyWithholding, type WithholdingResult } from './primitives/dividends.ts';
export { cppOutsideDas, inssEmployee, inssPartner } from './primitives/inss.ts';
export {
  type AnnualIrResult,
  annualIr,
  annualTable,
  type MonthlyIrResult,
  monthlyIr,
} from './primitives/irpf.ts';
export { meiExcessLimit } from './primitives/mei.ts';
export {
  anexoForPa,
  type DasForPaInput,
  type DasForPaResult,
  dasByMarket,
  dasForPa,
  displayFatorR,
  effectiveRate,
  type FatorRResult,
  fatorR,
  fs12,
  issThreshold,
  type PayrollSeries,
  proportionalRbt12,
  rbt12,
  type StartOfActivityRbt12,
  window,
} from './primitives/simples.ts';
export {
  CNAE_ANEXO,
  type CnaeAnexoRow,
  cnaeAnexoRow,
  estimateByProfile,
  formatProfileRange,
  NO_RANGE_MESSAGES,
  rangeInThousands,
} from './profile.ts';
export { formatBrl } from './rules/common.ts';
export {
  addMonths,
  civilDate,
  compareYearMonth,
  monthRange,
  monthsBetween,
  yearMonth,
} from './time.ts';
export * from './types.ts';
export { ENGINE_VERSION } from './version.ts';
