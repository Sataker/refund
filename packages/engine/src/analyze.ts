// Combined scenario (ENGINE-SPEC C.6, ADR-003): decisions chosen jointly, values attributed in the fixed order
// R01 → R05 → R06 → R04; total = cost(S0) − cost(S4), which telescopes to Σ marginals (INV-1).
// Public entry points return `Result`: no exception crosses the package (CLAUDE.md; EXECUTION §9, E5).
import { resolveAssumptions } from './assumptions.ts';
import { EngineError, toDomainError } from './errors.ts';
import { canonicalJson, sha256Hex } from './hash.ts';
import { ALL_PARAMETERS, OFFICIAL_SET_ID, PARAMETERS_VERSION, param } from './parameters/index.ts';
import { inferPgdas, type PgdasInference } from './pgdas.ts';
import { costReads, irMonths, projectedParametersStep } from './projected.ts';
import { type Ctx, createCtx } from './projection.ts';
import {
  appliesR01,
  gainOf,
  optimizerR01,
  R01_REFS,
  r01Finding,
  thresholdR01,
} from './rules/r01.ts';
import { R02_REFS, r02Finding } from './rules/r02.ts';
import { optimizerR04, R04_REFS, r04Finding } from './rules/r04.ts';
import {
  confidenceR05,
  eligibleR05,
  R05_REFS,
  REC_REFS,
  r05Finding,
  r05RecFinding,
  segregationStatus,
} from './rules/r05.ts';
import { annualPf, type ScenarioDecisions, type Simulation, simulate } from './scenario.ts';
import {
  type Confidence,
  cents,
  type EngineResult,
  type Facts,
  type Finding,
  type Result,
  type Total,
} from './types.ts';
import { ENGINE_VERSION } from './version.ts';

/** C.6 `threshold(R05) = threshold(R06) = threshold(R04)` = R$ 1,00. */
const THRESHOLD_OTHERS = cents(100);

let parametersHashMemo: string | undefined;
const parametersHash = (): string => {
  parametersHashMemo ??= sha256Hex(canonicalJson(ALL_PARAMETERS));
  return parametersHashMemo;
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

interface Chain {
  findings: Finding[];
  final: Simulation;
  curve?: EngineResult['optimizerCurve'];
  r05SwitchedOff: boolean;
}

function runChain(
  ctx: Ctx,
  s0: Simulation,
  s0Dec: ScenarioDecisions,
  inference: PgdasInference,
  r05Eligible: boolean,
  seg: boolean,
): Chain {
  const findings: Finding[] = [];
  let cur = s0;
  let dec = s0Dec;
  let curve: Chain['curve'];

  // 1) R01, with the optimal decisions of the other levers already on (D2).
  if (appliesR01(ctx, s0)) {
    const plan = optimizerR01(ctx, s0Dec, seg, false);
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
    const f = r05Finding(ctx, cur, s2, gain, recommended, confidenceR05(ctx, inference));
    f.trace = [...inference.steps, ...f.trace];
    findings.push(f);
    if (recommended) {
      cur = { ...s2 };
      dec = d2;
    }
  }

  // 3) R06: monofásico, E8 (returns null until then; S3 = S2).

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

  const out: Chain = { findings, final: cur, r05SwitchedOff };
  if (curve !== undefined) out.curve = curve;
  return out;
}

function run(facts: Facts, options?: { parameters?: string }): EngineResult {
  if (options?.parameters !== undefined && options.parameters !== OFFICIAL_SET_ID) {
    throw new EngineError('UNKNOWN_PARAMETER_SET', `unknown parameter set ${options.parameters}`);
  }
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
    // S0 "atual regularizado": a partner who works never stays below the minimum wage (D.1, T01-10; A02).
    const p0 = facts.partner.worksInCompany.value && ctx.p0 < sm ? sm : ctx.p0;
    const s0Dec: ScenarioDecisions = {
      proLabore: p0,
      segregateExport: status === 'yes',
      segregateMonofasico: false,
      pgblContribution: {},
    };
    const s0 = simulate(ctx, 'S0', s0Dec, s0Dec);
    const r05Eligible = eligibleR05(ctx, status);
    let chain = runChain(ctx, s0, s0Dec, inference, r05Eligible, r05Eligible);
    // D2: a lever switched off for falling below its threshold → recompute the joint decisions without it.
    if (r05Eligible && chain.r05SwitchedOff) {
      chain = runChain(ctx, s0, s0Dec, inference, r05Eligible, false);
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

  const r02 = r02Finding({
    distributions: facts.partner.distributions.value,
    projectedAnnualTotalIncome: facts.pfDetails.value.projectedAnnualTotalIncome,
    selicAnnual: ctx.assumptions.selicAnnual,
    dividendRefundMonth: ctx.assumptions.dividendRefundMonth,
  });
  if (r02 !== null) findings.push(r02);

  findings.sort((a, b) => a.order - b.order);
  const result: EngineResult = {
    engineVersion: ENGINE_VERSION,
    parametersVersion: PARAMETERS_VERSION,
    parametersHash: parametersHash(),
    inputsHash: sha256Hex(
      canonicalJson({ facts, parameters: options?.parameters ?? OFFICIAL_SET_ID }),
    ),
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

/** LegalRef.id → rules that cite it (ARCHITECTURE §4.2; the "law changed" flow). */
export const rulesByRef: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {};
  const add = (ruleId: string, refs: readonly { id: string }[]) => {
    for (const r of refs) {
      const list = out[r.id] ?? [];
      if (!list.includes(ruleId)) list.push(ruleId);
      out[r.id] = list;
    }
  };
  add('R01', R01_REFS);
  add('R05', R05_REFS);
  add('R05-REC', REC_REFS);
  add('R04', R04_REFS);
  add('R02', R02_REFS);
  return out;
})();
