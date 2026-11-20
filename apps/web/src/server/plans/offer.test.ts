import { describe, expect, it } from 'vitest';
import { plansModel } from './offer.ts';

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
