import { describe, expect, it } from 'vitest';
import {
  isPixPlan,
  liveAnalysesPerMonth,
  PERIOD_DAYS,
  PLANS,
  pixAmountCents,
  VALIDATION_OFFER,
} from './catalog.ts';

// E17 task 1: the catalog in code against research 07 §3.1, §3.1b and §3.5 (07 rules on values). Each number below is
// typed from the 07 tables, not from catalog.ts.

describe('plan prices (07 §3.1 and §3.1b)', () => {
  it.each([
    ['free', 0, null],
    ['personal', 2490, 19900],
    ['mei', 3490, 29900],
    ['business', 6990, 59900],
    ['accountant_partner', 0, null],
    ['accountant_pro', 34900, 349000],
    ['accounting_firm', 119000, 1190000],
    ['api', 490000, null],
  ] as const)('%s: monthly %s, yearly %s cents', (plan, monthly, yearly) => {
    expect(PLANS[plan].priceMonthlyCents).toBe(monthly);
    expect(PLANS[plan].priceYearlyCents).toBe(yearly);
  });
});

describe('entitlement matrix (07 §3.5)', () => {
  it('limits per plan', () => {
    const rows = Object.fromEntries(
      Object.entries(PLANS).map(([id, p]) => [
        id,
        [p.maxCpfs, p.maxCnpjs, p.maxConnectionsPf, p.maxConnectionsPj, p.askLawMonthly, p.seats],
      ]),
    );
    expect(rows).toEqual({
      free: [1, 1, 1, 1, 3, 1],
      personal: [1, 0, 3, 0, 20, 1],
      mei: [1, 1, 2, 2, 20, 1],
      business: [2, 1, 3, 3, 60, 2],
      accountant_partner: [0, 5, 1, 1, 20, 1],
      accountant_pro: [0, 30, 2, 2, 300, 3],
      accounting_firm: [0, 120, 2, 2, 1000, 10],
      api: [0, 0, 0, 0, 0, 0],
    });
  });

  it('flags per plan', () => {
    expect(PLANS.free).toMatchObject({
      connectionMode: 'snapshot',
      snapshotTtlDays: 30,
      calcTraceUnlocked: 1,
      actionPlan: false,
      reportPdf: 'summary',
      prolaboreOptimizer: 'result_only',
      limitAlerts: 'once',
      recoveryDossier: false,
      lawChangeAlerts: 'generic',
      supportLevel: 'help_center',
    });
    expect(PLANS.personal).toMatchObject({
      connectionMode: 'continuous',
      calcTraceUnlocked: 'all',
      prolaboreOptimizer: false,
      limitAlerts: false,
      recoveryDossier: false,
      lawChangeAlerts: 'personal',
      supportLevel: 'email',
    });
    expect(PLANS.mei).toMatchObject({
      prolaboreOptimizer: false,
      limitAlerts: 'continuous',
      recoveryDossier: false,
      lawChangeAlerts: 'personal_recalc',
    });
    expect(PLANS.business).toMatchObject({
      calcTraceUnlocked: 'all',
      actionPlan: true,
      reportPdf: 'full',
      prolaboreOptimizer: 'interactive',
      limitAlerts: 'continuous',
      recoveryDossier: true,
      lawChangeAlerts: 'personal_recalc',
      supportLevel: 'chat',
    });
    expect(PLANS.accounting_firm.reportPdf).toBe('whitelabel');
    expect(PLANS.accountant_partner.clientPortfolio).toBe(true);
  });

  it('success fee in basis points (07 §3.2: 20%, 15% on the annual)', () => {
    expect(PLANS.free.successFeeBps).toEqual({ monthly: 2000, yearly: 2000 });
    expect(PLANS.personal.successFeeBps).toEqual({ monthly: 2000, yearly: 2000 });
    expect(PLANS.mei.successFeeBps).toEqual({ monthly: 2000, yearly: 1500 });
    expect(PLANS.business.successFeeBps).toEqual({ monthly: 2000, yearly: 1500 });
    expect(PLANS.accountant_pro.successFeeBps).toEqual({ monthly: 1500, yearly: 1500 });
  });
});

describe('Pix amounts and periods (ARCHITECTURE §8.1, §8.4)', () => {
  it('VALIDATION_OFFER: R$ 1,00 = Empresa for 7 days, at most 5 sales', () => {
    expect(VALIDATION_OFFER).toEqual({ plan: 'business', amountCents: 100, days: 7, maxSales: 5 });
  });

  it('periods: yearly 366, monthly 31, validation 7 days', () => {
    expect(PERIOD_DAYS).toEqual({ yearly: 366, monthly: 31, validation: 7 });
  });

  it('the amount comes from the catalog; free, B2B and validation of another plan have none', () => {
    expect(pixAmountCents('business', 'yearly')).toBe(59900);
    expect(pixAmountCents('business', 'monthly')).toBe(6990);
    expect(pixAmountCents('personal', 'yearly')).toBe(19900);
    expect(pixAmountCents('mei', 'monthly')).toBe(3490);
    expect(pixAmountCents('business', 'validation')).toBe(100);
    expect(pixAmountCents('personal', 'validation')).toBeNull();
    expect(pixAmountCents('free', 'monthly')).toBeNull();
    expect(pixAmountCents('accountant_pro', 'monthly')).toBeNull();
    expect(isPixPlan('accountant_pro')).toBe(false);
  });

  it('live_analyses_month: 3 free, 30 paid (ARCHITECTURE §8.2)', () => {
    expect(liveAnalysesPerMonth('free')).toBe(3);
    expect(liveAnalysesPerMonth('business')).toBe(30);
  });
});
