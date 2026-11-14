// Parameter records (ENGINE-SPEC A and C.1, item 4). One record per row of tables A.1–A.5:
// `{key, value, source: {regulation, provision, url}, effectiveFrom, verifiedAt, status}`.
import type { Cents, CivilDate, Rate, SimplesBracket, Tax, YearMonth } from '../types.ts';

/** GLOSSARY §7: 'verified' (✅ primary or derived), 'to_confirm', '⚠️' (fallback in use; shows in the trace). */
export type ParameterStatus = 'verified' | 'to_confirm' | '⚠️';

export interface ParameterSource {
  regulation: string; // "LC 123/2006"
  provision: string; // "art. 18, § 5º-J"
  url: string; // primary source
}

/** Progressive table with deduction amounts (IRPF monthly and annual). `upTo: null` = last bracket. */
export interface IrTable {
  brackets: readonly { upTo: Cents | null; rate: Rate; deduction: Cents }[];
}

/** Lei 15.270 reduction (Lei 9.250, arts. 3º-A and 11-A). RT = gross taxable income. */
export interface IrReduction {
  fullUpTo: Cents; // RT ≤ this: reduction up to `full`
  full: Cents;
  linearUpTo: Cents; // RT ≤ this: `constant − coefficient × RT`; above: 0
  constant: Cents;
  coefficient: Rate;
}

export interface SimplesTableBracket {
  bracket: SimplesBracket;
  upTo: Cents | null; // RBT12 upper limit; null = last bracket
  nominal: Rate; // decimal (0.112)
  deduction: Cents;
  /** Percentages as written in the law ('13.64'); divided by 100 inside the engine (C.1, item 2). */
  apportionment: Partial<Record<Tax, Rate>>;
}

/** 5% ISS cap note (Anexo III, 5th bracket). The operator is subtraction: federal taxes split (e − 5%). */
export interface IssCap {
  bracket: SimplesBracket;
  threshold: Rate; // effective rate above which ISS is fixed (0.1492537)
  fixedIssRate: Rate; // 0.05 of revenue
  federalSplit: Partial<Record<Tax, Rate>>; // percentages, sum 100
}

export interface SimplesAnexoTable {
  brackets: readonly SimplesTableBracket[];
  issCap?: IssCap;
}

/** Window of RBT12/FS12 relative to the PA: [PA + startOffset, PA + endOffset]. */
export interface WindowRule {
  startOffset: number;
  endOffset: number;
}

export interface ParameterValues {
  // A.1 IRPF
  'irpf.monthly.table': IrTable;
  'irpf.monthly.simplifiedDiscount': Cents;
  'irpf.monthly.dependent': Cents;
  'irpf.monthly.reduction': IrReduction;
  'irpf.annual.table': IrTable;
  'irpf.annual.reduction': IrReduction;
  'irpf.annual.simplifiedDiscount': { rate: Rate; cap: Cents };
  'irpf.annual.dependent': Cents;
  'irpf.annual.education': Cents;
  'irpf.annual.health': string;
  'irpf.pgbl.limit': Rate;
  'irpf.pgbl.referenceRedemptionRate': Rate;
  // A.2 INSS and minimum wage
  'inss.employee.brackets': readonly { upTo: Cents; rate: Rate }[];
  'inss.ceiling': Cents;
  'inss.employee.maximum': Cents;
  'inss.proLabore.rate': Rate;
  'inss.proLabore.maximum': Cents;
  'inss.cpp.rate': Rate;
  minimumWage: Cents;
  // A.3 Simples Nacional
  'simples.anexo.I': SimplesAnexoTable;
  'simples.anexo.III': SimplesAnexoTable;
  'simples.anexo.V': SimplesAnexoTable;
  'simples.effectiveRate': { zeroRbt12Substitute: Cents };
  'simples.calculation': string;
  'simples.fatorR.limit': Rate;
  'simples.fatorR.formula': { zeroPayroll: Rate; zeroRevenue: Rate; displayDecimals: number };
  'simples.fatorR.payroll': string;
  'simples.fatorR.window': WindowRule;
  'simples.rbt12.window': WindowRule;
  'simples.rbt12.byMarket': boolean;
  'simples.export.exclude': readonly Tax[];
  'simples.export.concept': string;
  'simples.monofasico.exclude': readonly Tax[];
  'simples.limits': { me: Cents; epp: Cents; sublimit: Cents };
  'simples.excess': { tolerance: Rate; ceilingWithTolerance: Cents; sublimitWithTolerance: Cents };
  // A.4 MEI
  'mei.limit': { annual: Cents; monthlyAtStart: Cents };
  'mei.excess': { tolerance: Rate; limitWithTolerance: Cents };
  'mei.das.inss': Cents;
  'mei.das.icmsIss': { icms: Cents; iss: Cents };
  // A.5 Dividends, deadlines and rates
  'dividends.withholding': { monthlyThreshold: Cents; rate: Rate };
  'dividends.simples': string;
  'dividends.refund': { totalIncomeThreshold: Cents };
  'dividends.darf': { code: string; dueDate: string };
  'dividends.transition2025': string;
  'dividends.simplesExemption.limit': string;
  'irpfm.threshold': Cents;
  'selic.series': { sgsCode: number };
  'statuteOfLimitations.years': number;
}

export type ParameterKey = keyof ParameterValues;

export interface ParameterEntry<K extends ParameterKey = ParameterKey> {
  key: K;
  value: ParameterValues[K];
  source: ParameterSource;
  effectiveFrom: YearMonth;
  verifiedAt: CivilDate;
  status: ParameterStatus;
  /** Last month for which the value is published. After it, `param()` answers with `projected: true` (C.1, item 4). */
  publishedThrough?: YearMonth;
  /** ENGINE-SPEC A.4: value in force but conditional on a pending regulation (confidence `depends_on_regulation`). */
  dependsOnRegulation?: true;
  /** Derivation, fallback in use or how to close the open item (ENGINE-SPEC A, status column). */
  note?: string;
}

export type AnyParameterEntry = { [K in ParameterKey]: ParameterEntry<K> }[ParameterKey];

export interface ParameterLookup<K extends ParameterKey> {
  key: K;
  value: ParameterValues[K];
  source: ParameterSource;
  effectiveFrom: YearMonth;
  verifiedAt: CivilDate;
  status: ParameterStatus;
  projected: boolean;
  dependsOnRegulation: boolean;
}
