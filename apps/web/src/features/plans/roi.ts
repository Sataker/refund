import { formatBRLWhole } from '@/lib/format';
import { perMonthOfYear, priceLabel } from './model';

// D58 (PLAN §18, 21/11): the ROI anchor of the Empresa offer. Integer cents only (rule 2): floor everywhere, so the
// claim is never rounded up. The savings basis is the estimate's minimum or the confirmed total, never the maximum.

const isCents = (n: number | null | undefined): n is number =>
  typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;

/**
 * How many times the savings pay the price, floored ("paga o plano 20 vezes"). Null when an input is missing or
 * invalid, when the price is zero, or when the savings do not cover the price once: then no ROI claim is made at all.
 */
export function roiMultiple(
  savingsCents: number | null | undefined,
  priceCents: number | null | undefined,
): number | null {
  if (!isCents(savingsCents) || !isCents(priceCents) || priceCents === 0) return null;
  if (savingsCents < priceCents) return null;
  return (savingsCents - (savingsCents % priceCents)) / priceCents;
}

/** A yearly amount spread over 12 months, floored to the cent ("cerca de R$ X por mês"). */
export function monthlyCents(annualCents: number): number {
  if (!isCents(annualCents)) return 0;
  return (annualCents - (annualCents % 12)) / 12;
}

/** The plans page with the yearly Empresa Pix preselected (it opens by itself) and the way back. */
export function unlockHref(returnTo: string): string {
  return `/app/plano?assinar=business-yearly&voltar=${encodeURIComponent(returnTo)}`;
}

export const CHECKOUT_PERIODS = ['monthly', 'yearly'] as const;
export const CHECKOUT_PLANS = ['personal', 'mei', 'business'] as const;
export type CheckoutIntent = {
  plan: (typeof CHECKOUT_PLANS)[number];
  period: (typeof CHECKOUT_PERIODS)[number];
};

/** `?assinar=<plan>-<period>`: only a Pix plan (PIX_PLANS) and monthly or yearly; anything else is ignored. */
export function parseCheckoutIntent(value: unknown): CheckoutIntent | null {
  if (typeof value !== 'string') return null;
  const m = /^(personal|mei|business)-(monthly|yearly)$/.exec(value);
  if (!m) return null;
  return { plan: m[1] as CheckoutIntent['plan'], period: m[2] as CheckoutIntent['period'] };
}

/** What the plans page headline rests on (built on the server by `roiBasis`). */
export interface RoiBasis {
  kind: 'confirmed' | 'estimate';
  cents: number;
  /** Bug bash 20/11 C1: an analysis over example statements never reads as the company's own number. */
  example: boolean;
}

export interface RoiHeadline {
  title: string;
  line: string;
  multiple: number;
  cents: number;
}

/**
 * D58 plans page: "Retorno de 20× para Marina Dev" and the basis in one line. Null without a basis or when the savings
 * do not pay the yearly price once (no claim at all).
 */
export function roiHeadline(
  basis: RoiBasis | null,
  yearlyCents: number,
  companyName: string,
): RoiHeadline | null {
  if (!basis) return null;
  const multiple = roiMultiple(basis.cents, yearlyCents);
  if (multiple === null) return null;
  const n = `${multiple.toLocaleString('pt-BR')}×`;
  const price = `${priceLabel(yearlyCents)}/ano (${priceLabel(perMonthOfYear(yearlyCents))}/mês) do plano Empresa`;
  const amount = formatBRLWhole(basis.cents);
  if (basis.kind === 'estimate') {
    return {
      title: `Retorno de ${n} para ${companyName}`,
      line: `Economia mínima estimada de ${amount} por ano, contra ${price}.`,
      multiple,
      cents: basis.cents,
    };
  }
  return basis.example
    ? {
        title: `No extrato de exemplo: retorno de ${n} para ${companyName}`,
        line: `${amount} nos próximos 12 meses sobre o extrato de exemplo, contra ${price}.`,
        multiple,
        cents: basis.cents,
      }
    : {
        title: `Retorno de ${n} para ${companyName}`,
        line: `${amount} confirmados nos próximos 12 meses, contra ${price}.`,
        multiple,
        cents: basis.cents,
      };
}
