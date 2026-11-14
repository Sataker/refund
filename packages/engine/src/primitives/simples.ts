// Simples Nacional primitives: effective rate, DAS per market rounded per tax, window, RBT12, FS12, Fator R and
// anexo (ENGINE-SPEC C.3.4, C.3.5; rounding points C.8; oracles B.3).
import { D, type Dec, rate, rateOf, reais, roundToCents, sumCents, truncate } from '../money.ts';
import { param } from '../parameters/index.ts';
import type {
  ParameterKey,
  ParameterLookup,
  SimplesAnexoTable,
  SimplesTableBracket,
} from '../parameters/types.ts';
import { addMonths, monthRange, monthsBetween } from '../time.ts';
import { step, stepId } from '../trace.ts';
import {
  type Anexo,
  type Cents,
  cents,
  type Market,
  type MarketDas,
  type Rate,
  type Series,
  type SimplesBracket,
  type Step,
  type Tax,
  type YearMonth,
} from '../types.ts';

const TABLE_KEYS = {
  I: 'simples.anexo.I',
  III: 'simples.anexo.III',
  V: 'simples.anexo.V',
} as const satisfies Partial<Record<Anexo, ParameterKey>>;

/** Anexo table in force in `month`. Anexos II and IV have no table in ENGINE-SPEC A.3 (no P0 persona uses them). */
export function anexoTable(anexo: Anexo, month: YearMonth): ParameterLookup<'simples.anexo.I'> {
  if (anexo !== 'I' && anexo !== 'III' && anexo !== 'V') {
    throw new RangeError(`Anexo ${anexo} has no table in ENGINE-SPEC A.3`);
  }
  return param(TABLE_KEYS[anexo], month) as ParameterLookup<'simples.anexo.I'>;
}

const toDec = (x: Cents | Dec): Dec => (typeof x === 'number' ? reais(x) : x);

export interface EffectiveRateResult {
  bracket: SimplesBracket;
  row: SimplesTableBracket;
  rbt12Used: Dec; // reais; RBT12 = 0 → 1 (item 8.1)
  effectiveRate: Dec; // no rounding (C.8; manual item 12)
}

/** `(RBT12 × nominal − deduction) ÷ RBT12`, full precision; RBT12 = 0 → 1 (LC 123, art. 18, § 1º-A; OR-SN-12). */
export function effectiveRate(
  rbt12: Cents | Dec,
  anexo: Anexo,
  month: YearMonth,
): EffectiveRateResult {
  const table = anexoTable(anexo, month).value;
  const raw = toDec(rbt12);
  if (raw.isNegative()) throw new RangeError(`negative RBT12: ${raw.toFixed()}`);
  const rb = raw.isZero()
    ? reais(param('simples.effectiveRate', month).value.zeroRbt12Substitute)
    : raw;
  const row = table.brackets.find((b) => b.upTo === null || rb.lte(reais(b.upTo)));
  if (row === undefined) {
    // Above R$ 4,8 mi the company leaves the Simples (excess rules: R03); no rate is specified here.
    throw new RangeError(`RBT12 ${rb.toFixed()} above the last bracket of Anexo ${anexo}`);
  }
  const e = rb.times(row.nominal).minus(reais(row.deduction)).dividedBy(rb);
  return { bracket: row.bracket, row, rbt12Used: rb, effectiveRate: e };
}

/** Effective-rate threshold of the 5% ISS cap note (Anexo III, 5th bracket), or null when the anexo has none. */
export function issThreshold(anexo: Anexo, month: YearMonth): Rate | null {
  return anexoTable(anexo, month).value.issCap?.threshold ?? null;
}

/**
 * Per-tax rate when the 5% ISS cap applies: ISS fixed at 5% of revenue; the federal taxes split (e − 5%)
 * (LC 123, Anexo III, note; the operator is subtraction).
 */
export function apportionmentWithFixedIss5(
  table: SimplesAnexoTable,
  e: Dec,
): Partial<Record<Tax, Dec>> | null {
  const cap = table.issCap;
  if (cap === undefined) return null;
  const federal = e.minus(cap.fixedIssRate);
  const out: Partial<Record<Tax, Dec>> = { ISS: D(cap.fixedIssRate) };
  for (const [tax, pct] of Object.entries(cap.federalSplit) as [Tax, Rate][]) {
    out[tax] = federal.times(D(pct).dividedBy(100));
  }
  return out;
}

export interface DasByMarketOptions {
  segregateExport?: boolean;
  segregateMonofasico?: boolean;
  monofasicoPct?: Rate;
  stepPrefix?: string;
}

/**
 * DAS of one market in one PA (C.3.4). The bracket comes from the MARKET's own RBT12 (D11). Each tax is
 * `r2(base_t × e × apportionment_t)` and the subtotal is the sum of the rounded taxes (D12; OR-SN-06).
 */
export function dasByMarket(
  revenue: Cents,
  marketRbt12: Cents | Dec,
  anexo: Anexo,
  market: Market,
  month: YearMonth,
  options: DasByMarketOptions = {},
): MarketDas & { steps: Step[] } {
  const tableLookup = anexoTable(anexo, month);
  const table = tableLookup.value;
  const { bracket, row, effectiveRate: e } = effectiveRate(marketRbt12, anexo, month);

  const cap = table.issCap;
  const capApplies = cap !== undefined && cap.bracket === bracket && e.gt(cap.threshold);
  const capRates = capApplies ? apportionmentWithFixedIss5(table, e) : null;

  const excluded = new Set<Tax>(
    market === 'export' && options.segregateExport === true
      ? param('simples.export.exclude', month).value
      : [],
  );
  const monoExcluded = new Set<Tax>(
    market === 'domestic' && options.segregateMonofasico === true
      ? param('simples.monofasico.exclude', month).value
      : [],
  );
  if (monoExcluded.size > 0 && options.monofasicoPct === undefined) {
    throw new RangeError(
      'segregateMonofasico requires monofasicoPct (ENGINE-SPEC D.6: no default)',
    );
  }

  const byTax: Partial<Record<Tax, Cents>> = {};
  const taxes = Object.keys(capRates ?? row.apportionment) as Tax[];
  for (const tax of taxes) {
    if (excluded.has(tax)) {
      byTax[tax] = cents(0);
      continue;
    }
    let base = reais(revenue);
    if (monoExcluded.has(tax)) base = base.times(D(1).minus(options.monofasicoPct ?? '0'));
    const capRate = capRates?.[tax];
    const pct = row.apportionment[tax];
    const value =
      capRate !== undefined
        ? base.times(capRate)
        : base.times(e).times(D(pct ?? '0').dividedBy(100));
    byTax[tax] = roundToCents(value);
  }
  const subtotal = sumCents(Object.values(byTax));
  const effective = rateOf(e);

  const prefix = options.stepPrefix ?? 'DAS';
  const quantity = market === 'export' ? 'EXPORT' : 'DOMESTIC';
  const steps = [
    step({
      id: stepId(prefix, `${quantity}.EFFECTIVE_RATE`, month),
      label: `Alíquota efetiva (${market === 'export' ? 'exportação' : 'mercado interno'}, Anexo ${anexo}, ${bracket}ª faixa)`,
      formula: '(RBT12 × alíquota nominal − parcela a deduzir) ÷ RBT12',
      inputs: {
        rbt12: { value: toDec(marketRbt12).times(100).toFixed(), unit: 'cents' },
        nominal: { value: row.nominal, unit: 'rate' },
        deduction: { value: row.deduction, unit: 'cents' },
      },
      result: { value: effective, unit: 'rate' },
      rounding: 'NONE',
      month,
      parameter: tableLookup,
    }),
    step({
      id: stepId(prefix, quantity, month),
      label: `DAS ${market === 'export' ? 'da exportação' : 'do mercado interno'}`,
      formula: capApplies
        ? 'ISS = 5% da receita; tributos federais = receita × (alíquota efetiva − 5%) × partilha; cada tributo arredondado ao centavo'
        : 'Σ por tributo de receita × alíquota efetiva × partilha (cada tributo arredondado ao centavo)',
      inputs: {
        revenue: { value: revenue, unit: 'cents' },
        effectiveRate: { value: effective, unit: 'rate' },
      },
      result: { value: subtotal, unit: 'cents' },
      rounding: 'HALF_UP_CENT',
      month,
      parameter: tableLookup,
    }),
  ];

  return { market, revenue, bracket, effectiveRate: effective, byTax, subtotal, steps };
}

export interface MarketInput {
  revenue: Cents;
  rbt12: Cents | Dec;
}
export interface DasForPaInput {
  pa: YearMonth;
  anexo: Anexo;
  domestic: MarketInput;
  export?: MarketInput;
  segregateExport?: boolean;
  segregateMonofasico?: boolean;
  monofasicoPct?: Rate;
  stepPrefix?: string;
}
export interface DasForPaResult {
  pa: YearMonth;
  anexo: Anexo;
  byMarket: MarketDas[];
  das: Cents;
  steps: Step[];
}

/**
 * DAS of one PA (C.3.4). Segregated: one calculation per market, each with its own RBT12. Not segregated (the
 * PGDAS-D filed everything as domestic): revenues merged into a single domestic market with the total RBT12.
 */
export function dasForPa(input: DasForPaInput): DasForPaResult {
  const { pa, anexo } = input;
  const segregateExport = input.segregateExport === true;
  const opts: DasByMarketOptions = { segregateExport };
  if (input.segregateMonofasico !== undefined) opts.segregateMonofasico = input.segregateMonofasico;
  if (input.monofasicoPct !== undefined) opts.monofasicoPct = input.monofasicoPct;
  if (input.stepPrefix !== undefined) opts.stepPrefix = input.stepPrefix;

  const markets: (MarketDas & { steps: Step[] })[] = [];
  if (input.export === undefined) {
    markets.push(
      dasByMarket(input.domestic.revenue, input.domestic.rbt12, anexo, 'domestic', pa, opts),
    );
  } else if (segregateExport) {
    markets.push(
      dasByMarket(input.domestic.revenue, input.domestic.rbt12, anexo, 'domestic', pa, opts),
    );
    markets.push(dasByMarket(input.export.revenue, input.export.rbt12, anexo, 'export', pa, opts));
  } else {
    const revenue = sumCents([input.domestic.revenue, input.export.revenue]);
    const rbt12 = toDec(input.domestic.rbt12).plus(toDec(input.export.rbt12));
    markets.push(dasByMarket(revenue, rbt12, anexo, 'domestic', pa, opts));
  }
  const byMarket = markets.map(({ steps: _steps, ...m }) => m);
  return {
    pa,
    anexo,
    byMarket,
    das: sumCents(byMarket.map((m) => m.subtotal)),
    steps: markets.flatMap((m) => m.steps),
  };
}

type WindowKey = 'simples.rbt12.window' | 'simples.fatorR.window';

/**
 * Window of the PA (C.3.5): up to PA 12/2026, PA−12…PA−1 (LC 123, § 5º-K); from PA 01/2027, PA−13…PA−2
 * (Res. CGSN 190/2026). PA 12/2026 and PA 01/2027 share the window dec/2025–nov/2026 (T01-08).
 */
export function window(
  pa: YearMonth,
  key: WindowKey = 'simples.rbt12.window',
): [YearMonth, YearMonth] {
  const w = param(key, pa).value;
  return [addMonths(pa, w.startOffset), addMonths(pa, w.endOffset)];
}

const sumWindow = (series: Series, [from, to]: [YearMonth, YearMonth]): Cents =>
  sumCents(monthRange(from, to).map((m) => series[m] ?? cents(0)));

/** RBT12 of one market (accrual basis). */
export function rbt12(pa: YearMonth, revenue: Series): Cents {
  return sumWindow(revenue, window(pa, 'simples.rbt12.window'));
}

export interface PayrollSeries {
  cltGrossPay: Series;
  fgtsPaid: Series;
  cppOutsideDas: Series;
  proLabore: Series;
}

/**
 * FS12 on a CASH basis (LC 123, art. 18, § 24). DECISION (C.3.5): the CPP paid inside the DAS is not added
 * (conservative: never inflates the Fator R; G12).
 */
export function fs12(pa: YearMonth, payroll: PayrollSeries): Cents {
  const w = window(pa, 'simples.fatorR.window');
  return sumCents([
    sumWindow(payroll.cltGrossPay, w),
    sumWindow(payroll.fgtsPaid, w),
    sumWindow(payroll.cppOutsideDas, w),
    sumWindow(payroll.proLabore, w),
  ]);
}

/** Display of the Fator R: truncated to 2 decimals (manual 8.2.1; OR-SN-11). Display only, never compared. */
export function displayFatorR(x: Rate, month: YearMonth = '2026-01'): Rate {
  const places = param('simples.fatorR.formula', month).value.displayDecimals;
  return rate(truncate(D(x), places).toFixed(places));
}

export interface FatorRResult {
  value: Rate; // full precision (compared against 0,28)
  display: Rate; // truncated to 2 decimals
  steps: Step[];
}

/** Fator R = FS12 ÷ RBT12 (total = domestic + export). FS12 = 0 → 0,01; RBT12 = 0 and FS12 > 0 → 0,28 (8.2.1). */
export function fatorR(
  fs12Value: Cents,
  rbt12Total: Cents,
  month: YearMonth,
  options: { stepPrefix?: string } = {},
): FatorRResult {
  if (fs12Value < 0 || rbt12Total < 0) throw new RangeError('negative FS12 or RBT12');
  const formula = param('simples.fatorR.formula', month);
  let value: Rate;
  if (rbt12Total === 0)
    value = fs12Value > 0 ? formula.value.zeroRevenue : formula.value.zeroPayroll;
  else if (fs12Value === 0) value = formula.value.zeroPayroll;
  else value = rateOf(D(fs12Value).dividedBy(rbt12Total));
  const display = displayFatorR(value, month);
  const steps = [
    step({
      id: stepId(options.stepPrefix ?? 'FATOR_R', 'FATOR_R', month),
      label: 'Fator R (folha de 12 meses ÷ receita de 12 meses)',
      formula: 'FS12 ÷ RBT12; exibido truncado em 2 casas',
      inputs: {
        fs12: { value: fs12Value, unit: 'cents' },
        rbt12: { value: rbt12Total, unit: 'cents' },
      },
      result: { value: display, unit: 'rate' },
      rounding: 'TRUNC_2_DECIMALS_DISPLAY',
      month,
      parameter: formula,
    }),
  ];
  return { value, display, steps };
}

/** Anexo of the PA: base anexo when the CNAE is not subject to the Fator R; else ≥ 0,28 → III, < 0,28 → V. */
export function anexoForPa(
  fatorRValue: Rate | null,
  company: { subjectToFatorR: boolean; baseAnexo: Anexo },
  month: YearMonth,
): Anexo {
  if (!company.subjectToFatorR) return company.baseAnexo;
  if (fatorRValue === null) throw new RangeError('Fator R required for a CNAE subject to it');
  return D(fatorRValue).gte(param('simples.fatorR.limit', month).value) ? 'III' : 'V';
}

export interface StartOfActivityRbt12 {
  /** FIRST_BRACKET: `rbt12` is 0, which `effectiveRate` reads as RBT12 = 1 → 1st bracket, effective = nominal. */
  rule: 'FIRST_BRACKET' | 'PA_TIMES_12' | 'AVERAGE_TIMES_12';
  monthOfActivity: number; // 1 = month of the opening
  rbt12: Dec; // reais, full precision
}

/**
 * RBT12 at the start of activity (LC 123, art. 18, § 2º), rule chosen by the PA's effective period
 * (`simples.startOfActivity`):
 * - up to PA 12/2026 (Res. CGSN 140, art. 22; manual 8.3): 1st month, revenue of the PA × 12; months 2–12,
 *   average of the months before the PA × 12;
 * - from PA 01/2027 (Res. CGSN 190/2026): months 1–2, 1st-bracket rate; months 3–13, average of the months
 *   before the month preceding the PA × 12; from the 14th month, the ordinary RBT12 (§ 4º).
 */
export function proportionalRbt12(
  pa: YearMonth,
  openedIn: YearMonth,
  revenue: Series,
): StartOfActivityRbt12 {
  const rule = param('simples.startOfActivity', pa).value;
  const monthOfActivity = monthsBetween(openedIn, pa) + 1;
  if (monthOfActivity < 1 || monthOfActivity > rule.untilMonthOfActivity) {
    throw new RangeError(
      `PA ${pa} is month ${monthOfActivity} of activity (opened ${openedIn}): outside the start-of-activity rule`,
    );
  }
  if (monthOfActivity <= rule.firstBracketMonths) {
    return { rule: 'FIRST_BRACKET', monthOfActivity, rbt12: D(0) };
  }
  if (monthOfActivity === 1 && rule.firstMonthRevenueTimes12) {
    return {
      rule: 'PA_TIMES_12',
      monthOfActivity,
      rbt12: reais(revenue[pa] ?? cents(0)).times(12),
    };
  }
  const months = monthRange(openedIn, addMonths(pa, rule.averageEndOffset));
  if (months.length === 0) throw new RangeError(`no months to average for PA ${pa}`);
  const total = sumCents(months.map((m) => revenue[m] ?? cents(0)));
  return {
    rule: 'AVERAGE_TIMES_12',
    monthOfActivity,
    rbt12: reais(total).dividedBy(months.length).times(12),
  };
}
