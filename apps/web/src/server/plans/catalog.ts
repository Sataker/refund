import 'server-only';
import type { PlanId } from '../result.ts';

export type { PlanId } from '../result.ts';

// ARCHITECTURE §8.1: constants in code (changing a price or a limit = a commit). Values from research 07 §3.1, §3.1b and
// §3.5 (07 rules on values), with one owner decision on top (D41, `withFreeFloor`). Checked against 07 in E17:
// catalog.test.ts pins every value of PLANS_07 to the 07 tables, and the effective limits of PLANS.

/** Interface from 07 §3.5, with no name changes. */
export interface Entitlements {
  priceMonthlyCents: number | null;
  priceYearlyCents: number | null;
  maxCpfs: number;
  maxCnpjs: number;
  maxConnectionsPf: number;
  maxConnectionsPj: number;
  connectionMode: 'snapshot' | 'continuous';
  snapshotTtlDays?: number;
  calcTraceUnlocked: number | 'all';
  actionPlan: boolean;
  reportPdf: 'summary' | 'full' | 'whitelabel';
  prolaboreOptimizer: 'result_only' | 'interactive' | false;
  limitAlerts: 'once' | 'continuous' | false;
  recoveryDossier: boolean;
  successFeeBps: { monthly: number; yearly: number };
  lawChangeAlerts: 'generic' | 'personal' | 'personal_recalc';
  askLawMonthly: number;
  seats: number;
  clientPortfolio: boolean;
  supportLevel: 'help_center' | 'email' | 'chat' | 'account_manager' | 'sla';
}

// "—" in 07 §3.5 is 0 for a count and false for a flag. The B2B plans are P1/roadmap: their values follow 07 and
// nothing in the MVP grants them. Where 07 says "por contrato" (api) the count is 0 here: a contract grants it.
/** The 07 §3.5 table as written. What the product grants is `PLANS` (the D41 floor applied). */
export const PLANS_07: Readonly<Record<PlanId, Entitlements>> = {
  free: {
    priceMonthlyCents: 0,
    priceYearlyCents: null,
    maxCpfs: 1,
    maxCnpjs: 1,
    maxConnectionsPf: 1,
    maxConnectionsPj: 1,
    connectionMode: 'snapshot',
    snapshotTtlDays: 30,
    calcTraceUnlocked: 1,
    actionPlan: false,
    reportPdf: 'summary',
    prolaboreOptimizer: 'result_only',
    limitAlerts: 'once',
    recoveryDossier: false,
    successFeeBps: { monthly: 2000, yearly: 2000 },
    lawChangeAlerts: 'generic',
    askLawMonthly: 3,
    seats: 1,
    clientPortfolio: false,
    supportLevel: 'help_center',
  },
  personal: {
    priceMonthlyCents: 2490,
    priceYearlyCents: 19900,
    maxCpfs: 1,
    maxCnpjs: 0,
    maxConnectionsPf: 3,
    maxConnectionsPj: 0,
    connectionMode: 'continuous',
    calcTraceUnlocked: 'all',
    actionPlan: true,
    reportPdf: 'full',
    prolaboreOptimizer: false,
    limitAlerts: false,
    recoveryDossier: false,
    successFeeBps: { monthly: 2000, yearly: 2000 },
    lawChangeAlerts: 'personal',
    askLawMonthly: 20,
    seats: 1,
    clientPortfolio: false,
    supportLevel: 'email',
  },
  mei: {
    priceMonthlyCents: 3490,
    priceYearlyCents: 29900,
    maxCpfs: 1,
    maxCnpjs: 1,
    maxConnectionsPf: 2,
    maxConnectionsPj: 2,
    connectionMode: 'continuous',
    calcTraceUnlocked: 'all',
    actionPlan: true,
    reportPdf: 'full',
    prolaboreOptimizer: false,
    limitAlerts: 'continuous',
    recoveryDossier: false,
    successFeeBps: { monthly: 2000, yearly: 1500 },
    lawChangeAlerts: 'personal_recalc',
    askLawMonthly: 20,
    seats: 1,
    clientPortfolio: false,
    supportLevel: 'email',
  },
  business: {
    priceMonthlyCents: 6990,
    priceYearlyCents: 59900,
    maxCpfs: 2,
    maxCnpjs: 1,
    maxConnectionsPf: 3,
    maxConnectionsPj: 3,
    connectionMode: 'continuous',
    calcTraceUnlocked: 'all',
    actionPlan: true,
    reportPdf: 'full',
    prolaboreOptimizer: 'interactive',
    limitAlerts: 'continuous',
    recoveryDossier: true,
    successFeeBps: { monthly: 2000, yearly: 1500 },
    lawChangeAlerts: 'personal_recalc',
    askLawMonthly: 60,
    seats: 2,
    clientPortfolio: false,
    supportLevel: 'chat',
  },
  accountant_partner: {
    priceMonthlyCents: 0,
    priceYearlyCents: null,
    maxCpfs: 0,
    maxCnpjs: 5,
    maxConnectionsPf: 1,
    maxConnectionsPj: 1,
    connectionMode: 'snapshot',
    snapshotTtlDays: 30,
    calcTraceUnlocked: 'all',
    actionPlan: true,
    reportPdf: 'full',
    prolaboreOptimizer: 'interactive',
    limitAlerts: 'once',
    recoveryDossier: true,
    successFeeBps: { monthly: 2000, yearly: 2000 },
    lawChangeAlerts: 'generic',
    askLawMonthly: 20,
    seats: 1,
    clientPortfolio: true,
    supportLevel: 'help_center',
  },
  accountant_pro: {
    priceMonthlyCents: 34900,
    priceYearlyCents: 349000,
    maxCpfs: 0,
    maxCnpjs: 30,
    maxConnectionsPf: 2,
    maxConnectionsPj: 2,
    connectionMode: 'continuous',
    calcTraceUnlocked: 'all',
    actionPlan: true,
    reportPdf: 'full',
    prolaboreOptimizer: 'interactive',
    limitAlerts: 'continuous',
    recoveryDossier: true,
    successFeeBps: { monthly: 1500, yearly: 1500 },
    lawChangeAlerts: 'personal_recalc',
    askLawMonthly: 300,
    seats: 3,
    clientPortfolio: true,
    supportLevel: 'chat',
  },
  accounting_firm: {
    priceMonthlyCents: 119000,
    priceYearlyCents: 1190000,
    maxCpfs: 0,
    maxCnpjs: 120,
    maxConnectionsPf: 2,
    maxConnectionsPj: 2,
    connectionMode: 'continuous',
    calcTraceUnlocked: 'all',
    actionPlan: true,
    reportPdf: 'whitelabel',
    prolaboreOptimizer: 'interactive',
    limitAlerts: 'continuous',
    recoveryDossier: true,
    successFeeBps: { monthly: 1500, yearly: 1500 },
    lawChangeAlerts: 'personal_recalc',
    askLawMonthly: 1000,
    seats: 10,
    clientPortfolio: true,
    supportLevel: 'account_manager',
  },
  api: {
    priceMonthlyCents: 490000,
    priceYearlyCents: null,
    maxCpfs: 0,
    maxCnpjs: 0,
    maxConnectionsPf: 0,
    maxConnectionsPj: 0,
    connectionMode: 'continuous',
    calcTraceUnlocked: 'all',
    actionPlan: true,
    reportPdf: 'whitelabel',
    prolaboreOptimizer: 'interactive',
    limitAlerts: 'continuous',
    recoveryDossier: true,
    successFeeBps: { monthly: 0, yearly: 0 },
    lawChangeAlerts: 'personal_recalc',
    askLawMonthly: 0,
    seats: 0,
    clientPortfolio: false,
    supportLevel: 'sla',
  },
};

/** The count limits of an Entitlements row. Flags and modes are not limits: they stay as 07 §3.5 wrote them. */
export const LIMIT_KEYS = [
  'maxCpfs',
  'maxCnpjs',
  'maxConnectionsPf',
  'maxConnectionsPj',
  'askLawMonthly',
  'seats',
] as const satisfies readonly (keyof Entitlements)[];

/**
 * D41 (PLAN §18, 20/11): each limit of a paid plan is the larger of its own and Grátis's, so paying never grants
 * less than the free tier. This deviates from 07 §3.5, which gave Pessoal 0 CNPJs and 0 PJ connections while Grátis
 * has 1 of each: upgrading from Grátis would have locked a user out of the company they had already analysed. A plan
 * is paid when it has a monthly price; Grátis itself and the free B2B tier (accountant_partner) keep 07's values.
 */
export function withFreeFloor(
  table: Readonly<Record<PlanId, Entitlements>>,
): Readonly<Record<PlanId, Entitlements>> {
  const free = table.free;
  const out: Record<PlanId, Entitlements> = { ...table };
  for (const id of Object.keys(table) as PlanId[]) {
    const plan = table[id];
    if (id === 'free' || (plan.priceMonthlyCents ?? 0) <= 0) continue;
    const floored: Entitlements = { ...plan };
    for (const key of LIMIT_KEYS) floored[key] = Math.max(plan[key], free[key]);
    out[id] = floored;
  }
  return out;
}

/** What each plan grants: 07 §3.5 with the D41 floor. */
export const PLANS: Readonly<Record<PlanId, Entitlements>> = withFreeFloor(PLANS_07);

/** Tier order for "two active subscriptions → the highest tier" (ARCHITECTURE §8.2). */
export const PLAN_TIER: readonly PlanId[] = [
  'free',
  'personal',
  'mei',
  'business',
  'accountant_partner',
  'accountant_pro',
  'accounting_firm',
  'api',
];

export function isPlanId(value: string): value is PlanId {
  return (PLAN_TIER as readonly string[]).includes(value);
}

/**
 * Hidden offer for the founder's real R$ 1,00 Pix (ARCHITECTURE §8.1; PLAN §11): AbacatePay's minimum charge is 100
 * cents. Grants 'business' for 7 days; at most 5 sales in total.
 */
export const VALIDATION_OFFER = {
  plan: 'business',
  amountCents: 100,
  days: 7,
  maxSales: 5,
} as const;

export type ChargePeriod = 'monthly' | 'yearly' | 'validation';

/**
 * Days a paid one-time Pix grants (ARCHITECTURE §8.4; ADR-009): yearly 366, monthly 31 ("Pix com lembrete", 07 §3.4,
 * while Pix Automático is not enabled), validation 7.
 */
export const PERIOD_DAYS: Readonly<Record<ChargePeriod, number>> = {
  yearly: 366,
  monthly: 31,
  validation: VALIDATION_OFFER.days,
};

/** Plans sold by Pix on the plans page (D3). B2B plans are "fale com a gente" or a free tier, never a Pix. */
export const PIX_PLANS = ['personal', 'mei', 'business'] as const;
export type PixPlanId = (typeof PIX_PLANS)[number];

export function isPixPlan(plan: string): plan is PixPlanId {
  return (PIX_PLANS as readonly string[]).includes(plan);
}

/**
 * Amount of a one-time Pix, in cents, straight from the catalog; null when the plan has no such price. The validation
 * period exists only for VALIDATION_OFFER.plan.
 */
export function pixAmountCents(plan: PlanId, period: ChargePeriod): number | null {
  if (period === 'validation')
    return plan === VALIDATION_OFFER.plan ? VALIDATION_OFFER.amountCents : null;
  if (!isPixPlan(plan)) return null;
  const cents = period === 'yearly' ? PLANS[plan].priceYearlyCents : PLANS[plan].priceMonthlyCents;
  return cents !== null && cents >= 100 ? cents : null;
}

/** `live_analyses_month` (ARCHITECTURE §8.2: cost protection, not from 07): 3 on free, 30 on any paid plan. */
export function liveAnalysesPerMonth(plan: PlanId): number {
  return plan === 'free' ? 3 : 30;
}
