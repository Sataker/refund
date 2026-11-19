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

/**
 * The label of an alert's cash cost (UX review G2 M1): "custo de esperar até a DIRPF 2027 (Selic)". The year is the
 * one the engine wrote in the finding's own title ("… voltam na DIRPF 2027 …"); nothing is derived here.
 */
export function alertCostLabel(engineTitle: string): string {
  const year = /\bDIRPF (\d{4})\b/.exec(engineTitle)?.[1];
  return year
    ? `custo de esperar até a DIRPF ${year} (Selic)`
    : 'custo de esperar a restituição (Selic)';
}

/**
 * What follows "R$ X por ano" (UX review G2 M9): the finding's own regimeFrom ("a partir de abr/2027"); a finding with
 * none (R05 stacked on R01) gets "depois de {ano}" from the regime start the dashboard already shows
 * (`DashboardModel.regimeFrom`, the engine's), never the jargon "em regime".
 */
export function steadyStateSuffix(
  regimeFrom: string | null | undefined,
  anchor: string | null | undefined,
  formatYearMonth: (ym: string) => string,
): string {
  if (regimeFrom) return ` a partir de ${formatYearMonth(regimeFrom)}`;
  return anchor ? `, depois de ${anchor.slice(0, 4)}` : ' depois';
}

/** "13 pagamentos pessoais pela PJ" / "1 pagamento pessoal pela PJ" (UX review G2 M8). */
export function personalPaymentsText(count: number): string {
  return count === 1 ? '1 pagamento pessoal pela PJ' : `${count} pagamentos pessoais pela PJ`;
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

/**
 * The fictitious accountant of the demo, exactly as IDENTITY-AND-UI §2.3 and Screen 8 name her ("Ana Lima, CRC-SP").
 * The registration number is left out on purpose: a made-up CRC number could belong to a real professional.
 */
export const DEMO_ACCOUNTANT = 'Ana Lima';
/** The timeline line on the report (compliance review G2 L2): the name always says she is fictitious. */
export const DEMO_ACCOUNTANT_SHORT = 'Ana Lima (fictícia)';
export const DEMO_ACCOUNTANT_FULL = 'Ana Lima, CRC-SP (contadora fictícia)';
