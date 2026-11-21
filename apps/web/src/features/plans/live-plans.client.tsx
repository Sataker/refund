'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import type { Period, SellablePlan } from './model';
import {
  type ChargeStatus,
  type CheckoutCharge,
  type CheckoutPort,
  PlansScreen,
  type PlansScreenProps,
} from './plans-screen.client';
import { loginPathOf } from './return-path';

// /app/plano: the checkout port backed by the server actions (bound on the server and handed in as props, so this
// file never imports `src/server/**`). After "paid" the page data is re-read (router.refresh): the plan is checked
// on the server on every read, never in this component.
// D58: when login is on and the session is anonymous, the checkout answers UNAUTHENTICATED with the sign-in path
// (`error.login`, under /auth/); the page goes there and the sign-in comes back to this page with the same intent.

type Result<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } };

export interface LiveActions {
  start: (input: {
    planId: SellablePlan;
    period: Period | 'validation';
    code?: string;
  }) => Promise<Result<CheckoutCharge>>;
  get: (input: { chargeId: string }) => Promise<Result<{ status: ChargeStatus }>>;
  simulate: ((input: { chargeId: string }) => Promise<Result<void>>) | null;
}

/** D58: "Tentar de novo" after a failed sign-in (the auth callback sends `?login=erro`). */
export const RETRY_LOGIN = `/auth/entrar?voltar=${encodeURIComponent('/app/plano')}`;

export type LoginError = 'erro' | 'confirme-email';

const LOGIN_ERROR_TEXT: Readonly<Record<LoginError, string>> = {
  erro: 'Não conseguimos concluir o login. Tente de novo.',
  'confirme-email':
    'Este e-mail já tem uma conta no Refund. Confirme o e-mail no login para entrar nela.',
};

export function LivePlans({
  actions,
  validationCode,
  loginError = null,
  ...props
}: Omit<PlansScreenProps, 'port' | 'simulated' | 'validationOffer'> & {
  actions: LiveActions | null;
  /** The code from the private link; present = the validation offer is shown. */
  validationCode: string | null;
  /**
   * D58: the sign-in did not complete (`?login=erro` from the auth callback), or WorkOS returned an unverified
   * e-mail that already has an account (`?login=confirme-email`).
   */
  loginError?: LoginError | null;
}) {
  const router = useRouter();
  // `assinar` and `login` are used once: a reload or the way back must not open a second Pix or repeat the alert.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('assinar') && !url.searchParams.has('login')) return;
    url.searchParams.delete('assinar');
    url.searchParams.delete('login');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`);
  }, []);
  const port = useMemo<CheckoutPort | null>(() => {
    if (!actions) return null;
    const { simulate } = actions;
    return {
      start: async (planId, period) => {
        const r = await actions.start({
          planId,
          period,
          ...(period === 'validation' && validationCode ? { code: validationCode } : {}),
        });
        const login = r.ok ? null : loginPathOf(r.error);
        // A route handler that redirects to the identity provider: a full navigation, not a client transition.
        if (login) window.location.assign(login);
        return r;
      },
      poll: (chargeId) => actions.get({ chargeId }),
      ...(simulate ? { simulate: (chargeId: string) => simulate({ chargeId }) } : {}),
      onPaid: () => router.refresh(),
    };
  }, [actions, router, validationCode]);
  return (
    <>
      {loginError ? (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-col gap-3 rounded-lg border border-warning bg-warning-soft p-4 sm:flex-row sm:items-center sm:justify-between"
          data-testid="login-error"
        >
          <p className="type-small text-foreground">{LOGIN_ERROR_TEXT[loginError]}</p>
          {/* A route handler that redirects to the identity provider: a plain link, a full navigation. */}
          <a
            href={RETRY_LOGIN}
            className="type-small inline-flex min-h-11 items-center justify-center rounded-md border border-strong-border bg-surface px-4 font-medium text-foreground hover:bg-muted"
            data-testid="login-retry"
          >
            Tentar de novo
          </a>
        </div>
      ) : null}
      <PlansScreen
        {...props}
        port={port}
        simulated={false}
        validationOffer={validationCode !== null}
      />
    </>
  );
}
