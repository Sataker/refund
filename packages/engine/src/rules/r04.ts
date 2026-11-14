// R04: full × simplified IRPF with Lei 15.270 and PGBL as deferral (ENGINE-SPEC D.4; D9).

import { D, reais, roundToCents } from '../money.ts';
import { param } from '../parameters/index.ts';
import { annualIr } from '../primitives/irpf.ts';
import { civilDate } from '../time.ts';
import { step } from '../trace.ts';
import { type Cents, cents, type Finding, type Rate, type Step, type YearMonth } from '../types.ts';
import { base, formatBrl, ORDER_OF } from './common.ts';
import { refsOf } from './refs.ts';

export interface R04Input {
  year: number;
  rt: Cents;
  fullDeductions: Cents; // official INSS + dependents + education + deductible health (+ alimony)
  pgblContributed: Cents;
  contributesToRgps: boolean;
  redemptionRate: Rate;
}

export interface R04Plan {
  baseIr: Cents;
  baseModel: 'simplified' | 'full';
  contribution: Cents; // a*
  gain: Cents; // real gain, net of the redemption provision
  cashBenefit: Cents; // less IR in the adjustment
  provision: Cents;
  maxContribution: Cents;
}

/**
 * D.4 `optimizerR04`. Null when there is no IR under the best model or RT ≤ 60.000,00 (trigger). Returns a plan with
 * `contribution = 0` when no PGBL contribution gains ≥ R$ 1,00.
 */
export function optimizerR04(i: R04Input): R04Plan | null {
  const month = `${i.year}-12` as YearMonth;
  const fullUpTo = param('irpf.annual.reduction', month).value.fullUpTo;
  const baseIr = annualIr(i.year, i.rt, i.fullDeductions, i.pgblContributed, i.contributesToRgps);
  if (baseIr.ir === 0 || i.rt <= fullUpTo) return null;
  const limit = param('irpf.pgbl.limit', month).value;
  const maxContribution = i.contributesToRgps
    ? cents(Math.max(0, roundToCents(reais(i.rt).times(limit)) - i.pgblContributed))
    : cents(0);
  // Discrete candidates: the IR is piecewise linear in the contribution (D.4).
  const cands = new Set<number>([0, maxContribution]);
  for (const b of param('irpf.annual.table', month).value.brackets) {
    if (b.upTo === null) continue;
    const a = i.rt - i.fullDeductions - i.pgblContributed - b.upTo;
    if (a > 0 && a < maxContribution) cands.add(a);
  }
  const provisionOf = (a: number) => roundToCents(reais(cents(a)).times(D(i.redemptionRate)));
  let best = { a: 0, gain: 0, cash: 0, provision: 0 };
  for (const a of [...cands].sort((x, y) => x - y)) {
    const ir = annualIr(
      i.year,
      i.rt,
      i.fullDeductions,
      cents(i.pgblContributed + a),
      i.contributesToRgps,
    ).ir;
    const cash = baseIr.ir - ir;
    const provision = provisionOf(a);
    const gain = cash - provision;
    if (gain > best.gain) best = { a, gain, cash, provision };
  }
  const found = best.gain >= 100;
  return {
    baseIr: baseIr.ir,
    baseModel: baseIr.model,
    contribution: cents(found ? best.a : 0),
    gain: cents(found ? best.gain : 0),
    cashBenefit: cents(found ? best.cash : 0),
    provision: cents(found ? best.provision : 0),
    maxContribution,
  };
}

export const R04_REFS = refsOf([
  'lei9250-1995/art4/p2',
  'lei9250-1995/art8/ii',
  'lei9250-1995/art8/p2',
  'lei9250-1995/art10',
  'lei9250-1995/art11-a',
  'lei9532-1997/art11',
  'lei11053-2004/art1',
]);

export function r04Finding(
  input: R04Input,
  plan: R04Plan,
  gain12m: Cents,
  regimeGain: Cents,
  confidence: Finding['confidence'],
): Finding {
  const trace: Step[] = [
    step({
      id: 'R04.BASE_IR',
      label: `IR do ajuste ${input.year + 1} (ano-calendário ${input.year}) no melhor modelo, sem novo aporte`,
      formula: 'menor entre o modelo simplificado e o completo; redução da Lei 15.270',
      inputs: {
        rt: { value: input.rt, unit: 'cents' },
        fullDeductions: { value: input.fullDeductions, unit: 'cents' },
      },
      result: { value: plan.baseIr, unit: 'cents' },
      rounding: 'HALF_UP_CENT',
      parameter: param('irpf.annual.table', `${input.year}-12` as YearMonth),
    }),
    step({
      id: 'R04.PGBL_CONTRIBUTION',
      label: 'Aporte em PGBL de maior ganho real',
      formula:
        'até 12% da renda tributável; candidatos: 0, o máximo e os aportes que cruzam uma faixa',
      inputs: { maxContribution: { value: plan.maxContribution, unit: 'cents' } },
      result: { value: plan.contribution, unit: 'cents' },
      rounding: 'HALF_UP_CENT',
      parameter: param('irpf.pgbl.limit', `${input.year}-12` as YearMonth),
    }),
    step({
      id: 'R04.MARGINAL_12M',
      label: 'Ganho real (diferimento: já descontada a provisão de IR no resgate)',
      formula: 'IR a menos no ajuste − alíquota de resgate × aporte',
      inputs: {
        cashBenefit: { value: plan.cashBenefit, unit: 'cents' },
        provision: { value: plan.provision, unit: 'cents' },
      },
      result: { value: gain12m, unit: 'cents' },
      rounding: 'HALF_UP_CENT',
      parameter: param('irpf.pgbl.referenceRedemptionRate', `${input.year}-12` as YearMonth),
    }),
  ];
  const out: Finding = {
    ...base(),
    ruleId: 'R04',
    order: ORDER_OF.R04,
    type: 'savings',
    title: `Aporte R$ ${formatBrl(plan.contribution)} em PGBL até 30/12: R$ ${formatBrl(plan.cashBenefit)} a menos de IR agora; ganho real de R$ ${formatBrl(gain12m)} (diferimento)`,
    marginalValue12m: gain12m,
    annualRegimeValue: regimeGain,
    confidence,
    // D.4 DECISION (3): 31/12 has no banking hours for the public.
    deadline: civilDate(`${input.year}-12-30`),
    trace,
    refs: R04_REFS,
    doNot: [
      'Não deduza despesa que não seja sua ou de dependente, nem despesa sem recibo com CPF/CNPJ (a Receita cruza com a DMED).',
      'Nutricionista, academia, farmácia e curso de idiomas não são dedutíveis.',
      'Não aporte em VGBL achando que deduz (só PGBL).',
    ],
    tradeoffs: [
      'O PGBL é tributado no resgate (10% só depois de 10 anos na tabela regressiva, que é opcional).',
      'Resgatar antes custa mais (até 35%).',
      'O dinheiro fica preso.',
    ],
    countsInTotal: true,
    assumptionsUsed: ['Declaração no modelo completo, entregue no prazo.'],
  };
  if (confidence !== 'confirmed') out.range = [gain12m, gain12m];
  return out;
}
