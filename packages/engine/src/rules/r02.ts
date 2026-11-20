// R02: dividend cadence, cash alert outside the total (ENGINE-SPEC D.2; D3; C.5 `withholdingFinancialCost`).
import { D, reais, roundToCents } from '../money.ts';
import { param, paramOrNull } from '../parameters/index.ts';
import { monthlyWithholding } from '../primitives/dividends.ts';
import { addMonths, monthsBetween } from '../time.ts';
import { step } from '../trace.ts';
import {
  type Cents,
  cents,
  type Distribution,
  type Finding,
  type Rate,
  type Step,
  type YearMonth,
} from '../types.ts';
import { base, formatBrl, formatMonth, inThousands, ORDER_OF } from './common.ts';
import { refsOf } from './refs.ts';

export interface R02Event {
  month: YearMonth;
  payerCnpj: string;
  total: Cents;
  withheld: Cents;
  darfMonth: YearMonth;
  months: number | null; // n = months from the DARF to the refund
  financialCost: Cents | null; // null above the IRPFM threshold
  suggestedMonths: number; // ceil(total / 50.000,00)
}

export interface R02Input {
  distributions: readonly Distribution[];
  projectedAnnualTotalIncome: Cents;
  selicAnnual: Rate | undefined;
  dividendRefundMonth: YearMonth;
}

/** Each (month, paying PJ) with a total above R$ 50 mil and its financial cost until the refund (D.2). */
export function r02Events(i: R02Input): R02Event[] {
  const keys = new Map<string, { month: YearMonth; payerCnpj: string }>();
  for (const d of i.distributions) keys.set(`${d.month}|${d.payerCnpj}`, d);
  const out: R02Event[] = [];
  for (const { month, payerCnpj } of [...keys.values()].sort((a, b) =>
    a.month === b.month ? (a.payerCnpj < b.payerCnpj ? -1 : 1) : a.month < b.month ? -1 : 1,
  )) {
    // Before Lei 15.270/2025 (in force from 01/2026) there was no withholding on dividends.
    if (paramOrNull('dividends.withholding', month) === null) continue;
    const w = monthlyWithholding(month, payerCnpj, i.distributions);
    if (w.withholding === 0) continue;
    const p = param('dividends.withholding', month).value;
    const irpfm = param('irpfm.threshold', month).value;
    const darfMonth = addMonths(month, 1);
    const below = i.projectedAnnualTotalIncome <= irpfm; // art. 16-A: IRPFM only above R$ 600 mil
    let months: number | null = null;
    let financialCost: Cents | null = null;
    if (below && i.selicAnnual !== undefined) {
      months = monthsBetween(darfMonth, i.dividendRefundMonth);
      const factor = D(1).plus(i.selicAnnual).pow(D(months).dividedBy(12)).minus(1);
      financialCost = roundToCents(reais(w.withholding).times(factor));
    }
    out.push({
      month,
      payerCnpj,
      total: w.total,
      withheld: w.withholding,
      darfMonth,
      months,
      financialCost,
      suggestedMonths: Math.ceil(w.total / p.monthlyThreshold),
    });
  }
  return out;
}

export const R02_REFS = refsOf([
  'lei9250-1995/art6-a',
  'lei9250-1995/art16-a/p5',
  'lei9250-1995/art16-a/p6',
  'lc123-2006/art14',
]);

export function r02Finding(i: R02Input): Finding | null {
  const events = r02Events(i);
  if (events.length === 0) return null;
  const irpfm =
    i.projectedAnnualTotalIncome > param('irpfm.threshold', (events[0] as R02Event).month).value;
  const cost = cents(events.reduce((acc, e) => acc + (e.financialCost ?? 0), 0));
  const withheld = cents(events.reduce((acc, e) => acc + e.withheld, 0));
  const trace: Step[] = events.map((e) =>
    step({
      id: `R02.FINANCIAL_COST.${e.month}`,
      label: `Retenção de ${formatMonth(e.month)} (DARF 1841 em ${formatMonth(e.darfMonth)}): custo do dinheiro parado até a restituição`,
      formula:
        e.financialCost === null
          ? 'renda acima de R$ 600 mil: a retenção vira antecipação do imposto mínimo (IRPFM)'
          : 'retido × ((1 + Selic)^(meses ÷ 12) − 1)',
      inputs: {
        total: { value: e.total, unit: 'cents' },
        withheld: { value: e.withheld, unit: 'cents' },
        months: { value: e.months ?? 0, unit: 'months' },
        selicAnnual: { value: i.selicAnnual ?? '—', unit: i.selicAnnual ? 'rate' : 'text' },
      },
      result: { value: e.financialCost ?? 0, unit: 'cents' },
      rounding: 'HALF_UP_CENT',
      month: e.month,
      parameter: param('dividends.withholding', e.month),
    }),
  );
  trace.push(
    step({
      id: 'R02.MARGINAL_12M',
      label: 'Custo financeiro das retenções (fora do total)',
      formula: 'Σ custo financeiro de cada retenção',
      inputs: { withheld: { value: withheld, unit: 'cents' } },
      result: { value: cost, unit: 'cents' },
      rounding: 'NONE',
    }),
  );
  const first = events[0] as R02Event;
  const threshold = param('dividends.withholding', first.month).value.monthlyThreshold;
  const monthCount = new Set(events.map((e) => e.month)).size;
  const refundYear = Number(i.dividendRefundMonth.slice(0, 4));
  const confidence: Finding['confidence'] = irpfm ? 'depends_on_regulation' : 'estimated';
  return {
    ...base(),
    ruleId: 'R02',
    order: ORDER_OF.R02,
    type: 'alert',
    title: irpfm
      ? 'Sua renda passa de R$ 600 mil: a retenção vira antecipação do imposto mínimo (IRPFM, em breve no app).'
      : // D47 (PLAN §18, 20/11): wording approved by Enzo; every amount and the year come from the data.
        `${monthCount === 1 ? 'Um mês' : `${monthCount} meses`} com mais de ${inThousands(threshold)} em dividendos ${monthCount === 1 ? 'teve' : 'tiveram'} R$ ${formatBrl(withheld)} retidos na fonte. Esse valor volta na declaração de ${refundYear}. Dividindo a distribuição em meses, não há retenção.`,
    marginalValue12m: cost,
    range: [cost, cost],
    confidence,
    trace,
    refs: R02_REFS,
    doNot: [
      'Não distribua lucro que a empresa não apurou só para "usar" o limite.',
      'Não divida a distribuição entre empresas sem atividade real (CTN, art. 116, parágrafo único).',
      'Não conte com ação judicial contra a retenção no Simples; o app só informa a controvérsia.',
    ],
    tradeoffs: [
      'A cadência mantém o dinheiro na PF, mas se a renda total do ano passar de R$ 600 mil o IRPFM alcança tudo do mesmo jeito.',
    ],
    countsInTotal: false,
    assumptionsUsed: [
      `Restituição em ${formatMonth(i.dividendRefundMonth)}.`,
      i.selicAnnual === undefined
        ? 'Selic não informada: custo financeiro não calculado.'
        : `Selic de ${D(i.selicAnnual).times(100).toFixed()}% ao ano.`,
    ],
  };
}
