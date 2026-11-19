import 'server-only';
import type { DomainError, Result } from '@refund/engine';

// ARCHITECTURE §4.7. Server actions return Result<T, ActionError> and never throw to the client.

/** ARCHITECTURE §8.1. The catalog (PLANS, Entitlements) arrives in E14 under `server/plans/`. */
export type PlanId =
  | 'free'
  | 'personal'
  | 'mei'
  | 'business'
  | 'accountant_partner'
  | 'accountant_pro'
  | 'accounting_firm'
  | 'api';

export type ActionErrorCode =
  | 'NOT_CONFIGURED'
  | 'RATE_LIMITED'
  | 'PLAN_LIMIT'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'INVALID_INPUT'
  | 'UNAVAILABLE'
  // DomainError codes surfaced by the company and connection actions (E11).
  | 'NOT_FOUND'
  | 'CONSENT_REQUIRED'
  // Plans and Pix (E17): the R$ 1,00 validation offer reached its ceiling of sales.
  | 'SOLD_OUT';

export interface ActionError extends DomainError {
  code: ActionErrorCode | (string & {});
  upgrade?: { resource: string; suggestedPlan: PlanId; url: '/app/plano' };
}

export type ActionResult<T> = Result<T, ActionError>;

export function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

export function fail(
  code: ActionErrorCode,
  message: string,
  extra: Partial<Omit<ActionError, 'code' | 'message'>> = {},
): { ok: false; error: ActionError } {
  return { ok: false, error: { code, message, recoverable: code !== 'FORBIDDEN', ...extra } };
}
