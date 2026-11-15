// R01: PF+PJ optimizer, Fator R and pró-labore (ENGINE-SPEC D.1, C.7; decisions D2, D13, D14).
import { D, Dec, reais, roundToCents } from '../money.ts';
import { param } from '../parameters/index.ts';
import { displayFatorR, fatorR, window } from '../primitives/simples.ts';
import { costReads, projectedParametersStep } from '../projected.ts';
import { type Ctx, cltPayroll, revenue } from '../projection.ts';
import {
  regimeCostModel,
  regimeStart,
  type ScenarioDecisions,
  type Simulation,
} from '../scenario.ts';
import { monthRange } from '../time.ts';
import { step } from '../trace.ts';
import {
  type Anexo,
  type Cents,
  cents,
  type Finding,
  type Step,
  type YearMonth,
} from '../types.ts';
import { base, formatBrl, formatMonth, nonNull, ORDER_OF } from './common.ts';
import { refsOf } from './refs.ts';

/** Rounds reais UP to the cent (T01-16). */
const ceilCent = (x: Dec): Cents => {
  const c = x.times(100).toDecimalPlaces(0, Dec.ROUND_CEIL);
  return cents(c.toNumber());
};

export interface R01Plan {
  rbt: Cents; // total steady-state RBT12 (C.4)
  fso: Cents; // steady-state FS12 without pró-labore
  target: Dec;
  pTarget: Cents;
  p28: Cents;
  pStar: Cents;
  curve: { monthlyProLabore: Cents; annualTotalCost: Cents }[];
  steps: Step[];
}

/** Steady-state RBT12 and FS12 without pró-labore, read from the first steady-state PA's windows. */
export function steadyBase(ctx: Ctx): { rbt: Cents; fso: Cents; pa: YearMonth } {
  const pa = regimeStart(ctx);
  const { windowFrom: wf, windowTo: wt, rbtFrom, rbtTo } = windows(pa);
  let rbt = 0;
  for (const m of monthRange(rbtFrom, rbtTo))
    rbt += revenue(ctx, 'domestic', m) + revenue(ctx, 'export', m);
  let fso = 0;
  for (const m of monthRange(wf, wt)) {
    const p = cltPayroll(ctx, m);
    fso += p.grossPay + p.fgts + p.cpp;
  }
  return { rbt: cents(rbt), fso: cents(fso), pa };
}

function windows(pa: YearMonth) {
  const [windowFrom, windowTo] = window(pa, 'simples.fatorR.window');
  const [rbtFrom, rbtTo] = window(pa, 'simples.rbt12.window');
  return { windowFrom, windowTo, rbtFrom, rbtTo };
}

/** Steady-state anexo for a constant pró-labore P, by the REAL rule (≥ 0,28; the margin is not the rule). */
export function regimeAnexo(ctx: Ctx, fso: Cents, rbt: Cents, p: Cents, pa: YearMonth): Anexo {
  const company = ctx.facts.companyDetails.value;
  if (!company.subjectToFatorR) return company.baseAnexo;
  const fr = fatorR(cents(fso + 12 * p), rbt, pa).value;
  return D(fr).gte(param('simples.fatorR.limit', pa).value) ? 'III' : 'V';
}

/**
 * Trigger of D.1: (a) subject to the Fator R and the Fator R of PA `start` < 0,28; or (b) P0 > minimum wage and,
 * with P = minimum wage, the steady-state Fator R stays ≥ 0,28 + margin (or the CNAE is not subject to it).
 */
export function appliesR01(ctx: Ctx, s0: Simulation): boolean {
  const facts = ctx.facts;
  if (facts.company.value.regime !== 'SIMPLES') return false;
  const company = facts.companyDetails.value;
  const start = ctx.assumptions.start;
  const first = s0.all[0];
  const limit = D(param('simples.fatorR.limit', start).value);
  const a = company.subjectToFatorR && first?.fatorR != null && D(first.fatorR).lt(limit);
  const sm = param('minimumWage', start).value;
  const p0 = s0.decisions.proLabore;
  let b = false;
  if (p0 > sm) {
    if (!company.subjectToFatorR) b = true;
    else {
      const { rbt, fso, pa } = steadyBase(ctx);
      const fr = fatorR(cents(fso + 12 * sm), rbt, pa).value;
      b = D(fr).gte(limit.plus(ctx.assumptions.fatorRMargin));
    }
  }
  return a || b;
}

/** D.1 `optimizerR01`: argmin of the steady-state cost WITH the other levers on (D2), then the safety margin. */
export function optimizerR01(
  ctx: Ctx,
  s0: ScenarioDecisions,
  seg: boolean,
  mono: boolean,
): R01Plan {
  const start = ctx.assumptions.start;
  const company = ctx.facts.companyDetails.value;
  const { rbt, fso, pa } = steadyBase(ctx);
  const limit = D(param('simples.fatorR.limit', pa).value);
  const target = limit.plus(ctx.assumptions.fatorRMargin);
  const pTarget = ceilCent(target.times(reais(rbt)).minus(reais(fso)).dividedBy(12));
  const p28 = ceilCent(limit.times(reais(rbt)).minus(reais(fso)).dividedBy(12));
  const sm = param('minimumWage', start).value;
  const ceiling = param('inss.ceiling', start).value;
  const p0 = s0.proLabore;

  const set = new Set<number>([sm, p0, pTarget, p28, 500000, 735000, ceiling]);
  const gridTop = Math.max(p0, pTarget) * 1.2;
  for (let p: number = sm; p <= gridTop; p += 5000) set.add(p);
  const candidates = [...set].filter((p) => p >= sm).sort((x, y) => x - y) as Cents[];

  const model = regimeCostModel(ctx, { ...s0, segregateExport: seg, segregateMonofasico: mono });
  const costCache = new Map<number, Cents>();
  const regimeCost = (p: Cents): Cents => {
    const hit = costCache.get(p);
    if (hit !== undefined) return hit;
    const c = model(p).total;
    costCache.set(p, c);
    return c;
  };

  const curve = candidates.map((p) => ({ monthlyProLabore: p, annualTotalCost: regimeCost(p) }));
  const min = Math.min(...curve.map((c) => c.annualTotalCost));
  // Tie (|Δ| < R$ 1,00) → the P closest to P0 (then the lower P).
  const tied = curve.filter((c) => c.annualTotalCost - min < 100);
  tied.sort(
    (x, y) =>
      Math.abs(x.monthlyProLabore - p0) - Math.abs(y.monthlyProLabore - p0) ||
      x.monthlyProLabore - y.monthlyProLabore,
  );
  const argmin = (tied[0] as (typeof curve)[number]).monthlyProLabore;
  let pStar = argmin;
  let raised = false;
  // Safety margin (D13): only RAISES the chosen P; never penalizes the status quo.
  if (
    company.subjectToFatorR &&
    pStar !== p0 &&
    regimeAnexo(ctx, fso, rbt, pStar, pa) === 'III' &&
    D(fso + 12 * pStar)
      .dividedBy(rbt)
      .lt(target)
  ) {
    pStar = cents(Math.max(pStar, pTarget));
    raised = true;
    if (regimeCost(pStar) >= regimeCost(p0)) pStar = p0;
  }

  const steps: Step[] = [
    step({
      id: 'R01.RBT12_REGIME',
      label: 'Receita bruta de 12 meses em regime (projeção)',
      formula: 'média dos 12 meses observados × 12, por mercado',
      inputs: {},
      result: { value: rbt, unit: 'cents' },
      rounding: 'NONE',
      month: pa,
    }),
    step({
      id: 'R01.FS12_WITHOUT_PRO_LABORE',
      label: 'Folha de 12 meses sem o pró-labore (CLT + FGTS)',
      formula:
        'Σ remuneração CLT paga + FGTS recolhido (+ CPP fora do DAS); CPP recolhida no DAS não somada à folha',
      inputs: {},
      result: { value: fso, unit: 'cents' },
      rounding: 'NONE',
      month: pa,
      parameter: param('simples.fatorR.payroll', pa),
    }),
    step({
      id: 'R01.P_28',
      label: 'Pró-labore mensal que leva o Fator R a exatamente 28%',
      formula: '(0,28 × RBT12 − folha sem pró-labore) ÷ 12, arredondado para cima ao centavo',
      inputs: {
        rbt12: { value: rbt, unit: 'cents' },
        fs12WithoutProLabore: { value: fso, unit: 'cents' },
      },
      result: { value: p28, unit: 'cents' },
      rounding: 'NONE',
      parameter: param('simples.fatorR.limit', pa),
    }),
    step({
      id: 'R01.P_TARGET',
      label: `Pró-labore mensal com folga de segurança (Fator R alvo ${target.times(100).toFixed()}%)`,
      formula:
        '((0,28 + folga) × RBT12 − folha sem pró-labore) ÷ 12, arredondado para cima ao centavo',
      inputs: {
        rbt12: { value: rbt, unit: 'cents' },
        fs12WithoutProLabore: { value: fso, unit: 'cents' },
        margin: { value: ctx.assumptions.fatorRMargin, unit: 'rate' },
      },
      result: { value: pTarget, unit: 'cents' },
      rounding: 'NONE',
    }),
    step({
      id: 'R01.ARGMIN',
      label: 'Pró-labore de menor custo anual em regime (curva)',
      formula: 'mínimo de DAS + INSS do sócio + IR do ajuste anual entre os candidatos',
      inputs: {
        candidates: { value: candidates.length, unit: 'months' },
        minimumCost: { value: min, unit: 'cents' },
      },
      result: { value: argmin, unit: 'cents' },
      rounding: 'NONE',
    }),
    step({
      id: 'R01.P_STAR',
      label: 'Pró-labore recomendado',
      formula: raised
        ? 'o de menor custo fica abaixo do Fator R alvo: elevado ao pró-labore com folga'
        : 'pró-labore de menor custo anual em regime',
      inputs: {
        argmin: { value: argmin, unit: 'cents' },
        pTarget: { value: pTarget, unit: 'cents' },
        currentProLabore: { value: p0, unit: 'cents' },
      },
      result: { value: pStar, unit: 'cents' },
      rounding: 'NONE',
    }),
  ];
  return { rbt, fso, target, pTarget, p28, pStar, curve, steps };
}

/** C.7.3: PA-by-PA table of the trace (window, FS12, RBT12, displayed Fator R, anexo, DAS before and after). */
export function paTable(prev: Simulation, next: Simulation, prefix: string): Step[] {
  const out: Step[] = [];
  next.horizon.forEach((r, i) => {
    const before = prev.horizon[i];
    out.push(
      step({
        id: `${prefix}.PA.${r.pa}`,
        label: `PA ${formatMonth(r.pa)}: janela ${formatMonth(r.windowFrom)}–${formatMonth(r.windowTo)}`,
        formula: 'Fator R = FS12 ÷ RBT12 (exibido truncado); ≥ 0,28 → Anexo III, < 0,28 → Anexo V',
        inputs: {
          windowFrom: { value: r.windowFrom, unit: 'text' },
          windowTo: { value: r.windowTo, unit: 'text' },
          fs12: { value: r.fs12, unit: 'cents' },
          rbt12: { value: r.rbt12.total, unit: 'cents' },
          fatorR: { value: r.fatorR === null ? '—' : displayFatorR(r.fatorR, r.pa), unit: 'text' },
          anexo: { value: r.anexo, unit: 'text' },
          dasBefore: { value: before?.das ?? 0, unit: 'cents' },
        },
        result: { value: r.das, unit: 'cents' },
        rounding: 'HALF_UP_CENT',
        month: r.pa,
        parameter: param('simples.fatorR.window', r.pa),
      }),
    );
  });
  return out;
}

export interface ChainGain {
  gain12m: Cents;
  regimeGain: Cents;
}

export const gainOf = (prev: Simulation, next: Simulation): ChainGain => ({
  gain12m: cents(prev.cost12m.total - next.cost12m.total),
  regimeGain: cents(prev.regimeCost.total - next.regimeCost.total),
});

/** threshold(R01) = max(R$ 3.000; 1% × total RBT12) (D14). */
export function thresholdR01(ctx: Ctx, rbt: Cents): Cents {
  const t = ctx.assumptions.r01Threshold;
  const pct = roundToCents(reais(rbt).times(t.rbt12Percentage));
  return cents(Math.max(t.absoluteMinimum, pct));
}

export const R01_REFS = refsOf([
  'lc123-2006/art18/p1-a',
  'lc123-2006/art18/p5-d',
  'lc123-2006/art18/p5-i',
  'lc123-2006/art18/p5-j',
  'lc123-2006/art18/p5-k',
  'lc123-2006/art18/p5-m',
  'lc123-2006/art18/p24',
  'res-cgsn140-2018/art26',
  'res-cgsn190-2026/art1/res140-art26',
  'lei9250-1995/art3-a',
  'lei9250-1995/art4/p2',
  'lei9250-1995/art10',
  'lei9250-1995/art11-a',
  'lei8212-1991/art12/v',
  'lei8212-1991/art21/caput',
  'lei8212-1991/art30/p4',
  'lei10666-2003/art4',
]);

export const R01_DO_NOT = [
  'Não registre pró-labore só no papel: ele precisa ser pago e informado no eSocial/DCTFWeb, com o INSS recolhido.',
  'Não conte como folha pagamentos a PJ ou a autônomo sem vínculo; distribuição de lucro e aluguel também não contam (LC 123, art. 18, § 24).',
  'Não aumente o pró-labore num único mês só para "bater" 28% sem trabalho correspondente.',
  'Não zere o pró-labore se você trabalha na empresa.',
];
export const R01_TRADEOFFS = [
  'Pró-labore maior aumenta o INSS e, acima de R$ 5 mil por mês, o IR retido na fonte.',
  'Pró-labore menor reduz a base da aposentadoria e dos benefícios do INSS e a renda comprovada para crédito.',
  'O Fator R é recalculado todo mês: se a receita crescer, a folha precisa acompanhar.',
];

export interface R01FindingInput {
  ctx: Ctx;
  plan: R01Plan;
  prev: Simulation;
  next: Simulation;
  gain: ChainGain;
  threshold: Cents;
  recommended: boolean;
  confidence: Finding['confidence'];
}

export function r01Finding(i: R01FindingInput): Finding {
  const { plan, prev, next, gain, threshold, recommended } = i;
  const p0 = prev.decisions.proLabore;
  const steadyAnexo = (next.regime[0] as { anexo: Anexo }).anexo;
  const reduces = plan.pStar < p0;
  let title: string;
  if (!recommended) {
    title = `Mudar o pró-labore não compensa: ganho de R$ ${formatBrl(gain.regimeGain)} por ano, abaixo do mínimo de R$ ${formatBrl(threshold)}`;
  } else if (reduces) {
    title = `Reduza o pró-labore para R$ ${formatBrl(plan.pStar)}/mês: R$ ${formatBrl(gain.regimeGain)} a menos de IR e INSS por ano`;
  } else {
    title = `Ajuste o pró-labore para R$ ${formatBrl(plan.pStar)}/mês e pague o Simples pelo Anexo ${steadyAnexo} a partir de ${formatMonth(next.regimeFrom)}`;
    if (gain.gain12m < 0) title += ` (compensa a partir de ${formatMonth(next.regimeFrom)})`;
  }
  const value12m = recommended ? gain.gain12m : cents(0);
  const regimeValue = recommended ? gain.regimeGain : cents(0);
  const trace: Step[] = [
    ...plan.steps,
    ...paTable(prev, next, 'R01'),
    ...nonNull(
      projectedParametersStep('R01', [
        ...costReads(i.ctx),
        { key: 'minimumWage', months: [i.ctx.assumptions.start] },
      ]),
    ),
    step({
      id: 'R01.COST_12M_BEFORE',
      label: 'Custo nos próximos 12 meses, situação atual',
      formula: 'Σ DAS + INSS do sócio + CPP fora do DAS + IR do ajuste anual',
      inputs: {
        das: { value: prev.cost12m.das, unit: 'cents' },
        inssPartner: { value: prev.cost12m.inssPartner, unit: 'cents' },
        irpfAdjustment: { value: prev.cost12m.irpfAdjustment, unit: 'cents' },
      },
      result: { value: prev.cost12m.total, unit: 'cents' },
      rounding: 'NONE',
    }),
    step({
      id: 'R01.COST_12M_AFTER',
      label: `Custo nos próximos 12 meses com pró-labore de R$ ${formatBrl(plan.pStar)}`,
      formula: 'Σ DAS + INSS do sócio + CPP fora do DAS + IR do ajuste anual',
      inputs: {
        das: { value: next.cost12m.das, unit: 'cents' },
        inssPartner: { value: next.cost12m.inssPartner, unit: 'cents' },
        irpfAdjustment: { value: next.cost12m.irpfAdjustment, unit: 'cents' },
      },
      result: { value: next.cost12m.total, unit: 'cents' },
      rounding: 'NONE',
    }),
    step({
      id: 'R01.REGIME_GAIN',
      label: `Economia por ano em regime (a partir de ${formatMonth(next.regimeFrom)})`,
      formula: 'custo anual em regime atual − custo anual em regime com o novo pró-labore',
      inputs: {
        before: { value: prev.regimeCost.total, unit: 'cents' },
        after: { value: next.regimeCost.total, unit: 'cents' },
        threshold: { value: threshold, unit: 'cents' },
      },
      result: { value: gain.regimeGain, unit: 'cents' },
      rounding: 'NONE',
    }),
    step({
      id: 'R01.MARGINAL_12M',
      label: recommended ? 'Economia nos próximos 12 meses' : 'Não compensa: valor considerado',
      formula: recommended
        ? 'custo de 12 meses atual − custo de 12 meses com o novo pró-labore'
        : 'ganho em regime abaixo do mínimo de max(R$ 3.000; 1% do RBT12): valor 0',
      inputs: {
        before: { value: prev.cost12m.total, unit: 'cents' },
        after: { value: next.cost12m.total, unit: 'cents' },
      },
      result: { value: value12m, unit: 'cents' },
      rounding: 'NONE',
    }),
  ];
  const out: Finding = {
    ...base(),
    ruleId: 'R01',
    order: ORDER_OF.R01,
    type: 'savings',
    title,
    marginalValue12m: value12m,
    annualRegimeValue: regimeValue,
    confidence: i.confidence,
    trace,
    refs: R01_REFS,
    doNot: R01_DO_NOT,
    tradeoffs: R01_TRADEOFFS,
    countsInTotal: recommended,
    assumptionsUsed: [
      `Folga de segurança no Fator R: ${D(i.ctx.assumptions.fatorRMargin).times(100).toFixed()} p.p.`,
      'Receita futura = média dos 12 meses observados; folha CLT futura = mesmo mês do ano anterior.',
      'CPP recolhida no DAS não somada à folha.',
    ],
  };
  if (recommended) out.regimeFrom = next.regimeFrom;
  if (i.confidence !== 'confirmed') out.range = [value12m, value12m];
  return out;
}
