import 'server-only';
import type { PlansModel, Price, RoiOfferTerms } from '@/features/plans/model.ts';
import { liveAnalysesPerMonth, PLANS, type PlanId, VALIDATION_OFFER } from './catalog.ts';

// The plans screen's numbers, read from the catalog (07 §3.1, §3.1b, §3.5) and handed to the client as plain data.

function price(plan: PlanId): Price {
  const p = PLANS[plan];
  if (p.priceMonthlyCents === null || p.priceYearlyCents === null) {
    throw new Error(`plansModel: ${plan} has no monthly and yearly price`);
  }
  return { monthlyCents: p.priceMonthlyCents, yearlyCents: p.priceYearlyCents };
}

/**
 * 07 §3.3 "Garantia 1" and D37 (PLAN §18): 30 days counted from the payment, full refund of the first payment, by
 * Pix within REFUND_WITHIN_DAYS of the request. The refund webhook cancels the charge's period
 * (server/webhooks/abacatepay.ts → refundCharge), so the plan ends when the money goes back.
 */
export const GUARANTEE_DAYS = 30;
export const REFUND_WITHIN_DAYS = 7;
/** D37: Código de Defesa do Consumidor, art. 49: 7 days to withdraw from a purchase made outside a shop. */
export const WITHDRAWAL_DAYS = 7;

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
    personalCnpjs: PLANS.personal.maxCnpjs,
    meiCnpjs: PLANS.mei.maxCnpjs,
    successFeePct: {
      monthly: business.successFeeBps.monthly / 100,
      yearly: business.successFeeBps.yearly / 100,
    },
    validation: { amountCents: VALIDATION_OFFER.amountCents, days: VALIDATION_OFFER.days },
    guaranteeDays: GUARANTEE_DAYS,
    refundWithinDays: REFUND_WITHIN_DAYS,
    withdrawalDays: WITHDRAWAL_DAYS,
  };
}

/** D58: the Empresa terms the ROI offer quotes (price and guarantee), from the same catalog as the plans screen. */
export function roiOfferTerms(): RoiOfferTerms {
  const m = plansModel();
  return { price: m.business, guaranteeDays: m.guaranteeDays };
}
