import { describe, expect, it } from 'vitest';
import { CHECKOUT_PLANS, parseCheckoutIntent } from '@/features/plans/roi.ts';
import { PIX_PLANS, PLANS } from './catalog.ts';
import { plansModel, roiOfferTerms } from './offer.ts';

// D37 (PLAN §18): the payment terms on /termos and the plans screen read these numbers. D41: Pessoal keeps Grátis's
// CNPJ, and the card copy reads it from the catalog.

describe('plansModel', () => {
  it('payment terms: 30-day guarantee, Pix refund within 7 days, CDC art. 49 withdrawal of 7 days', () => {
    expect(plansModel()).toMatchObject({
      guaranteeDays: 30,
      refundWithinDays: 7,
      withdrawalDays: 7,
    });
  });

  it('D41: Pessoal and Pessoal + MEI cover 1 CNPJ', () => {
    expect(plansModel()).toMatchObject({ personalCnpjs: 1, meiCnpjs: 1 });
  });
});

describe('roiOfferTerms (D58)', () => {
  it('quotes the Empresa prices and the D37 guarantee from the catalog', () => {
    expect(roiOfferTerms()).toEqual({
      price: { monthlyCents: 6990, yearlyCents: 59900 },
      guaranteeDays: 30,
    });
  });

  it("the offer's three bullets are what Empresa grants and Grátis does not", () => {
    // roi-offer.tsx: every calculation, the action plan with the DAS-by-DAS recovery, the full accountant report.
    expect(PLANS.business).toMatchObject({
      calcTraceUnlocked: 'all',
      actionPlan: true,
      recoveryDossier: true,
      reportPdf: 'full',
    });
    expect(PLANS.free).toMatchObject({
      calcTraceUnlocked: 1,
      actionPlan: false,
      recoveryDossier: false,
      reportPdf: 'summary',
    });
  });

  it('?assinar= accepts exactly the Pix plans', () => {
    expect([...CHECKOUT_PLANS]).toEqual([...PIX_PLANS]);
    for (const plan of PIX_PLANS)
      expect(parseCheckoutIntent(`${plan}-yearly`)).toEqual({ plan, period: 'yearly' });
  });
});
