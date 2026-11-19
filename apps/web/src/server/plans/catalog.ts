import 'server-only';
import type { PlanId } from '../result.ts';

export type { PlanId } from '../result.ts';

// ARCHITECTURE §8.1: constants in code (changing a price or a limit = a commit). Values from research 07 §3.1, §3.1b and
// §3.5 (07 rules on values). E17 checks this file against 07 and adds VALIDATION_OFFER, the plan screen and Pix.

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
export const PLANS: Readonly<Record<PlanId, Entitlements>> = {
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

/** `live_analyses_month` (ARCHITECTURE §8.2: cost protection, not from 07): 3 on free, 30 on any paid plan. */
export function liveAnalysesPerMonth(plan: PlanId): number {
  return plan === 'free' ? 3 : 30;
}
