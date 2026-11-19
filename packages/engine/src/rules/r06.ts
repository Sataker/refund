// R06: monofásico PIS/Cofins in Simples, an estimate (ENGINE-SPEC D.6). Third lever of the C.6 chain: PIS/Cofins only on
// revenue × (1 − monofasicoPct). The share has NO default (REVISÃO M13): without it the finding is an alert with no R$.
import { D } from '../money.ts';
import type { Ctx } from '../projection.ts';
import type { Simulation } from '../scenario.ts';
import { step } from '../trace.ts';
import { cents, type Finding, type Step } from '../types.ts';
import { base, formatBrl, formatMonth, ORDER_OF } from './common.ts';
import type { ChainGain } from './r01.ts';
import { refsOf } from './refs.ts';

/** D.6 references in @refund/law (IN RFB 2.121/2022 is not in the corpus: EXECUTION §9, E2 row). */
export const R06_REFS = refsOf([
  'lc123-2006/art18/p4-a',
  'lc123-2006/art18/p12',
  'lc123-2006/art18/p13',
  'lei10147-2000/art1',
  'lei10147-2000/art2',
  'lei10485-2002/art1',
  'lei10485-2002/art3',
  'lei10485-2002/art5',
  'lei5172-1966/art165',
  'lei5172-1966/art168',
]);

/** Industry CNAEs (divisions 10–33) are manufacturers: not entitled (D.6 trigger; E.5). */
export const isManufacturerCnae = (cnae: string): boolean => {
  const division = Number(cnae.slice(0, 2));
  return division >= 10 && division <= 33;
};

/** D.6 trigger: Simples, a CNAE of the monofásico resale list (fact from E.5) and not a manufacturer's. */
export function appliesR06(ctx: Ctx): boolean {
  const f = ctx.facts;
  return (
    f.company.value.regime === 'SIMPLES' &&
    f.companyDetails.value.resellsMonofasico &&
    !isManufacturerCnae(f.company.value.primaryCnae)
  );
}

const R06_DO_NOT = [
  'Não marque como monofásico produto fora das listas de NCM (Leis 10.147/2000 e 10.485/2002 e IN RFB 2.121/2022).',
  'Bebidas frias ficam de fora até a conferência do NCM.',
  'Fabricante e importador não têm direito a esta segregação.',
];
const R06_TRADEOFFS = [
  'A retificação exige o levantamento item a item das vendas, em geral feito pelo contador ou por empresa especializada (custo).',
];
const CONFIRM = 'Confirme com os XML das notas de compra (CST 04) ou com o PGDAS-D.';
const ICMS_ST = 'Também pode haver ICMS-ST (não calculado aqui).';

/** D.6, T06-02/T06-12: no `monofasicoPct` → alert with no R$ asking the one question. */
export function r06QuestionFinding(): Finding {
  const trace: Step[] = [
    step({
      id: 'R06.QUESTION',
      label: 'Falta a parcela da receita com produtos monofásicos',
      formula: 'sem a parcela informada, o motor não estima (não há média de mercado com fonte)',
      inputs: {},
      result: { value: 0, unit: 'cents' },
      rounding: 'NONE',
    }),
  ];
  return {
    ...base(),
    ruleId: 'R06',
    order: ORDER_OF.R06,
    type: 'alert',
    title:
      'Você revende produtos com PIS e Cofins monofásicos: responda 1 pergunta (qual parte das vendas é desses produtos) para estimar quanto o DAS pode cair.',
    marginalValue12m: cents(0),
    range: [cents(0), cents(0)],
    confidence: 'estimated',
    trace,
    refs: R06_REFS,
    doNot: R06_DO_NOT,
    tradeoffs: R06_TRADEOFFS,
    countsInTotal: false,
    assumptionsUsed: [CONFIRM, ICMS_ST],
  };
}

/** D.6 going forward, attributed in the chain after R05 (C.6). */
export function r06Finding(
  ctx: Ctx,
  prev: Simulation,
  next: Simulation,
  gain: ChainGain,
  recommended: boolean,
): Finding {
  const pct = ctx.assumptions.monofasicoPct ?? '0';
  const pctText = D(pct).times(100).toFixed();
  const value12m = recommended ? gain.gain12m : cents(0);
  const regimeValue = recommended ? gain.regimeGain : cents(0);
  const perPa: Step[] = [];
  next.horizon.forEach((r, i) => {
    const before = prev.horizon[i] as (typeof prev.horizon)[number];
    if (before.das === r.das) return;
    perPa.push(
      step({
        id: `R06.DAS.${r.pa}`,
        label: `PA ${formatMonth(r.pa)}: DAS com a receita monofásica segregada (${pctText}% das vendas)`,
        formula: 'PIS e Cofins só sobre receita × (1 − parcela monofásica); demais tributos iguais',
        inputs: {
          dasBefore: { value: before.das, unit: 'cents' },
          monofasicoPct: { value: pct, unit: 'rate' },
        },
        result: { value: r.das, unit: 'cents' },
        rounding: 'HALF_UP_CENT',
        month: r.pa,
      }),
    );
  });
  const trace: Step[] = [
    ...perPa,
    step({
      id: 'R06.GAIN_12M',
      label: 'Redução do DAS nos próximos 12 meses',
      formula:
        'custo de 12 meses sem segregar − custo de 12 meses segregando (depois do ajuste do pró-labore e da segregação da exportação)',
      inputs: {
        before: { value: prev.cost12m.total, unit: 'cents' },
        after: { value: next.cost12m.total, unit: 'cents' },
      },
      result: { value: gain.gain12m, unit: 'cents' },
      rounding: 'NONE',
    }),
    step({
      id: 'R06.REGIME_GAIN',
      label: 'Economia por ano, depois da mudança',
      formula: 'custo por ano sem segregar − custo por ano segregando',
      inputs: {
        before: { value: prev.regimeCost.total, unit: 'cents' },
        after: { value: next.regimeCost.total, unit: 'cents' },
      },
      result: { value: gain.regimeGain, unit: 'cents' },
      rounding: 'NONE',
    }),
    step({
      id: 'R06.MARGINAL_12M',
      label: recommended
        ? 'Economia nos próximos 12 meses'
        : 'Sem economia por ano depois da mudança: fora do total',
      formula: recommended
        ? 'custo de 12 meses sem segregar − custo de 12 meses segregando'
        : 'a alavanca só entra no total com ganho por ano, depois da mudança, ≥ R$ 1,00',
      inputs: { gain12m: { value: gain.gain12m, unit: 'cents' } },
      result: { value: value12m, unit: 'cents' },
      rounding: 'NONE',
    }),
  ];
  const out: Finding = {
    ...base(),
    ruleId: 'R06',
    order: ORDER_OF.R06,
    type: 'savings',
    title: recommended
      ? `Separe a receita monofásica no PGDAS-D: R$ ${formatBrl(value12m)} a menos nos próximos 12 meses (estimativa com ${pctText}% das vendas)`
      : // D25 (PLAN §18): outside the total (C.6/INV-2); the 12-month value goes in the text only.
        `Separar a receita monofásica não compensa: só R$ ${formatBrl(gain.gain12m)} a menos nos próximos 12 meses e nada por ano em regime (fora do total).`,
    marginalValue12m: value12m,
    annualRegimeValue: regimeValue,
    confidence: 'estimated',
    range: [value12m, value12m],
    trace,
    refs: R06_REFS,
    doNot: R06_DO_NOT,
    tradeoffs: R06_TRADEOFFS,
    countsInTotal: recommended,
    assumptionsUsed: [
      `Produtos monofásicos: ${pctText}% da receita do mercado interno (informado por você).`,
      CONFIRM,
      ICMS_ST,
    ],
  };
  if (recommended) out.regimeFrom = next.regimeFrom;
  return out;
}
