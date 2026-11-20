// R05: segregated export revenue in Simples (ENGINE-SPEC D.5, with the period split of decision D20) and R05-REC,
// the recovery of the last 5 years as a range, never in the total (D6).
import { claimFrom, claimUntil, dasDueDate, daysBetween } from '../calendar.ts';
import { D, roundToCents } from '../money.ts';
import { param } from '../parameters/index.ts';
import type { PgdasInference } from '../pgdas.ts';
import { type Ctx, currentProLabore, revenue } from '../projection.ts';
import { dasUnder, paInputs, type Simulation } from '../scenario.ts';
import { addMonths, compareYearMonth, monthRange } from '../time.ts';
import { step } from '../trace.ts';
import {
  type Anexo,
  type Cents,
  type CivilDate,
  cents,
  type Finding,
  type RecoveryItem,
  type Step,
  type Tax,
  type YearMonth,
} from '../types.ts';
import { base, formatBrl, formatMonth, ORDER_OF } from './common.ts';
import type { ChainGain } from './r01.ts';
import { REFS, refsOf } from './refs.ts';

const FIRST_2027 = '2027-01' as YearMonth;
const is2027 = (pa: YearMonth) => compareYearMonth(pa, FIRST_2027) >= 0;

/** The provision that removes the export shares in the PA's period (D.5, D20). */
export const exclusionRef = (pa: YearMonth) =>
  is2027(pa) ? REFS['res-cgsn190-2026/art1/res140-art25'] : REFS['res-cgsn140-2018/art25/p3'];

/**
 * D52 (EXECUTION §9, 20/11): R05's qualification, steps, citations and "não faça" texts are those of the export of
 * SERVICES (Res. CGSN 140, art. 25, §§ 4º/4º-A; LC 116, art. 2º; LC 214, art. 80). For the export of Anexo II goods the
 * spec defines no action plan nor citations (LC 214, art. 81, for CBS/IBS; the PGDAS-D goods-export activity), so R05
 * stays off for Anexo II until it is specified (CLAUDE.md, rule 12). The DAS arithmetic of the removed shares (IPI
 * included, LC 123, art. 18, § 14) stays in `dasByMarket` and its golden reference cases.
 */
export const r05CoversAnexo = (anexo: Anexo): boolean => anexo !== 'II';

/** Trigger of D.5: Simples, export revenue in the statement, qualification confirmed, PGDAS-D not segregated. */
export function eligibleR05(ctx: Ctx, segregates: 'yes' | 'no' | 'unknown'): boolean {
  const f = ctx.facts;
  if (f.company.value.regime !== 'SIMPLES') return false;
  if (!r05CoversAnexo(f.companyDetails.value.baseAnexo)) return false;
  if (f.qualifications.exportResultAbroad?.value !== true) return false;
  if (!ctx.observed.some((m) => revenue(ctx, 'export', m) > 0)) return false;
  return segregates !== 'yes';
}

/** Segregation status: the fact when given, else the C.3.7 inference. */
export const segregationStatus = (ctx: Ctx, inference: PgdasInference) =>
  ctx.facts.qualifications.pgdasSegregatesExport?.value ?? inference.segregates;

export function confidenceR05(ctx: Ctx, inference: PgdasInference): Finding['confidence'] {
  const user = ctx.facts.qualifications.exportResultAbroad?.provenance.origin === 'user';
  return inference.segregates === 'no' && user ? 'confirmed' : 'estimated';
}

const R05_DO_NOT = [
  'Não marque como exportação um serviço cujo resultado se verifica no Brasil, como o prestado a filial ou cliente brasileiro ou usufruído aqui (LC 116, art. 2º, parágrafo único).',
  'Até o PA 12/2026: não marque receita sem ingresso de divisas (Res. CGSN 140, art. 25, § 4º), salvo recursos mantidos no exterior nos termos da Lei 11.371/2006 (§ 4º-A).',
  'A partir do PA 01/2027: não tire a CBS e o IBS de serviço cujo adquirente ou destinatário está no Brasil ou que é consumido aqui (LC 214, art. 80, § 1º-A).',
  'Não peça a restituição sem antes retificar o PGDAS-D.',
];
// R05 is about the months ahead (nothing is amended there); R05-REC amends past PGDAS-D (E10 UX review, M6).
const R05_TRADEOFFS = [
  'A prefeitura pode questionar o ISS dessa receita. Guarde os documentos que fundamentaram a apuração e confirme com o contador quais provam a exportação (por exemplo, contrato com o cliente, fatura e comprovante de recebimento).',
];
const REC_TRADEOFFS = [
  'Ao retificar, a prefeitura pode questionar o ISS. Guarde os documentos que fundamentaram a apuração e confirme com o contador quais provam a exportação (por exemplo, contrato com o cliente, fatura e comprovante de recebimento).',
];

export const R05_REFS = refsOf([
  // First = the citation on screen (ENGINE-SPEC C.11.6; IDENTITY-AND-UI §5 "LC 123, art. 18, § 4º-A").
  'lc123-2006/art18/p4-a',
  'lc123-2006/art3/p14',
  'lc123-2006/art3/p15',
  'lc123-2006/art18/p14',
  'res-cgsn140-2018/art16/p3',
  'res-cgsn140-2018/art25/p3',
  'res-cgsn140-2018/art25/p4',
  'res-cgsn140-2018/art25/p4-a',
  'res-cgsn190-2026/art1/res140-art25',
  'res-cgsn190-2026/art8/xvi',
  'res-cgsn190-2026/art9',
  'lc116-2003/art2',
  'lc214-2025/art79',
  'lc214-2025/art80',
]);

function removedShares(pa: YearMonth): string {
  return param('simples.export.exclude', pa)
    .value.map((t) => (t === 'COFINS' ? 'Cofins' : t))
    .join(', ');
}

const MONTH_NAMES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

/** "outubro e novembro de 2026", "dezembro de 2026 e janeiro de 2027". */
export function monthNames(pas: readonly YearMonth[]): string {
  const named = pas.map((m, i) => {
    const name = MONTH_NAMES[Number(m.slice(5)) - 1] as string;
    const next = pas[i + 1];
    return next === undefined || next.slice(0, 4) !== m.slice(0, 4)
      ? `${name} de ${m.slice(0, 4)}`
      : name;
  });
  return named.length <= 1
    ? (named[0] ?? '')
    : `${named.slice(0, -1).join(', ')} e ${named.at(-1) as string}`;
}

/**
 * C.4: the PAs after the statement's last DAS and before `start` have no DAS paid yet; they count neither as savings
 * nor as recovery, and the finding asks to segregate them already (text only).
 */
function pendingStep(pas: readonly YearMonth[]): Step[] {
  if (pas.length === 0) return [];
  return [
    step({
      id: 'R05.PAS_BEFORE_START',
      label: 'PAs ainda sem DAS pago, antes do início da projeção',
      formula: 'não entram na economia dos próximos 12 meses nem na recuperação',
      inputs: { pas: { value: pas.join(', '), unit: 'text' } },
      result: {
        value: `Peça ao contador para já segregar o PGDAS-D de ${monthNames(pas)}: esses PAs não entram na economia nem na recuperação.`,
        unit: 'text',
      },
      rounding: 'NONE',
      month: pas[0] as YearMonth,
    }),
  ];
}

export function r05Finding(
  ctx: Ctx,
  prev: Simulation,
  next: Simulation,
  gain: ChainGain,
  recommended: boolean,
  confidence: Finding['confidence'],
  pendingPas: readonly YearMonth[] = [],
): Finding {
  const value12m = recommended ? gain.gain12m : cents(0);
  const regimeValue = recommended ? gain.regimeGain : cents(0);
  const perPa: Step[] = next.horizon.map((r, i) => {
    const before = prev.horizon[i] as (typeof prev.horizon)[number];
    const s: Step = {
      id: `R05.DAS.${r.pa}`,
      label: `PA ${formatMonth(r.pa)}: DAS com a exportação segregada (Anexo ${r.anexo})`,
      formula: `receita de exportação com o RBT12 de exportação, sem as parcelas de ${removedShares(r.pa)}`,
      inputs: {
        dasNotSegregated: { value: before.das, unit: 'cents' },
        exportRbt12: { value: r.rbt12.export, unit: 'cents' },
      },
      result: { value: r.das, unit: 'cents' },
      rounding: 'HALF_UP_CENT',
      month: r.pa,
      ref: exclusionRef(r.pa),
    };
    return s;
  });
  const trace: Step[] = [
    ...perPa,
    ...pendingStep(pendingPas),
    step({
      id: 'R05.REGIME_GAIN',
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
      id: 'R05.MARGINAL_12M',
      label: 'Economia nos próximos 12 meses',
      formula:
        'custo de 12 meses sem segregar − custo de 12 meses segregando (depois do ajuste do pró-labore)',
      inputs: {
        before: { value: prev.cost12m.total, unit: 'cents' },
        after: { value: next.cost12m.total, unit: 'cents' },
      },
      result: { value: value12m, unit: 'cents' },
      rounding: 'NONE',
    }),
  ];
  const assumptionsUsed = [
    'Receita do exterior futura = média dos 12 meses observados.',
    'A pergunta de qualificação confirmada vale para o ISS (LC 116, art. 2º) e, a partir de 01/2027, para a CBS e o IBS (LC 214, art. 80, § 1º-A, II).',
  ];
  if (confidence !== 'confirmed') assumptionsUsed.push('o contador não segregou');
  if (next.horizon.some((r) => is2027(r.pa)) || next.regime.some((r) => is2027(r.pa))) {
    assumptionsUsed.push('a empresa não optou por recolher IBS e CBS fora do DAS');
  }
  const out: Finding = {
    ...base(),
    ruleId: 'R05',
    order: ORDER_OF.R05,
    type: 'savings',
    title: recommended
      ? `Declare a receita do exterior como exportação no PGDAS-D a partir de ${formatMonth(ctx.assumptions.start)}: R$ ${formatBrl(value12m)} a menos nos próximos 12 meses`
      : 'Segregar a exportação não reduz o DAS neste cenário',
    marginalValue12m: value12m,
    annualRegimeValue: regimeValue,
    confidence,
    trace,
    refs: R05_REFS,
    doNot: R05_DO_NOT,
    tradeoffs: R05_TRADEOFFS,
    countsInTotal: recommended,
    assumptionsUsed,
  };
  if (confidence !== 'confirmed') out.range = [value12m, value12m];
  return out;
}

// ---------- R05-REC (recovery) ----------

const FEDERAL: readonly Tax[] = ['PIS', 'COFINS', 'CBS', 'IBS', 'IPI'];

/** Σ measured + average(measured) × |projected|, one half-up rounding at the end (D.5). */
const upper = (measured: number, count: number, projected: number): Cents =>
  count === 0
    ? cents(measured)
    : roundToCents(D(measured).plus(D(measured).times(projected).dividedBy(count)).dividedBy(100));

export const REC_REFS = refsOf([
  'res-cgsn140-2018/art25/p3',
  'res-cgsn140-2018/art25/p4',
  'res-cgsn140-2018/art128',
  'res-cgsn140-2018/art131',
  'lc116-2003/art2',
  'lei10833-2003/art6',
  'lei10637-2002/art5',
  'lei5172-1966/art168',
  'lei5172-1966/art210',
  'lei810-1949/art1',
  'lei810-1949/art3',
]);

/**
 * D.5 "going backward". Eligible PAs: before `start`, with `claimUntil(payment or estimated due date) ≥ analysisDate`
 * (C.12.2, T05-10). Measured: DAS in the statement inferred as "did not segregate". Projected: eligible PAs older
 * than the statement (C.4: PAs after the statement without DAS paid yet are neither savings nor recovery).
 */
export function r05RecFinding(ctx: Ctx, inference: PgdasInference): Finding | null {
  const start = ctx.assumptions.start;
  const analysisDate = ctx.facts.analysisDate;
  const paidByPa = new Map(inference.byPa.map((p) => [p.pa, p]));
  const firstPaid = inference.byPa[0]?.pa;
  const years = param('statuteOfLimitations.years', start).value;
  const from = addMonths(start, -(12 * years + 12));
  const items: RecoveryItem[] = [];
  const steps: Step[] = [];
  let measured = 0;
  let measuredCount = 0;
  let fed = 0;
  let iss = 0;
  let icms = 0;
  let projectedCount = 0;

  for (const pa of monthRange(from, addMonths(start, -1))) {
    if (compareYearMonth(pa, ctx.openedIn) < 0) continue;
    const inferred = paidByPa.get(pa);
    const paymentDate: CivilDate = inferred?.paid.paymentDate ?? dasDueDate(pa);
    const until = claimUntil(paymentDate, pa);
    if (until < analysisDate) continue;
    if (inferred !== undefined) {
      if (inferred.match === null || inferred.match.segregated) continue;
      const inputs = paInputs(ctx, pa, (m) => currentProLabore(ctx, m));
      const notSeg = dasUnder(ctx, pa, inputs, inferred.match.anexo, false);
      const seg = dasUnder(ctx, pa, inputs, inferred.match.anexo, true);
      const overpayment = inferred.paid.amount - seg.das;
      const nb = notSeg.byMarket[0]?.byTax ?? {};
      const segTax = (t: Tax) => seg.byMarket.reduce((a, m) => a + (m.byTax[t] ?? 0), 0);
      const diff = (taxes: readonly Tax[]) =>
        taxes.reduce((a, t) => a + ((nb[t] ?? 0) - segTax(t)), 0);
      const item: RecoveryItem = {
        pa,
        measured: true,
        paymentDate: inferred.paid.paymentDate,
        federal: cents(diff(FEDERAL)),
        iss: cents(diff(['ISS'])),
        icms: cents(diff(['ICMS'])),
        claimFrom: claimFrom(pa),
        claimUntil: until,
        daysLeft: daysBetween(analysisDate, until),
      };
      items.push(item);
      measured += overpayment;
      measuredCount += 1;
      fed += item.federal;
      iss += item.iss;
      icms += item.icms;
      steps.push({
        id: `R05-REC.OVERPAYMENT.${pa}`,
        label: `PA ${formatMonth(pa)}: pago a mais (DAS pago − DAS com a exportação segregada)`,
        formula: `DAS pago − DAS segregado no Anexo ${inferred.match.anexo}, sem as parcelas de ${removedShares(pa)}`,
        inputs: {
          paid: { value: inferred.paid.amount, unit: 'cents' },
          segregated: { value: seg.das, unit: 'cents' },
          federal: { value: item.federal, unit: 'cents' },
          iss: { value: item.iss, unit: 'cents' },
        },
        result: { value: overpayment, unit: 'cents' },
        rounding: 'HALF_UP_CENT',
        month: pa,
        ref: exclusionRef(pa),
      });
    } else if (firstPaid !== undefined && compareYearMonth(pa, firstPaid) < 0) {
      projectedCount += 1;
      items.push({
        pa,
        measured: false,
        paymentDate: null,
        federal: cents(0),
        iss: cents(0),
        icms: cents(0),
        claimFrom: claimFrom(pa),
        claimUntil: until,
        daysLeft: daysBetween(analysisDate, until),
      });
    }
  }
  if (measuredCount === 0) return null;

  const avg = (total: number) => roundToCents(D(total).dividedBy(measuredCount).dividedBy(100));
  for (const it of items) {
    if (it.measured) continue;
    it.federal = avg(fed);
    it.iss = avg(iss);
    it.icms = avg(icms);
  }
  items.sort((a, b) => (a.claimUntil < b.claimUntil ? -1 : a.claimUntil > b.claimUntil ? 1 : 0));
  const range: [Cents, Cents] = [cents(measured), upper(measured, measuredCount, projectedCount)];
  const byDestination = {
    federal: [cents(fed), upper(fed, measuredCount, projectedCount)] as [Cents, Cents],
    municipal: [cents(iss), upper(iss, measuredCount, projectedCount)] as [Cents, Cents],
    state: [cents(icms), upper(icms, measuredCount, projectedCount)] as [Cents, Cents],
  };
  const oldest = [...items].sort((a, b) => (a.pa < b.pa ? -1 : 1))[0] as RecoveryItem;
  steps.push({
    id: 'R05-REC.RANGE',
    label: 'Faixa a recuperar (sem a correção pela Selic, que a Receita aplica no pagamento)',
    formula:
      'mínimo = Σ medidos; máximo = Σ medidos + média dos medidos × meses projetados (mesma receita, anexo e não segregação)',
    inputs: {
      measuredPas: { value: measuredCount, unit: 'months' },
      projectedPas: { value: projectedCount, unit: 'months' },
      measured: { value: range[0], unit: 'cents' },
    },
    result: { value: range[1], unit: 'cents' },
    rounding: 'HALF_UP_CENT',
    ref: REFS['lei5172-1966/art168'],
  });
  return {
    ...base(),
    ruleId: 'R05-REC',
    order: ORDER_OF['R05-REC'],
    type: 'recovery',
    title: `De R$ ${formatBrl(range[0])} a R$ ${formatBrl(range[1])} pagos a mais nos últimos 5 anos (estimativa; o contador confirma)`,
    marginalValue12m: cents(0),
    range,
    byDestination,
    confidence: 'estimated',
    deadline: oldest.claimUntil,
    trace: steps,
    refs: REC_REFS,
    doNot: R05_DO_NOT,
    tradeoffs: REC_TRADEOFFS,
    countsInTotal: false,
    recoveryItems: items,
    assumptionsUsed: [
      'Meses fora do extrato: mesma receita, anexo e não segregação dos meses medidos.',
      'Datas dos meses projetados estimadas pelo vencimento; confira a data do pagamento no extrato do DAS.',
      'Valores originais, sem a correção pela Selic.',
    ],
  };
}
