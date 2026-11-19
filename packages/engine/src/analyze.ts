// Combined scenario (ENGINE-SPEC C.6, ADR-003): decisions chosen jointly, values attributed in the fixed order
// R01 → R05 → R06 → R04; total = cost(S0) − cost(S4), which telescopes to Σ marginals (INV-1).
// Public entry points return `Result`: no exception crosses the package (CLAUDE.md; EXECUTION §9, E5).
import { applyActionPlans } from './actions/build.ts';
import { resolveAssumptions } from './assumptions.ts';
import { toDomainError } from './errors.ts';
import { canonicalJson, sha256Hex } from './hash.ts';
import {
  OFFICIAL_SET_ID,
  PARAMETERS_VERSION,
  param,
  parameterEntries,
  withParameterSet,
} from './parameters/index.ts';
import { inferPgdas, type PgdasInference } from './pgdas.ts';
import { costReads, irMonths, projectedParametersStep } from './projected.ts';
import { type Ctx, createCtx } from './projection.ts';
import { a01Finding, a02Finding, partnerBelowMinimum } from './rules/alerts.ts';
import {
  appliesR01,
  earlyAlternativeSteps,
  gainOf,
  optimizerR01,
  r01Finding,
  thresholdR01,
} from './rules/r01.ts';
import { r02Finding } from './rules/r02.ts';
import { r03MeiFinding, r03SimplesFinding } from './rules/r03.ts';
import { optimizerR04, r04Finding } from './rules/r04.ts';
import {
  confidenceR05,
  eligibleR05,
  r05Finding,
  r05RecFinding,
  segregationStatus,
} from './rules/r05.ts';
import { appliesR06, r06Finding, r06QuestionFinding } from './rules/r06.ts';
import { annualPf, type ScenarioDecisions, type Simulation, simulate } from './scenario.ts';
import { addMonths, monthRange } from './time.ts';
import {
  type Confidence,
  cents,
  type EngineResult,
  type Facts,
  type Finding,
  type Result,
  type Total,
  type YearMonth,
} from './types.ts';
import { ENGINE_VERSION } from './version.ts';

/** C.6 `threshold(R05) = threshold(R06) = threshold(R04)` = R$ 1,00. */
const THRESHOLD_OTHERS = cents(100);

const parametersHashMemo = new Map<string, string>();
/** Hash of the records of the set in use (a scenario hashes differently from the official set). */
const parametersHash = (setId: string): string => {
  let hash = parametersHashMemo.get(setId);
  if (hash === undefined) {
    hash = sha256Hex(canonicalJson(parameterEntries(setId) ?? []));
    parametersHashMemo.set(setId, hash);
  }
  return hash;
};

const isAssumption = (o: { provenance: { origin: string } }) =>
  o.provenance.origin === 'default_assumption';

/** C.9 for R01: estimated when P0, the gross payroll or the revenue is an assumption; confirmed otherwise. */
function confidenceR01(facts: Facts): Confidence {
  const assumed = [
    facts.partner.grossProLabore,
    facts.cltPayroll.grossPay,
    facts.revenueByMarket.domestic,
    facts.revenueByMarket.export,
  ].some(isAssumption);
  return assumed ? 'estimated' : 'confirmed';
}

/** PAs after the last DAS of the statement and before `start` (C.4: no DAS paid yet). */
function pendingPas(ctx: Ctx): YearMonth[] {
  const paid = ctx.facts.dasPaid.value.map((p) => p.pa).sort();
  const last = paid.at(-1);
  if (last === undefined) return [];
  return monthRange(addMonths(last, 1), addMonths(ctx.assumptions.start, -1));
}

interface Chain {
  findings: Finding[];
  final: Simulation;
  curve?: EngineResult['optimizerCurve'];
  r05SwitchedOff: boolean;
  r06SwitchedOff: boolean;
}

function runChain(
  ctx: Ctx,
  s0: Simulation,
  s0Dec: ScenarioDecisions,
  inference: PgdasInference,
  r05Eligible: boolean,
  seg: boolean,
  mono: boolean,
): Chain {
  const findings: Finding[] = [];
  let cur = s0;
  let dec = s0Dec;
  let curve: Chain['curve'];

  // 1) R01, with the optimal decisions of the other levers already on (D2).
  if (appliesR01(ctx, s0)) {
    const plan = optimizerR01(ctx, s0Dec, seg, mono);
    curve = plan.curve;
    const d1: ScenarioDecisions = { ...dec, proLabore: plan.pStar };
    const s1 = simulate(ctx, 'S1', d1, s0Dec);
    const gain = gainOf(cur, s1);
    const threshold = thresholdR01(ctx, plan.rbt);
    const recommended = gain.regimeGain >= threshold;
    findings.push(
      r01Finding({
        ctx,
        plan,
        prev: cur,
        next: s1,
        gain,
        threshold,
        recommended,
        confidence: confidenceR01(ctx.facts),
      }),
    );
    if (recommended) {
      cur = s1;
      dec = d1;
    }
  }

  // 2) R05.
  let r05SwitchedOff = false;
  if (r05Eligible) {
    const d2: ScenarioDecisions = { ...dec, segregateExport: true };
    const s2 = simulate(ctx, 'S2', d2, s0Dec);
    const gain = gainOf(cur, s2);
    const recommended = gain.regimeGain >= THRESHOLD_OTHERS;
    r05SwitchedOff = !recommended;
    const f = r05Finding(
      ctx,
      cur,
      s2,
      gain,
      recommended,
      confidenceR05(ctx, inference),
      pendingPas(ctx),
    );
    f.trace = [...inference.steps, ...f.trace];
    findings.push(f);
    if (recommended) {
      cur = { ...s2 };
      dec = d2;
    }
  }

  // C.7.4: the "antecipar folha" alternative of R01, against the chain after R05 (F.3); trace only.
  const r01 = findings.find((f) => f.ruleId === 'R01');
  if (r01?.countsInTotal === true) {
    r01.trace.splice(r01.trace.length - 1, 0, ...earlyAlternativeSteps(ctx, cur, s0Dec));
  }

  // 3) R06: monofásico (D.6). Without `monofasicoPct` there is no estimate: an alert with no R$ (no default, M13).
  let r06SwitchedOff = false;
  if (appliesR06(ctx)) {
    if (ctx.assumptions.monofasicoPct === undefined) {
      findings.push(r06QuestionFinding());
    } else {
      const d3: ScenarioDecisions = { ...dec, segregateMonofasico: true };
      const s3 = simulate(ctx, 'S3', d3, s0Dec);
      const gain = gainOf(cur, s3);
      const recommended = gain.regimeGain >= THRESHOLD_OTHERS;
      r06SwitchedOff = !recommended;
      findings.push(r06Finding(ctx, cur, s3, gain, recommended));
      if (recommended) {
        cur = s3;
        dec = d3;
      }
    }
  }

  // 4) R04: annual IRPF of the analysis year with the pró-labore of S3 (D.4).
  if (ctx.facts.company.value.regime === 'SIMPLES') {
    const year = ctx.analysisYear;
    const pf = annualPf(ctx, dec, year);
    const input = {
      year,
      rt: pf.rt,
      fullDeductions: pf.fullDeductions,
      pgblContributed: ctx.facts.pfDetails.value.pgblContributedThisYear,
      contributesToRgps: ctx.facts.qualifications.contributesToRgps.value,
      redemptionRate: ctx.assumptions.pgblRedemptionRate,
    };
    const plan = optimizerR04(input);
    if (plan !== null && plan.contribution > 0) {
      const d4: ScenarioDecisions = { ...dec, pgblContribution: { [year]: plan.contribution } };
      const s4 = simulate(ctx, 'S4', d4, s0Dec);
      const gain = gainOf(cur, s4);
      if (gain.regimeGain >= THRESHOLD_OTHERS) {
        const confidence: Confidence = isAssumption(ctx.facts.pfDetails)
          ? 'estimated'
          : 'confirmed';
        const projected = projectedParametersStep('R04', [
          ...costReads(ctx),
          { key: 'irpf.pgbl.limit', months: irMonths(ctx) },
        ]);
        findings.push(
          r04Finding(input, plan, gain.gain12m, gain.regimeGain, confidence, projected),
        );
        cur = s4;
        dec = d4;
      }
    }
  }

  const out: Chain = { findings, final: cur, r05SwitchedOff, r06SwitchedOff };
  if (curve !== undefined) out.curve = curve;
  return out;
}

function run(facts: Facts, options?: { parameters?: string }): EngineResult {
  // ADR-013: an alternative set (parameters/scenarios/) is read only inside this call.
  const setId = options?.parameters ?? OFFICIAL_SET_ID;
  return withParameterSet(setId, () => runWith(facts, setId));
}

function runWith(facts: Facts, setId: string): EngineResult {
  const ctx = createCtx(facts, resolveAssumptions(facts));
  const findings: Finding[] = [];
  let total: Total = {
    savings12m: cents(0),
    annualRegimeSavings: null,
    byConfidence: { confirmed: cents(0), estimated: cents(0), depends_on_regulation: cents(0) },
    recoveryRange: null,
  };
  let optimizerCurve: EngineResult['optimizerCurve'];

  if (facts.company.value.regime === 'SIMPLES') {
    const inference = inferPgdas(ctx);
    const status = segregationStatus(ctx, inference);
    const start = ctx.assumptions.start;
    const sm = param('minimumWage', start).value;
    // S0 "atual regularizado" (D.1, T01-10): the same condition as A02 (decision D24, `partnerBelowMinimum`).
    const p0 = partnerBelowMinimum(ctx) !== null && ctx.p0 < sm ? sm : ctx.p0;
    const s0Dec: ScenarioDecisions = {
      proLabore: p0,
      segregateExport: status === 'yes',
      segregateMonofasico: false,
      pgblContribution: {},
    };
    const s0 = simulate(ctx, 'S0', s0Dec, s0Dec);
    const r05Eligible = eligibleR05(ctx, status);
    // C.6: mono* = eligibleR06 with `monofasicoPct` provided.
    const r06Ready = appliesR06(ctx) && ctx.assumptions.monofasicoPct !== undefined;
    let chain = runChain(ctx, s0, s0Dec, inference, r05Eligible, r05Eligible, r06Ready);
    // D2: a lever switched off for falling below its threshold → recompute the joint decisions without it.
    const seg = r05Eligible && !chain.r05SwitchedOff;
    const mono = r06Ready && !chain.r06SwitchedOff;
    if (seg !== r05Eligible || mono !== r06Ready) {
      chain = runChain(ctx, s0, s0Dec, inference, r05Eligible, seg, mono);
    }
    findings.push(...chain.findings);
    optimizerCurve = chain.curve;

    if (r05Eligible) {
      const rec = r05RecFinding(ctx, inference);
      if (rec !== null) {
        rec.trace = [...inference.steps, ...rec.trace];
        findings.push(rec);
      }
    }
    const byConfidence = { ...total.byConfidence };
    for (const f of findings) {
      if (f.countsInTotal)
        byConfidence[f.confidence] = cents(byConfidence[f.confidence] + f.marginalValue12m);
    }
    const recovery = findings.find((f) => f.type === 'recovery');
    total = {
      savings12m: cents(s0.cost12m.total - chain.final.cost12m.total),
      annualRegimeSavings: cents(s0.regimeCost.total - chain.final.regimeCost.total),
      byConfidence,
      recoveryRange: recovery?.range ?? null,
    };
  }

  // Alerts outside the chain (C.6: R02, R03, A01 and A02 change no decision and do not enter the sum).
  const regime = facts.company.value.regime;
  const r03 =
    regime === 'MEI' ? r03MeiFinding(ctx) : regime === 'SIMPLES' ? r03SimplesFinding(ctx) : null;
  if (r03 !== null) findings.push(r03);
  // A01's text ("No Simples, despesa da empresa não reduz imposto") holds for Simples and MEI only.
  if (regime === 'SIMPLES' || regime === 'MEI') {
    const a01 = a01Finding(ctx);
    if (a01 !== null) findings.push(a01);
  }
  const a02 = a02Finding(ctx);
  if (a02 !== null) findings.push(a02);

  const r02 = r02Finding({
    distributions: facts.partner.distributions.value,
    projectedAnnualTotalIncome: facts.pfDetails.value.projectedAnnualTotalIncome,
    selicAnnual: ctx.assumptions.selicAnnual,
    dividendRefundMonth: ctx.assumptions.dividendRefundMonth,
  });
  if (r02 !== null) findings.push(r02);

  findings.sort((a, b) => a.order - b.order);
  // C.12: "how to apply / how to receive" of each finding, from the catalog, after the combined scenario.
  applyActionPlans(findings, { facts, start: ctx.assumptions.start });
  const result: EngineResult = {
    engineVersion: ENGINE_VERSION,
    parametersVersion: PARAMETERS_VERSION,
    parametersHash: parametersHash(setId),
    inputsHash: sha256Hex(canonicalJson({ facts, parameters: setId })),
    findings,
    total,
  };
  if (optimizerCurve !== undefined) result.optimizerCurve = optimizerCurve;
  return result;
}

/** ARCHITECTURE §4.2 `analyze`, returning `Result` (codes: errors.ts). Pure and deterministic (INV-6). */
export function analyze(facts: Facts, options?: { parameters?: string }): Result<EngineResult> {
  try {
    return { ok: true, value: run(facts, options) };
  } catch (e) {
    return { ok: false, error: toDomainError(e) };
  }
}

/** Recalculates with edited assumptions (sliders). Same code in the browser. */
export function recalculate(
  facts: Facts,
  assumptions: Facts['assumptions'],
  options?: { parameters?: string },
): Result<EngineResult> {
  return analyze({ ...facts, assumptions }, options);
}
