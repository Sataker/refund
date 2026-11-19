import type { Actor } from '@refund/engine';

// Display text shared by the server pages and the client screens of E13. No runtime import from @refund/engine
// (types only), so the dashboard and confirm bundles do not carry the engine (ARCHITECTURE §11.1 budget).

export interface Urgency {
  /** Items with `daysLeft ≤ 30` (C.12.2: the "prazo acabando" seal). */
  count: number;
  /** The smallest `daysLeft`, as the engine computed it. */
  days: number;
}

export const URGENT_DAYS = 30;

/** "1 mês prescreve em 11 dias" / "3 meses prescrevem em 4 dias" (IDENTITY-AND-UI Screen 6b, 16/11). */
export function urgencyText(u: Urgency): string {
  const days = `${u.days} ${u.days === 1 ? 'dia' : 'dias'}`;
  return u.count === 1 ? `1 mês prescreve em ${days}` : `${u.count} meses prescrevem em ${days}`;
}

/** CivilDate "2026-11-12" → "12/11/2026". */
export function formatCivilDate(date: string): string {
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}

export const ACTOR_LABEL: Readonly<Record<Actor, string>> = {
  you: 'Você',
  accountant: 'Contador',
  you_or_accountant: 'Você ou contador',
  lawyer: 'Advogado',
};
