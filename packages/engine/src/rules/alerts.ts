// Alerts with no R$, outside the total: A01 personal expense paid by the PJ (ENGINE-SPEC D.7) and A02 zero or
// below-minimum pró-labore with a partner who works (D.8). Their texts carry only what has a primary source.
import { param, paramOrNull } from '../parameters/index.ts';
import type { Ctx } from '../projection.ts';
import { addMonths, compareYearMonth, monthRange } from '../time.ts';
import { step } from '../trace.ts';
import {
  type Cents,
  cents,
  type Finding,
  type PersonalExpense,
  type Step,
  type YearMonth,
} from '../types.ts';
import { base, formatBrl, formatMonth, ORDER_OF } from './common.ts';
import { refsOf } from './refs.ts';

// ---------- A01 (D.7) ----------

export const A01_REFS = refsOf([
  'lc123-2006/art29/viii',
  'lc123-2006/art29/ix',
  'lei10406-2002/art50',
  'dl1598-1977/art60',
  'lei9249-1995/art13',
]);

/** D.7: ≥ 1 personal outflow of the PJ in the 12 observed months → one risk finding listing them by merchant. */
export function a01Finding(ctx: Ctx): Finding | null {
  const fact = ctx.facts.personalExpensesInPj;
  if (fact === undefined) return null;
  const inWindow = (e: PersonalExpense) =>
    compareYearMonth(e.month, ctx.observed[0] as YearMonth) >= 0 &&
    compareYearMonth(e.month, ctx.referenceMonth) <= 0;
  const expenses = fact.value.filter(inWindow);
  if (expenses.length === 0) return null;
  const byMerchant = new Map<string, PersonalExpense[]>();
  for (const e of [...expenses].sort((a, b) =>
    a.month < b.month ? -1 : a.month > b.month ? 1 : 0,
  )) {
    const list = byMerchant.get(e.merchant) ?? [];
    list.push(e);
    byMerchant.set(e.merchant, list);
  }
  const trace: Step[] = [...byMerchant.entries()].map(([merchant, list], i) =>
    step({
      id: `A01.MERCHANT.${i + 1}`,
      label: `${merchant}: ${list.length} pagamento(s) pela conta ou cartão da empresa`,
      formula: 'saídas da PJ classificadas como gasto pessoal (ENGINE-SPEC E.7)',
      inputs: {
        count: { value: list.length, unit: 'count' },
        months: { value: list.map((e) => formatMonth(e.month)).join(', '), unit: 'text' },
        transactionIds: { value: list.map((e) => e.transactionId).join(','), unit: 'text' },
      },
      result: { value: cents(list.reduce((a, e) => a + e.amount, 0)), unit: 'cents' },
      rounding: 'NONE',
    }),
  );
  const total = cents(expenses.reduce((a, e) => a + e.amount, 0));
  trace.push(
    step({
      id: 'A01.MARGINAL_12M',
      label: `Total de gastos pessoais pagos pela PJ: R$ ${formatBrl(total)} (alerta, sem economia)`,
      formula: 'no Simples, despesa da empresa não reduz imposto: o alerta não tem valor em R$',
      inputs: { total: { value: total, unit: 'cents' } },
      result: { value: 0, unit: 'cents' },
      rounding: 'NONE',
    }),
  );
  return {
    ...base(),
    ruleId: 'A01',
    order: ORDER_OF.A01,
    type: 'risk',
    title:
      'No Simples, despesa da empresa não reduz imposto. Pagar gasto pessoal pela PJ pode virar distribuição disfarçada de lucro e confusão patrimonial. Reembolse ou registre como distribuição de lucro.',
    marginalValue12m: cents(0),
    confidence: 'confirmed',
    trace,
    refs: A01_REFS,
    doNot: ['Não lance despesa pessoal como despesa da empresa.'],
    tradeoffs: [],
    countsInTotal: false,
    assumptionsUsed: [
      'Só entram saídas da conta ou do cartão da empresa com sinal forte de gasto pessoal (streaming, supermercado, academia, escola).',
    ],
  };
}

// ---------- A02 (D.8) ----------

export const A02_REFS = refsOf([
  'lei8212-1991/art12/v',
  'lei8212-1991/art21/caput',
  'lei8212-1991/art22/iii',
  'lei8212-1991/art28/iii',
  'lei8212-1991/art28/p3',
]);

/** The minimum wage in force in `m`, or the one of `fallback` when the engine has no record for `m`. */
const minimumWageIn = (m: YearMonth, fallback: YearMonth): Cents =>
  (paramOrNull('minimumWage', m) ?? param('minimumWage', fallback)).value;

export interface PartnerBelowMinimum {
  below: YearMonth[]; // months of the last 3 with a pró-labore below the minimum wage
  distributed: Cents;
  paidProLabore: Cents;
}

/**
 * Decision D24 (PLAN §18): ONE condition drives alert A02 and the "atual regularizado" S0 of the C.6 chain — the
 * partner answered that they work in the company, a confirmed pró-labore below the minimum wage (or none) in one of
 * the last 3 closed months, and some withdrawal (pró-labore or distributions) in those months: who works and is paid
 * for it is a mandatory INSS contributor (Lei 8.212, art. 12, V, "f"). Null when it does not hold.
 */
export function partnerBelowMinimum(ctx: Ctx): PartnerBelowMinimum | null {
  const f = ctx.facts;
  const works = f.partner.worksInCompany;
  if (works.value !== true || works.provenance.origin === 'default_assumption') return null;
  const last3 = monthRange(addMonths(ctx.referenceMonth, -2), ctx.referenceMonth).filter(
    (m) => compareYearMonth(m, ctx.openedIn) >= 0,
  );
  const start = ctx.assumptions.start;
  const proLabore = (m: YearMonth): Cents => f.partner.grossProLabore.value[m] ?? cents(0);
  const below = last3.filter((m) => proLabore(m) < minimumWageIn(m, start));
  if (below.length === 0) return null;
  const distributed = cents(
    f.partner.distributions.value
      .filter((d) => last3.includes(d.month))
      .reduce((a, d) => a + d.grossAmount, 0),
  );
  const paidProLabore = cents(last3.reduce((a, m) => a + proLabore(m), 0));
  if (distributed + paidProLabore === 0) return null;
  return { below, distributed, paidProLabore };
}

/** D.8 for Simples or Presumido, under the D24 condition (`partnerBelowMinimum`). */
export function a02Finding(ctx: Ctx): Finding | null {
  const f = ctx.facts;
  const regime = f.company.value.regime;
  if (regime !== 'SIMPLES' && regime !== 'PRESUMIDO') return null;
  const condition = partnerBelowMinimum(ctx);
  if (condition === null) return null;
  const { below, distributed, paidProLabore } = condition;
  const start = ctx.assumptions.start;
  const proLabore = (m: YearMonth): Cents => f.partner.grossProLabore.value[m] ?? cents(0);
  const sm = param('minimumWage', start);
  const trace: Step[] = below.map((m) =>
    step({
      id: `A02.PRO_LABORE.${m}`,
      label: `Pró-labore de ${formatMonth(m)} abaixo do salário mínimo`,
      formula:
        'pró-labore bruto confirmado < salário mínimo do mês (salário-de-contribuição mínimo)',
      inputs: { minimumWage: { value: minimumWageIn(m, start), unit: 'cents' } },
      result: { value: proLabore(m), unit: 'cents' },
      rounding: 'NONE',
      month: m,
    }),
  );
  trace.push(
    step({
      id: 'A02.MARGINAL_12M',
      label:
        'Alerta sem valor em R$; a análise parte do "atual regularizado" (pró-labore de 1 salário mínimo)',
      formula: 'retiradas do sócio nos 3 últimos meses fechados',
      inputs: {
        distributions: { value: cents(distributed), unit: 'cents' },
        proLabore: { value: cents(paidProLabore), unit: 'cents' },
      },
      result: { value: 0, unit: 'cents' },
      rounding: 'NONE',
      parameter: sm,
    }),
  );
  return {
    ...base(),
    ruleId: 'A02',
    order: ORDER_OF.A02,
    type: 'risk',
    title: `O sócio que trabalha na empresa e recebe remuneração por isso é segurado obrigatório do INSS (Lei 8.212, art. 12, V, f). O salário-de-contribuição mínimo é de um salário mínimo (R$ ${formatBrl(sm.value)}; Lei 8.212, art. 28, § 3º). Se você trabalha na empresa e não tem pró-labore, confirme com o contador.`,
    marginalValue12m: cents(0),
    confidence: 'confirmed',
    trace,
    refs: A02_REFS,
    doNot: ['Não zere o pró-labore se você trabalha na empresa.'],
    tradeoffs: [],
    countsInTotal: false,
    assumptionsUsed: ['Pró-labore e a resposta "trabalha na empresa" confirmados por você.'],
  };
}
