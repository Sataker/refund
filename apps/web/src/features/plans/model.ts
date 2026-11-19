// Screen 10 (IDENTITY-AND-UI; PLAN §17.1 D3 and D4). The numbers come from the catalog in code
// (`server/plans/catalog.ts`, copied from research 07) and reach the client only through this shape, built on the server
// by `server/plans/offer.ts`: a client file never imports `src/server/**`.

export type SellablePlan = 'personal' | 'mei' | 'business';
export type Period = 'monthly' | 'yearly';

export interface Price {
  monthlyCents: number;
  yearlyCents: number;
}

export interface PlansModel {
  personal: Price;
  mei: Price;
  business: Price;
  accountantPro: Price;
  accountantPartnerCnpjs: number;
  accountantProCnpjs: number;
  /** "Ver cálculo" open on the free plan (the largest finding). */
  freeOpenTraces: number;
  freeAnalysesPerMonth: number;
  paidAnalysesPerMonth: number;
  businessCpfs: number;
  /** D4: success fee in percent (roadmap; text only). */
  successFeePct: { monthly: number; yearly: number };
  /** The hidden R$ 1,00 offer (Empresa for N days). */
  validation: { amountCents: number; days: number };
  /** 07 §3.3: 30-day money-back guarantee. */
  guaranteeDays: number;
}

export const PLAN_NAME: Record<SellablePlan | 'free', string> = {
  free: 'Grátis',
  personal: 'Pessoal',
  mei: 'Pessoal + MEI',
  business: 'Empresa',
};

/** "R$ 599" for whole reais, "R$ 69,90" otherwise (the price line, not a calculation). */
export function priceLabel(cents: number): string {
  const reais = Math.floor(cents / 100);
  const rest = cents % 100;
  const whole = reais.toLocaleString('pt-BR');
  return rest === 0 ? `R$ ${whole}` : `R$ ${whole},${String(rest).padStart(2, '0')}`;
}

/** Yearly price spread over 12 months, rounded half-up to the cent as 07 §3.1 shows it (R$ 599 → "R$ 49,92/mês"). */
export function perMonthOfYear(yearlyCents: number): number {
  return Math.floor((yearlyCents * 2 + 12) / 24);
}
