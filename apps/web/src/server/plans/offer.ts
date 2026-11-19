import 'server-only';
import type { PlansModel, Price } from '@/features/plans/model.ts';
import { liveAnalysesPerMonth, PLANS, type PlanId, VALIDATION_OFFER } from './catalog.ts';

// The plans screen's numbers, read from the catalog (07 §3.1, §3.1b, §3.5) and handed to the client as plain data.

function price(plan: PlanId): Price {
  const p = PLANS[plan];
  if (p.priceMonthlyCents === null || p.priceYearlyCents === null) {
    throw new Error(`plansModel: ${plan} has no monthly and yearly price`);
  }
  return { monthlyCents: p.priceMonthlyCents, yearlyCents: p.priceYearlyCents };
}

/** 07 §3.3 "Garantia 1": 30 days, full refund of the first payment. */
const GUARANTEE_DAYS = 30;

export function plansModel(): PlansModel {
  const free = PLANS.free;
  const business = PLANS.business;
  return {
    personal: price('personal'),
    mei: price('mei'),
    business: price('business'),
    accountantPro: price('accountant_pro'),
    accountantPartnerCnpjs: PLANS.accountant_partner.maxCnpjs,
    accountantProCnpjs: PLANS.accountant_pro.maxCnpjs,
    freeOpenTraces: free.calcTraceUnlocked === 'all' ? 0 : free.calcTraceUnlocked,
    freeAnalysesPerMonth: liveAnalysesPerMonth('free'),
    paidAnalysesPerMonth: liveAnalysesPerMonth('business'),
    businessCpfs: business.maxCpfs,
    successFeePct: {
      monthly: business.successFeeBps.monthly / 100,
      yearly: business.successFeeBps.yearly / 100,
    },
    validation: { amountCents: VALIDATION_OFFER.amountCents, days: VALIDATION_OFFER.days },
    guaranteeDays: GUARANTEE_DAYS,
  };
}
