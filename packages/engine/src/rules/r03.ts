// R03: MEI and Simples revenue limit, alert outside the total (ENGINE-SPEC D.3). It changes no decision: it projects
// the calendar year's revenue and says how close it is to the limit and what happens if it is exceeded.
import { EngineError } from '../errors.ts';
import { D, reais, roundToCents, sumCents } from '../money.ts';
import { param } from '../parameters/index.ts';
import { anexoTable } from '../primitives/simples.ts';
import type { Ctx } from '../projection.ts';
import { addMonths, compareYearMonth, monthOfDate, monthRange, yearOf } from '../time.ts';
import { step } from '../trace.ts';
import {
  type Anexo,
  type Cents,
  type CivilDate,
  type Confidence,
  cents,
  type Finding,
  type Market,
  type Rate,
  type Step,
  type YearMonth,
} from '../types.ts';
import { base, formatBrl, inThousands, ORDER_OF } from './common.ts';
import { refsOf } from './refs.ts';

/** D.3 references, in the order of the spec (LC 123, arts. 3º, 13-A, 18-A, 20 and 30; LC 238/2026). */
export const R03_REFS = refsOf([
  'lc123-2006/art3/caput',
  'lc123-2006/art3/p9',
  'lc123-2006/art3/p9-a',
  'lc123-2006/art3/p10',
  'lc123-2006/art3/p14',
  'lc123-2006/art3/p15',
  'lc123-2006/art13-a',
  'lc123-2006/art18-a/p1',
  'lc123-2006/art18-a/p2',
  'lc123-2006/art18-a/p7',
  'lc123-2006/art18-a/p10',
  'lc123-2006/art20',
  'lc123-2006/art30',
  'lc238-2026/art1',
  'lc238-2026/art2',
  'lc238-2026/art3',
  'lc238-2026/art10',
]);

const R03_DO_NOT = [
  'Não emita a nota depois para "esconder" receita de um serviço já prestado: isso é omissão de receita.',
  'Não abra outro CNPJ em nome de parente para dividir o faturamento (LC 123, art. 3º, § 4º; art. 29).',
];
const R03_TRADEOFFS = ['Adiar uma venda real adia também a receita e o caixa.'];

// ---------- Projection of the calendar year's revenue (D.3) ----------

export interface AnnualRevenue {
  year: number;
  closed: Record<Market, Cents>; // Σ revenue jan..last closed month of the year
  average3: Record<Market, Cents>; // average of the last 3 closed months
  remainingMonths: number;
  byMarket: Record<Market, Cents>; // RBA_proj per market
  total: Cents;
  /** Cumulative RBA per month of the year (observed, then projected), per market. */
  cumulative: { month: YearMonth; domestic: Cents; export: Cents }[];
}

/**
 * `RBA_proj = Σ revenue jan..closed month + average(last 3 closed months since the opening) × remaining months` (D.3,
 * D26), per market.
 * The average is rounded half-up to the cent, like the C.4 `avg12` (no C.8 point for either; EXECUTION §9, E5).
 */
export function projectAnnualRevenue(ctx: Ctx): AnnualRevenue {
  const year = Number(ctx.facts.analysisDate.slice(0, 4));
  const jan = `${year}-01` as YearMonth;
  const dec = `${year}-12` as YearMonth;
  const ref = ctx.referenceMonth;
  const observedOf = (market: Market, m: YearMonth): Cents =>
    compareYearMonth(m, ctx.openedIn) < 0
      ? cents(0)
      : (ctx.facts.revenueByMarket[market].value[m] ?? cents(0));
  const closedMonths = compareYearMonth(ref, jan) < 0 ? [] : monthRange(jan, ref);
  // D26: the average counts only the closed months since the opening (an MEI opened 1 or 2 months ago).
  const lastThree = monthRange(addMonths(ref, -2), ref).filter(
    (m) => compareYearMonth(m, ctx.openedIn) >= 0,
  );
  const projectedMonths =
    compareYearMonth(ref, dec) >= 0
      ? []
      : monthRange(compareYearMonth(ref, jan) < 0 ? jan : addMonths(ref, 1), dec);
  const closed = { domestic: cents(0), export: cents(0) };
  const average3 = { domestic: cents(0), export: cents(0) };
  const byMarket = { domestic: cents(0), export: cents(0) };
  for (const market of ['domestic', 'export'] as const) {
    closed[market] = sumCents(closedMonths.map((m) => observedOf(market, m)));
    const three = sumCents(lastThree.map((m) => observedOf(market, m)));
    average3[market] =
      lastThree.length === 0 ? cents(0) : roundToCents(reais(three).dividedBy(lastThree.length));
    byMarket[market] = cents(closed[market] + average3[market] * projectedMonths.length);
  }
  const cumulative: AnnualRevenue['cumulative'] = [];
  let dom = 0;
  let exp = 0;
  for (const m of monthRange(jan, dec)) {
    const projected = projectedMonths.includes(m);
    dom += projected ? average3.domestic : observedOf('domestic', m);
    exp += projected ? average3.export : observedOf('export', m);
    cumulative.push({ month: m, domestic: cents(dom), export: cents(exp) });
  }
  return {
    year,
    closed,
    average3,
    remainingMonths: projectedMonths.length,
    byMarket,
    total: cents(byMarket.domestic + byMarket.export),
    cumulative,
  };
}

// ---------- MEI (D.3, first block) ----------

export type MeiBand = 'warning' | 'overrun_up_to_20' | 'overrun_above_20';

export interface MeiLimitInput {
  year: number;
  rbaProj: Cents;
  openedIn: YearMonth;
  /** Anexo of the activity: the excess is charged at its 1st-bracket nominal rate (D.3). */
  anexo: Anexo;
  /** Σ DAS-MEI paid in the year (D.3, `overrun_above_20`). */
  dasMeiPaid: Cents;
}

export interface MeiLimitResult {
  limit: Cents;
  toleranceLimit: Cents; // limit × 1,20
  alertFloor: Cents; // 80% of the limit (of the last limit not conditioned on the LOA, from 2027)
  dependsOnRegulation: boolean;
  floorLimit: Cents | null; // the unconditioned limit used for the floor, when the limit depends on the LOA
  band: MeiBand | null;
  /** Estimated cost (outside the total); null when the anexo has no table in ENGINE-SPEC A.3 (II, IV). */
  cost: Cents | null;
  nominalRate: Rate | null;
  effectiveFrom: CivilDate | null; // removal from the MEI (01/01 of the next year or retroactive to 01/01)
}

/**
 * MEI limit of `year` read from the parameters of `lookupYear`: the § 1º annual limit, or R$ X × months in the opening
 * year (§ 2º; LC 238, art. 2º).
 */
function meiLimitOf(lookupYear: number, year: number, openedIn: YearMonth) {
  const lookup = param('mei.limit', `${lookupYear}-12` as YearMonth);
  const opening = yearOf(openedIn) === year;
  const months = 12 - Number(openedIn.slice(5)) + 1;
  const limit = opening ? cents(lookup.value.monthlyAtStart * months) : lookup.value.annual;
  return { limit, lookup };
}

const times = (c: Cents, r: Rate | string): Cents => roundToCents(reais(c).times(r));

export function meiLimit(i: MeiLimitInput): MeiLimitResult {
  const { limit, lookup } = meiLimitOf(i.year, i.year, i.openedIn);
  const { tolerance } = param('mei.excess', `${i.year}-12` as YearMonth).value;
  const toleranceLimit = times(limit, D(1).plus(tolerance).toFixed());
  // D.3: from 2027 the LC 238 limit depends on the LOA; the 2026 limit stays the alert floor.
  let floorLimit: Cents | null = null;
  if (lookup.dependsOnRegulation) {
    let y = i.year - 1;
    while (param('mei.limit', `${y}-12` as YearMonth).dependsOnRegulation) y -= 1;
    floorLimit = meiLimitOf(y, i.year, i.openedIn).limit;
  }
  const alertFloor = times(cents(Math.min(limit, floorLimit ?? limit)), '0.8');
  let band: MeiBand | null = null;
  if (i.rbaProj >= alertFloor) {
    band =
      i.rbaProj <= limit
        ? 'warning'
        : i.rbaProj <= toleranceLimit
          ? 'overrun_up_to_20'
          : 'overrun_above_20';
  }
  let nominalRate: Rate | null = null;
  try {
    nominalRate =
      anexoTable(i.anexo, `${i.year}-12` as YearMonth).value.brackets[0]?.nominal ?? null;
  } catch (e) {
    if (!(e instanceof EngineError) || e.code !== 'ANEXO_WITHOUT_TABLE') throw e;
  }
  let cost: Cents | null = cents(0);
  let effectiveFrom: CivilDate | null = null;
  if (band === 'overrun_up_to_20') {
    effectiveFrom = `${i.year + 1}-01-01` as CivilDate;
    cost = nominalRate === null ? null : times(cents(i.rbaProj - limit), nominalRate);
  } else if (band === 'overrun_above_20') {
    effectiveFrom = `${i.year}-01-01` as CivilDate;
    // Never below zero: a DAS-MEI paid above the Simples amount is no cost (INV-3).
    cost =
      nominalRate === null
        ? null
        : cents(Math.max(0, times(i.rbaProj, nominalRate) - i.dasMeiPaid));
  }
  return {
    limit,
    toleranceLimit,
    alertFloor,
    dependsOnRegulation: lookup.dependsOnRegulation,
    floorLimit,
    band,
    cost,
    nominalRate,
    effectiveFrom,
  };
}

// ---------- Simples (D.3, second block) ----------

export type SimplesEffect =
  | 'warning'
  | 'icms_iss_next_year'
  | 'icms_iss_next_month'
  | 'exclusion_next_year'
  | 'exclusion_next_month';

const SEVERITY: Record<SimplesEffect, number> = {
  warning: 0,
  icms_iss_next_year: 1,
  icms_iss_next_month: 2,
  exclusion_next_year: 3,
  exclusion_next_month: 4,
};

export interface SimplesLimitResult {
  market: Market;
  rba: Cents;
  effect: SimplesEffect;
  effectiveFrom: CivilDate | null;
}

/**
 * Per market (LC 123, art. 3º, § 14; art. 13-A): ≥ 80% of the sublimit → alert; above the sublimit, ICMS/ISS leave the
 * DAS next year (≤ 20%) or from the month after the excess (> 20%, art. 20, §§ 1º and 1º-A); above the ceiling, the
 * company leaves the Simples on 1º/01 of the next year (≤ 20%, art. 3º, § 9º-A) or from the month after (§ 9º).
 * Returns the most severe market, or null below the alert floor.
 */
export function simplesLimit(rev: AnnualRevenue): SimplesLimitResult | null {
  const dec = `${rev.year}-12` as YearMonth;
  const limits = param('simples.limits', dec).value;
  const excess = param('simples.excess', dec).value;
  const floor = times(limits.sublimit, '0.8');
  let worst: SimplesLimitResult | null = null;
  for (const market of ['domestic', 'export'] as const) {
    const rba = rev.byMarket[market];
    if (rba < floor) continue;
    const crossing = (threshold: Cents): CivilDate => {
      const m = rev.cumulative.find((c) => c[market] > threshold)?.month ?? dec;
      return `${addMonths(m, 1)}-01` as CivilDate;
    };
    let r: SimplesLimitResult;
    if (rba <= limits.sublimit) r = { market, rba, effect: 'warning', effectiveFrom: null };
    else if (rba <= excess.sublimitWithTolerance)
      r = {
        market,
        rba,
        effect: 'icms_iss_next_year',
        effectiveFrom: `${rev.year + 1}-01-01` as CivilDate,
      };
    else if (rba <= limits.epp)
      r = {
        market,
        rba,
        effect: 'icms_iss_next_month',
        effectiveFrom: crossing(excess.sublimitWithTolerance),
      };
    else if (rba <= excess.ceilingWithTolerance)
      r = {
        market,
        rba,
        effect: 'exclusion_next_year',
        effectiveFrom: `${rev.year + 1}-01-01` as CivilDate,
      };
    else
      r = {
        market,
        rba,
        effect: 'exclusion_next_month',
        effectiveFrom: crossing(excess.ceilingWithTolerance),
      };
    if (worst === null || SEVERITY[r.effect] > SEVERITY[worst.effect]) worst = r;
  }
  return worst;
}

// ---------- Finding ----------

const marketName = (m: Market) => (m === 'export' ? 'exportação' : 'mercado interno');
const date = (d: CivilDate) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

function projectionStep(rev: AnnualRevenue): Step {
  return step({
    id: 'R03.RBA_PROJ',
    label: `Faturamento projetado de ${rev.year}`,
    formula:
      'Σ receita de janeiro até o último mês fechado + média dos 3 últimos meses fechados × meses restantes',
    inputs: {
      closed: { value: cents(rev.closed.domestic + rev.closed.export), unit: 'cents' },
      average3: { value: cents(rev.average3.domestic + rev.average3.export), unit: 'cents' },
      remainingMonths: { value: rev.remainingMonths, unit: 'months' },
    },
    result: { value: rev.total, unit: 'cents' },
    rounding: 'HALF_UP_CENT',
  });
}

function finding(
  title: string,
  cost: Cents,
  confidence: Confidence,
  trace: Step[],
  assumptionsUsed: string[],
  deadline: CivilDate | null,
): Finding {
  const out: Finding = {
    ...base(),
    ruleId: 'R03',
    order: ORDER_OF.R03,
    type: 'alert',
    title,
    marginalValue12m: cost,
    range: [cost, cost],
    confidence,
    trace,
    refs: R03_REFS,
    doNot: R03_DO_NOT,
    tradeoffs: R03_TRADEOFFS,
    countsInTotal: false,
    assumptionsUsed,
  };
  if (deadline !== null) out.deadline = deadline;
  return out;
}

const PROJECTION_ASSUMPTION =
  'Meses restantes do ano = média dos 3 últimos meses fechados; só entram créditos confirmados como receita.';

/** D.3 for an MEI: always evaluated. */
export function r03MeiFinding(ctx: Ctx): Finding | null {
  const rev = projectAnnualRevenue(ctx);
  const dasMeiPaid = sumCents(
    ctx.facts.dasPaid.value.filter((p) => yearOf(p.pa) === rev.year).map((p) => p.amount),
  );
  const r = meiLimit({
    year: rev.year,
    rbaProj: rev.total,
    openedIn: monthOfDate(ctx.facts.company.value.openedOn),
    anexo: ctx.facts.companyDetails.value.baseAnexo,
    dasMeiPaid,
  });
  if (r.band === null) return null;
  const limitRef = param('mei.limit', `${rev.year}-12` as YearMonth);
  const cost = r.cost ?? cents(0);
  const trace: Step[] = [
    projectionStep(rev),
    step({
      id: 'R03.LIMIT',
      label: `Limite do MEI em ${rev.year}`,
      formula: r.dependsOnRegulation
        ? 'limite da LC 238/2026, condicionado à LOA; o limite anterior fica como piso do alerta'
        : 'limite anual (ou valor mensal × meses, no ano de abertura)',
      inputs: {
        toleranceLimit: { value: r.toleranceLimit, unit: 'cents' },
        alertFloor: { value: r.alertFloor, unit: 'cents' },
      },
      result: { value: r.limit, unit: 'cents' },
      rounding: 'NONE',
      month: `${rev.year}-12` as YearMonth,
      parameter: limitRef,
    }),
    step({
      id: 'R03.MARGINAL_12M',
      label:
        r.band === 'warning'
          ? 'Dentro do limite: sem custo'
          : 'Diferença estimada a pagar (fora do total; sem juros e multa)',
      formula:
        r.band === 'overrun_up_to_20'
          ? 'excesso × alíquota nominal da 1ª faixa do anexo'
          : r.band === 'overrun_above_20'
            ? 'faturamento projetado × alíquota nominal da 1ª faixa − DAS-MEI pagos no ano'
            : 'sem excesso',
      inputs: {
        nominalRate: {
          value: r.nominalRate ?? 'anexo sem tabela',
          unit: r.nominalRate ? 'rate' : 'text',
        },
        dasMeiPaid: { value: dasMeiPaid, unit: 'cents' },
      },
      result: { value: cost, unit: 'cents' },
      rounding: 'HALF_UP_CENT',
    }),
  ];
  const lc238 = r.dependsOnRegulation
    ? ` dentro do limite da LC 238 (${inThousands(r.limit)}) se a LOA ${rev.year} prever a renúncia`
    : '';
  let title: string;
  if (r.band === 'warning') {
    title = `Faltam R$ ${formatBrl(cents(r.limit - rev.total))} para o limite do MEI${lc238}. Se a venda puder acontecer em janeiro, ela conta para o ano que vem.`;
  } else if (r.band === 'overrun_up_to_20') {
    title = `O faturamento projetado passa o limite do MEI em até 20%: a partir de ${date(r.effectiveFrom as CivilDate)} você vira ME${r.cost === null ? '' : `, e paga R$ ${formatBrl(cost)} sobre o excesso junto com o DAS de janeiro`}.`;
  } else {
    title = `O faturamento projetado passa o limite do MEI em mais de 20%: o desenquadramento volta a ${date(r.effectiveFrom as CivilDate)}${r.cost === null ? '' : `, com cerca de R$ ${formatBrl(cost)} a pagar, mais juros e multa (não calculados)`}.`;
  }
  const assumptions = [PROJECTION_ASSUMPTION];
  if (r.cost === null)
    assumptions.push('Custo não calculado: o anexo da atividade não tem tabela no Refund.');
  return finding(
    title,
    cost,
    r.dependsOnRegulation ? 'depends_on_regulation' : 'estimated',
    trace,
    assumptions,
    r.effectiveFrom,
  );
}

/** D.3 for a Simples company: from 80% of the sublimit in either market. */
export function r03SimplesFinding(ctx: Ctx): Finding | null {
  const rev = projectAnnualRevenue(ctx);
  const r = simplesLimit(rev);
  if (r === null) return null;
  const dec = `${rev.year}-12` as YearMonth;
  const limits = param('simples.limits', dec);
  const trace: Step[] = [
    projectionStep(rev),
    step({
      id: 'R03.MARKET',
      label: `Faturamento projetado de ${rev.year} no ${marketName(r.market)} (limites por mercado)`,
      formula: 'sublimite de ICMS/ISS e teto do Simples comparados a cada mercado separadamente',
      inputs: {
        sublimit: { value: limits.value.sublimit, unit: 'cents' },
        ceiling: { value: limits.value.epp, unit: 'cents' },
      },
      result: { value: r.rba, unit: 'cents' },
      rounding: 'NONE',
      month: dec,
      parameter: limits,
    }),
    step({
      id: 'R03.MARGINAL_12M',
      label: 'Alerta sem valor em R$ (fora do total)',
      formula: 'o efeito do excesso muda o regime; o custo sai da próxima análise',
      inputs: { effect: { value: r.effect, unit: 'text' } },
      result: { value: 0, unit: 'cents' },
      rounding: 'NONE',
    }),
  ];
  const from = r.effectiveFrom === null ? '' : date(r.effectiveFrom);
  const titles: Record<SimplesEffect, string> = {
    warning: `Faltam R$ ${formatBrl(cents(limits.value.sublimit - r.rba))} para o sublimite de R$ 3,6 milhões (${marketName(r.market)}). Se a venda puder acontecer em janeiro, ela conta para o ano que vem.`,
    icms_iss_next_year: `O faturamento projetado passa o sublimite de R$ 3,6 milhões em até 20% (${marketName(r.market)}): a partir de ${from}, ICMS e ISS saem do DAS.`,
    icms_iss_next_month: `O faturamento projetado passa o sublimite de R$ 3,6 milhões em mais de 20% (${marketName(r.market)}): ICMS e ISS saem do DAS a partir de ${from}.`,
    exclusion_next_year: `O faturamento projetado passa o teto de R$ 4,8 milhões em até 20% (${marketName(r.market)}): a empresa sai do Simples Nacional em ${from}.`,
    exclusion_next_month: `O faturamento projetado passa o teto de R$ 4,8 milhões em mais de 20% (${marketName(r.market)}): a empresa sai do Simples Nacional a partir de ${from}.`,
  };
  return finding(
    titles[r.effect],
    cents(0),
    'estimated',
    trace,
    [PROJECTION_ASSUMPTION],
    r.effectiveFrom,
  );
}
