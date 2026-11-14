// Projection (ENGINE-SPEC C.4): every month the engine reads, observed or projected.
// - Observed window: the 12 months up to `referenceMonth` (a month of the window missing from a series = 0).
// - Revenue outside the window: average of the 12 observed months, per market (`avg12`).
// - CLT payroll and the other taxable income outside the window: the same month of the observed year
//   (`sameMonthPriorYear`, which keeps the 13º and vacation); "months without data inside a window use the same
//   projection" (C.4), also backwards (PGDAS-D inference of the PAs before the statement).
// - Before the opening month every series is 0.

import type { ResolvedAssumptions } from './assumptions.ts';
import { EngineError } from './errors.ts';
import { D, roundToCents } from './money.ts';
import { inssPartner } from './primitives/inss.ts';
import { addMonths, compareYearMonth, monthOfDate, monthRange, monthsBetween } from './time.ts';
import {
  type Cents,
  cents,
  type Facts,
  type Market,
  type Series,
  type YearMonth,
} from './types.ts';

export interface Ctx {
  facts: Facts;
  assumptions: ResolvedAssumptions;
  referenceMonth: YearMonth;
  observed: YearMonth[]; // referenceMonth − 11 … referenceMonth
  openedIn: YearMonth;
  analysisYear: number;
  /** Current pró-labore P0: the gross pró-labore of the reference month (confirmed, D7). */
  p0: Cents;
  revenueAverage: Record<Market, Cents>;
}

const inWindow = (ctx: Ctx, m: YearMonth) =>
  compareYearMonth(m, ctx.observed[0] as YearMonth) >= 0 &&
  compareYearMonth(m, ctx.referenceMonth) <= 0;

/** Month of the observed window with the same calendar month as `m`. */
const cycleMonth = (ctx: Ctx, m: YearMonth): YearMonth => {
  const first = ctx.observed[0] as YearMonth;
  const k = ((monthsBetween(first, m) % 12) + 12) % 12;
  return addMonths(first, k);
};

const at = (s: Series, m: YearMonth): Cents => s[m] ?? cents(0);

export function createCtx(facts: Facts, assumptions: ResolvedAssumptions): Ctx {
  const referenceMonth = facts.referenceMonth;
  const observed = monthRange(addMonths(referenceMonth, -11), referenceMonth);
  const openedIn = monthOfDate(facts.company.value.openedOn);
  const ctx: Ctx = {
    facts,
    assumptions,
    referenceMonth,
    observed,
    openedIn,
    analysisYear: Number(facts.analysisDate.slice(0, 4)),
    p0: at(facts.partner.grossProLabore.value, referenceMonth),
    revenueAverage: { domestic: cents(0), export: cents(0) },
  };
  // avg12 over the observed months since the opening (C.4); rounded half-up to the cent (the spec gives no
  // rounding point for the average; exact for the personas — EXECUTION §9, E5).
  const months = observed.filter((m) => compareYearMonth(m, openedIn) >= 0);
  for (const market of ['domestic', 'export'] as const) {
    const series = facts.revenueByMarket[market].value;
    const total = months.reduce((acc, m) => acc + at(series, m), 0);
    ctx.revenueAverage[market] =
      months.length === 0
        ? cents(0)
        : roundToCents(D(total).dividedBy(months.length).dividedBy(100));
  }
  return ctx;
}

export function revenue(ctx: Ctx, market: Market, m: YearMonth): Cents {
  if (compareYearMonth(m, ctx.openedIn) < 0) return cents(0);
  if (inWindow(ctx, m)) return at(ctx.facts.revenueByMarket[market].value, m);
  return ctx.revenueAverage[market];
}

function cycled(ctx: Ctx, s: Series, m: YearMonth): Cents {
  if (compareYearMonth(m, ctx.openedIn) < 0) return cents(0);
  const source = inWindow(ctx, m) ? m : cycleMonth(ctx, m);
  if (compareYearMonth(source, ctx.openedIn) < 0) return cents(0);
  return at(s, source);
}

/** CLT payroll paid in `m` (cash): gross pay + FGTS + CPP outside the DAS (FS12 without pró-labore). */
export function cltPayroll(ctx: Ctx, m: YearMonth): { grossPay: Cents; fgts: Cents; cpp: Cents } {
  const p = ctx.facts.cltPayroll;
  return {
    grossPay: cycled(ctx, p.grossPay.value, m),
    fgts: cycled(ctx, p.fgtsPaid.value, m),
    cpp: cycled(ctx, p.cppOutsideDas.value, m),
  };
}

/** Pró-labore of the current situation in `m`: observed in the window, P0 elsewhere (C.4). */
export function currentProLabore(ctx: Ctx, m: YearMonth): Cents {
  if (compareYearMonth(m, ctx.openedIn) < 0) return cents(0);
  if (inWindow(ctx, m)) return at(ctx.facts.partner.grossProLabore.value, m);
  return ctx.p0;
}

/** Taxable income of the PF other than the pró-labore (salary, rent…), projected like the payroll. */
export function otherTaxableIncome(ctx: Ctx, m: YearMonth): Cents {
  const pf = ctx.facts.pfDetails.value;
  const source = inWindow(ctx, m) ? m : cycleMonth(ctx, m);
  const other = at(pf.monthlyTaxableIncome, source) - currentProLabore(ctx, source);
  return cents(Math.max(0, other));
}

/**
 * Official social security withheld on the other income (total INSS minus the partner INSS on the pró-labore). The
 * partner INSS removed from the observed total uses the parameters of `m` (the engine has no table before 2026).
 */
export function otherInss(ctx: Ctx, m: YearMonth): Cents {
  const pf = ctx.facts.pfDetails.value;
  const source = inWindow(ctx, m) ? m : cycleMonth(ctx, m);
  const other =
    at(pf.officialPensionDeductions, source) - inssPartner(currentProLabore(ctx, source), m);
  return cents(Math.max(0, other));
}

/** Fails closed for a company in its start of activity (C.3.5/C.7.5 are not fully specified for 2027; §9). */
export function assertNotStartOfActivity(ctx: Ctx, windowFrom: YearMonth): void {
  if (compareYearMonth(windowFrom, ctx.openedIn) < 0) {
    throw new EngineError(
      'START_OF_ACTIVITY_NOT_SUPPORTED',
      `window starting ${windowFrom} precedes the opening (${ctx.openedIn})`,
    );
  }
}
