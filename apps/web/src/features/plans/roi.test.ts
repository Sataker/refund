import { describe, expect, it } from 'vitest';
import { RETURN_PATH, safeReturnPath } from './return-path';
import { monthlyCents, parseCheckoutIntent, roiMultiple, unlockHref } from './roi';

const EMPRESA_YEARLY = 59_900;

describe('roiMultiple (D58: the minimum pays the plan N times, floored)', () => {
  it('floors the multiple, never rounding up', () => {
    expect(roiMultiple(4_000_000, EMPRESA_YEARLY)).toBe(66);
    // ENGINE-SPEC C.11.10 hero minimum, R$ 12.463,38: 20,8× → 20.
    expect(roiMultiple(1_246_338, EMPRESA_YEARLY)).toBe(20);
    expect(roiMultiple(6_231_800, EMPRESA_YEARLY)).toBe(104);
  });

  it('exactly the price is 1×; one cent below is no claim at all', () => {
    expect(roiMultiple(EMPRESA_YEARLY, EMPRESA_YEARLY)).toBe(1);
    expect(roiMultiple(EMPRESA_YEARLY - 1, EMPRESA_YEARLY)).toBeNull();
  });

  it('a zero or missing estimate makes no ROI claim', () => {
    expect(roiMultiple(0, EMPRESA_YEARLY)).toBeNull();
    expect(roiMultiple(null, EMPRESA_YEARLY)).toBeNull();
    expect(roiMultiple(undefined, EMPRESA_YEARLY)).toBeNull();
  });

  it('refuses a missing or zero price and anything that is not integer cents', () => {
    expect(roiMultiple(4_000_000, 0)).toBeNull();
    expect(roiMultiple(4_000_000, null)).toBeNull();
    expect(roiMultiple(4_000_000.5, EMPRESA_YEARLY)).toBeNull();
    expect(roiMultiple(-4_000_000, EMPRESA_YEARLY)).toBeNull();
    expect(roiMultiple(Number.MAX_SAFE_INTEGER + 1, EMPRESA_YEARLY)).toBeNull();
  });

  it('stays exact at the edge of safe integers', () => {
    expect(roiMultiple(Number.MAX_SAFE_INTEGER, 1)).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('monthlyCents', () => {
  it('a twelfth of the year, floored to the cent', () => {
    expect(monthlyCents(1_246_338)).toBe(103_861);
    expect(monthlyCents(1_200)).toBe(100);
    expect(monthlyCents(11)).toBe(0);
    expect(monthlyCents(0)).toBe(0);
  });

  it('is 0 for anything that is not integer cents', () => {
    expect(monthlyCents(-1_200)).toBe(0);
    expect(monthlyCents(1.5)).toBe(0);
  });
});

describe('the checkout intent (?assinar=)', () => {
  it('accepts only a Pix plan with monthly or yearly', () => {
    expect(parseCheckoutIntent('business-yearly')).toEqual({ plan: 'business', period: 'yearly' });
    expect(parseCheckoutIntent('mei-monthly')).toEqual({ plan: 'mei', period: 'monthly' });
    for (const bad of [
      'business-validation',
      'accountant_pro-yearly',
      'free-monthly',
      'business-yearly ',
      'business',
      '',
      undefined,
      ['business-yearly'],
    ])
      expect(parseCheckoutIntent(bad)).toBeNull();
  });

  it('the unlock link carries the intent and an encoded way back that the plans page accepts', () => {
    const href = unlockHref('/app/comecar/estimativa');
    expect(href).toBe('/app/plano?assinar=business-yearly&voltar=%2Fapp%2Fcomecar%2Festimativa');
    const url = new URL(href, 'https://example.test');
    expect(parseCheckoutIntent(url.searchParams.get('assinar'))).toEqual({
      plan: 'business',
      period: 'yearly',
    });
    expect(safeReturnPath(url.searchParams.get('voltar'))).toBe('/app/comecar/estimativa');
  });
});

describe('the way back (no open redirect)', () => {
  const id = '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0';
  it('accepts the estimate and the analysis screens only', () => {
    for (const ok of [
      '/app/comecar/estimativa',
      `/app/analises/${id}`,
      `/app/analises/${id}/painel`,
      `/app/analises/${id}/achados/${id}`,
    ])
      expect(RETURN_PATH.test(ok)).toBe(true);
    for (const bad of [
      '//evil.test',
      'https://evil.test/app/comecar/estimativa',
      '/app/comecar/cnpj',
      '/app/comecar/estimativa/../../x',
      `/app/analises/${id}/x`,
      '/app',
      null,
    ])
      expect(safeReturnPath(bad)).toBeNull();
  });
});
