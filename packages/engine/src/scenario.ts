// Scenario simulation PA by PA (ENGINE-SPEC C.3.5, C.4, C.7) and the economic cost (C.5).
import { D, reais, roundToCents, sumCents } from './money.ts';
import { param } from './parameters/index.ts';
import { cppOutsideDas, inssPartner } from './primitives/inss.ts';
import { annualIr, monthlyIr } from './primitives/irpf.ts';
import { anexoForPa, dasForPa, fatorR, fatorRValue, window } from './primitives/simples.ts';
import {
  assertNotStartOfActivity,
  type Ctx,
  cltPayroll,
  currentProLabore,
  otherInss,
  otherTaxableIncome,
  revenue,
} from './projection.ts';
import { addMonths, compareYearMonth, monthRange, yearOf } from './time.ts';
import {
  type Anexo,
  type Cents,
  type Cost,
  cents,
  type Decisions,
  type PaResult,
  type Scenario,
  type Series,
  type YearMonth,
} from './types.ts';

/** What a scenario decides (C.2 `Decisions`, with the pró-labore as one constant value from `start`, C.7.1). */
export interface ScenarioDecisions {
  proLabore: Cents; // from `start` on
  segregateExport: boolean;
  segregateMonofasico: boolean;
  /** New PGBL contribution per calendar year (R04); the steady-state block repeats the analysis year's one. */
  pgblContribution: Record<number, Cents>;
}

export interface Simulation {
  id: Scenario['id'];
  decisions: ScenarioDecisions;
  horizon: PaResult[];
  regime: PaResult[];
  /** Every PA from `start` to the end of the steady-state block, contiguous (regimeFrom, PA-by-PA table). */
  all: PaResult[];
  cost12m: Cost;
  regimeCost: Cost;
  regimeFrom: YearMonth;
  irpf: Scenario['irpf'];
}

export const horizonPas = (ctx: Ctx): YearMonth[] =>
  monthRange(
    ctx.assumptions.start,
    addMonths(ctx.assumptions.start, ctx.assumptions.horizonMonths - 1),
  );

/** First PA whose FS12 window lies entirely inside the new scenario (C.4; hero: 2028-01). */
export function regimeStart(ctx: Ctx): YearMonth {
  const start = ctx.assumptions.start;
  let pa = start;
  while (compareYearMonth(window(pa, 'simples.fatorR.window')[0], start) < 0) pa = addMonths(pa, 1);
  return pa;
}

export const regimePas = (ctx: Ctx): YearMonth[] => {
  const first = regimeStart(ctx);
  return monthRange(first, addMonths(first, 11));
};

/** Pró-labore of the scenario in month `m`: the decision from `start`, the current one before. */
export const proLaboreAt = (ctx: Ctx, d: ScenarioDecisions, m: YearMonth): Cents =>
  compareYearMonth(m, ctx.assumptions.start) >= 0 ? d.proLabore : currentProLabore(ctx, m);

const sumOver = (months: YearMonth[], f: (m: YearMonth) => number): Cents =>
  sumCents(months.map((m) => cents(f(m))));

export interface PaInputs {
  rbt12: { domestic: Cents; export: Cents; total: Cents };
  fs12: Cents;
  windowFrom: YearMonth;
  windowTo: YearMonth;
}

/** RBT12 per market (accrual) and FS12 (cash) of a PA, with the window of its effective period (C.3.5). */
export function paInputs(ctx: Ctx, pa: YearMonth, proLabore: (m: YearMonth) => Cents): PaInputs {
  const [rf, rt] = window(pa, 'simples.rbt12.window');
  const [ff, ft] = window(pa, 'simples.fatorR.window');
  assertNotStartOfActivity(ctx, compareYearMonth(rf, ff) < 0 ? rf : ff);
  const rMonths = monthRange(rf, rt);
  const domestic = sumOver(rMonths, (m) => revenue(ctx, 'domestic', m));
  const exportRbt = sumOver(rMonths, (m) => revenue(ctx, 'export', m));
  const fMonths = monthRange(ff, ft);
  const fs12 = sumOver(fMonths, (m) => {
    const p = cltPayroll(ctx, m);
    return p.grossPay + p.fgts + p.cpp + proLabore(m);
  });
  return {
    rbt12: { domestic, export: exportRbt, total: cents(domestic + exportRbt) },
    fs12,
    windowFrom: ff,
    windowTo: ft,
  };
}

/** DAS of a PA under a given anexo and segregation (C.3.4), with the PA's own revenues. */
export function dasUnder(
  ctx: Ctx,
  pa: YearMonth,
  inputs: PaInputs,
  anexo: Anexo,
  segregateExport: boolean,
  stepPrefix?: string,
) {
  const input: Parameters<typeof dasForPa>[0] = {
    pa,
    anexo,
    domestic: { revenue: revenue(ctx, 'domestic', pa), rbt12: inputs.rbt12.domestic },
    export: { revenue: revenue(ctx, 'export', pa), rbt12: inputs.rbt12.export },
    segregateExport,
  };
  if (stepPrefix !== undefined) input.stepPrefix = stepPrefix;
  return dasForPa(input);
}

export function simulatePa(ctx: Ctx, d: ScenarioDecisions, pa: YearMonth): PaResult {
  const company = ctx.facts.companyDetails.value;
  const inputs = paInputs(ctx, pa, (m) => proLaboreAt(ctx, d, m));
  const fr = company.subjectToFatorR ? fatorR(inputs.fs12, inputs.rbt12.total, pa).value : null;
  const anexo = anexoForPa(fr, company, pa);
  const das = dasUnder(ctx, pa, inputs, anexo, d.segregateExport);
  const p = proLaboreAt(ctx, d, pa);
  const inss = inssPartner(p, pa);
  return {
    pa,
    rbt12: inputs.rbt12,
    fs12: inputs.fs12,
    windowFrom: inputs.windowFrom,
    windowTo: inputs.windowTo,
    fatorR: fr,
    anexo,
    byMarket: das.byMarket,
    das: das.das,
    inssPartner: inss,
    cppOutsideDas: cppOutsideDas(p, anexo, pa),
    irrfProLabore: monthlyIr(p, inss, ctx.facts.pfDetails.value.dependents, pa).ir,
  };
}

// ---------- IR of the annual adjustment (C.3.2, C.5 `mergedPf`) ----------

const PROFESSIONS = new Set([
  // Lei 9.250, art. 8º, II, a: professionals whose fees are deductible (Pix to a CPF; confirmed by card, E.6).
  'physician',
  'dentist',
  'psychologist',
  'physiotherapist',
  'speech_therapist',
  'occupational_therapist',
]);
const HEALTH_CNAE =
  /^(8610-1\/0[12]|8621-6\/0[12]|8630-5\/0[1-47]|8640-2\/(0\d|1[0-3])|8650-0\/0[3-6]|6550-2\/00)$/;

/** Deductible health (ENGINE-SPEC E.6 ✓ rows; holder and dependents only, Lei 9.250, art. 8º, § 2º, II). */
export function deductibleHealth(ctx: Ctx): Cents {
  return sumCents(
    ctx.facts.pfDetails.value.healthExpenses
      .filter(
        (h) =>
          h.beneficiary !== 'other' &&
          (HEALTH_CNAE.test(h.cnaeOrProfession) || PROFESSIONS.has(h.cnaeOrProfession)),
      )
      .map((h) => h.amount),
  );
}

/** Dependents, education (capped per person) and health: the deductions that do not depend on the scenario. */
export function fixedDeductions(ctx: Ctx, year: number): Cents {
  const month = `${year}-12` as YearMonth;
  const pf = ctx.facts.pfDetails.value;
  const dependent = param('irpf.annual.dependent', month).value;
  const cap = param('irpf.annual.education', month).value;
  const byPerson = new Map<string, number>();
  for (const e of pf.educationExpenses)
    byPerson.set(e.person, (byPerson.get(e.person) ?? 0) + e.amount);
  const education = [...byPerson.values()].reduce((acc, v) => acc + Math.min(v, cap), 0);
  return cents(pf.dependents * dependent + education + deductibleHealth(ctx));
}

/** RT and official INSS of a set of months, each month from the scenario `pick(m)` says. */
function pfOver(ctx: Ctx, months: YearMonth[], proLabore: (m: YearMonth) => Cents) {
  let rt = 0;
  let inss = 0;
  for (const m of months) {
    const p = proLabore(m);
    rt += otherTaxableIncome(ctx, m) + p;
    inss += otherInss(ctx, m) + inssPartner(p, m);
  }
  return { rt: cents(rt), inss: cents(inss) };
}

export function pgblAlready(ctx: Ctx, year: number): Cents {
  return year === ctx.analysisYear ? ctx.facts.pfDetails.value.pgblContributedThisYear : cents(0);
}

function irOf(ctx: Ctx, year: number, rt: Cents, inss: Cents, pgbl: Cents) {
  const rgps = ctx.facts.qualifications.contributesToRgps.value;
  return annualIr(year, rt, cents(inss + fixedDeductions(ctx, year)), pgbl, rgps);
}

/** Annual IR of `year` in the analysis year's terms (R04): RT of the year with the scenario's pró-labore. */
export function annualPf(ctx: Ctx, d: ScenarioDecisions, year: number) {
  const months = monthRange(`${year}-01` as YearMonth, `${year}-12` as YearMonth);
  const pf = pfOver(ctx, months, (m) => proLaboreAt(ctx, d, m));
  return { ...pf, fullDeductions: cents(pf.inss + fixedDeductions(ctx, year)) };
}

// ---------- Simulation and cost ----------

const provision = (ctx: Ctx, contribution: Cents): Cents =>
  roundToCents(reais(contribution).times(D(ctx.assumptions.pgblRedemptionRate)));

function costOf(pas: PaResult[], irpfAdjustment: Cents, pgblRedemptionProvision: Cents): Cost {
  const das = sumCents(pas.map((p) => p.das));
  const inss = sumCents(pas.map((p) => p.inssPartner));
  const cpp = sumCents(pas.map((p) => p.cppOutsideDas));
  return {
    das,
    inssPartner: inss,
    cppOutsideDas: cpp,
    irpfAdjustment,
    pgblRedemptionProvision,
    total: sumCents([das, inss, cpp, irpfAdjustment, pgblRedemptionProvision]),
  };
}

/**
 * Steady-state cost as a function of a constant pró-labore P, for the R01 optimizer (D.1). In the steady-state
 * block every FS12 window lies inside the new scenario, so FS12 = payroll without pró-labore + 12 × P, and the DAS
 * of each PA depends only on its anexo: it is computed once per anexo. Same numbers as `regimeCostOf` (tested).
 */
export function regimeCostModel(ctx: Ctx, base: Omit<ScenarioDecisions, 'proLabore'>) {
  const company = ctx.facts.companyDetails.value;
  const pas = regimePas(ctx).map((pa) => ({ pa, inputs: paInputs(ctx, pa, () => cents(0)) }));
  const dasCache = new Map<string, Cents>();
  const dasAt = (i: number, anexo: Anexo): Cents => {
    const key = `${i}|${anexo}`;
    let v = dasCache.get(key);
    if (v === undefined) {
      const { pa, inputs } = pas[i] as (typeof pas)[number];
      v = dasUnder(ctx, pa, inputs, anexo, base.segregateExport).das;
      dasCache.set(key, v);
    }
    return v;
  };
  const year = yearOf((pas[0] as (typeof pas)[number]).pa);
  const contribution = base.pgblContribution[ctx.analysisYear] ?? cents(0);
  return (p: Cents): Cost => {
    let das = 0;
    let inss = 0;
    let cpp = 0;
    pas.forEach(({ pa, inputs }, i) => {
      const fr = company.subjectToFatorR
        ? fatorRValue(cents(inputs.fs12 + 12 * p), inputs.rbt12.total, pa)
        : null;
      const anexo = anexoForPa(fr, company, pa);
      das += dasAt(i, anexo);
      inss += inssPartner(p, pa);
      cpp += cppOutsideDas(p, anexo, pa);
    });
    const pf = pfOver(
      ctx,
      pas.map((x) => x.pa),
      () => p,
    );
    const ir = irOf(ctx, year, pf.rt, pf.inss, contribution);
    const prov = provision(ctx, contribution);
    return {
      das: cents(das),
      inssPartner: cents(inss),
      cppOutsideDas: cents(cpp),
      irpfAdjustment: ir.ir,
      pgblRedemptionProvision: prov,
      total: cents(das + inss + cpp + ir.ir + prov),
    };
  };
}

/**
 * Cost over the 12 steady-state PAs (C.5; "at steady state, the 'year' is the block of 12 PAs itself"). The PGBL
 * contribution of the analysis year repeats every year at steady state.
 */
export function regimeCostOf(ctx: Ctx, d: ScenarioDecisions, regime?: PaResult[]): Cost {
  const pas = regime ?? regimePas(ctx).map((pa) => simulatePa(ctx, d, pa));
  const months = pas.map((p) => p.pa);
  const year = yearOf(months[0] as YearMonth);
  const pf = pfOver(ctx, months, () => d.proLabore);
  const contribution = d.pgblContribution[ctx.analysisYear] ?? cents(0);
  const ir = irOf(ctx, year, pf.rt, pf.inss, contribution);
  return costOf(pas, ir.ir, provision(ctx, contribution));
}

/**
 * Simulates the scenario: PA by PA from `start` to the end of the steady-state block, cost over the 12-month
 * horizon (IR of each calendar year touched, with `mergedPf`: the scenario's months inside the horizon and S0's
 * outside, C.5) and over the steady state.
 */
export function simulate(
  ctx: Ctx,
  id: Scenario['id'],
  d: ScenarioDecisions,
  s0: ScenarioDecisions,
): Simulation {
  const horizon = horizonPas(ctx);
  const regimeMonths = regimePas(ctx);
  const allMonths = monthRange(ctx.assumptions.start, regimeMonths[11] as YearMonth);
  const all = allMonths.map((pa) => simulatePa(ctx, d, pa));
  const byPa = new Map(all.map((r) => [r.pa, r]));
  const pick = (pas: YearMonth[]) => pas.map((pa) => byPa.get(pa) as PaResult);
  const horizonResults = pick(horizon);
  const regimeResults = pick(regimeMonths);

  const inHorizon = new Set(horizon);
  const years = [...new Set(horizon.map(yearOf))];
  const irpf: Scenario['irpf'] = {};
  let irTotal = 0;
  let provisions = 0;
  for (const year of years) {
    const months = monthRange(`${year}-01` as YearMonth, `${year}-12` as YearMonth);
    const pf = pfOver(ctx, months, (m) => proLaboreAt(ctx, inHorizon.has(m) ? d : s0, m));
    const contribution = d.pgblContribution[year] ?? cents(0);
    const ir = irOf(ctx, year, pf.rt, pf.inss, cents(pgblAlready(ctx, year) + contribution));
    irpf[year] = { rt: pf.rt, model: ir.model, tax: ir.ir, reduction: ir.reduction };
    irTotal += ir.ir;
    provisions += provision(ctx, contribution);
  }
  const cost12m = costOf(horizonResults, cents(irTotal), cents(provisions));
  const regimeCost = regimeCostOf(ctx, d, regimeResults);
  const steadyAnexo = (regimeResults[0] as PaResult).anexo;
  const regimeFrom = (all.find((r) => r.anexo === steadyAnexo) as PaResult).pa;
  return {
    id,
    decisions: d,
    horizon: horizonResults,
    regime: regimeResults,
    all,
    cost12m,
    regimeCost,
    regimeFrom,
    irpf,
  };
}

/** C.2 `Scenario` view of a simulation (Decisions.proLabore as a series per accrual month from `start`). */
export function toScenario(s: Simulation): Scenario {
  const proLabore: Series = {};
  for (const r of s.all) proLabore[r.pa] = s.decisions.proLabore;
  const decisions: Decisions = {
    proLabore,
    segregateExport: s.decisions.segregateExport,
    segregateMonofasico: s.decisions.segregateMonofasico,
    pgblContribution: s.decisions.pgblContribution,
  };
  return {
    id: s.id,
    decisions,
    pas: [...s.horizon, ...s.regime],
    irpf: s.irpf,
    cost12m: s.cost12m,
    regimeCost: s.regimeCost,
    regimeFrom: s.regimeFrom,
  };
}
