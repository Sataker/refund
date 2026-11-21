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

// /app/plano: the checkout port backed by the server actions (bound on the server and handed in as props, so this
// file never imports `src/server/**`). After "paid" the page data is re-read (router.refresh): the plan is checked
// on the server on every read, never in this component.
// D58: when login is on and the session is anonymous, the checkout answers UNAUTHENTICATED with the sign-in path
// (`error.login`, under /auth/); the page goes there and the sign-in comes back to this page with the same intent.

type Result<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } };

/** The sign-in path of an UNAUTHENTICATED checkout, if it is a same-origin /auth/ path (never an open redirect). */
export function loginPathOf(error: { code: string }): string | null {
  if (error.code !== 'UNAUTHENTICATED') return null;
  const login: unknown = (error as { login?: unknown }).login;
  return typeof login === 'string' && /^\/auth\/[a-z-]+(\?[^#\s]*)?$/.test(login) ? login : null;
}

export interface LiveActions {
  start: (input: {
    planId: SellablePlan;
    period: Period | 'validation';
    code?: string;
  }) => Promise<Result<CheckoutCharge>>;
  get: (input: { chargeId: string }) => Promise<Result<{ status: ChargeStatus }>>;
  simulate: ((input: { chargeId: string }) => Promise<Result<void>>) | null;
}

export function LivePlans({
  actions,
  validationCode,
  ...props
}: Omit<PlansScreenProps, 'port' | 'simulated' | 'validationOffer'> & {
  actions: LiveActions | null;
  /** The code from the private link; present = the validation offer is shown. */
  validationCode: string | null;
}) {
  const router = useRouter();
  const opened = props.initialCheckout ?? null;
  // The intent is used once: a reload or the way back from the dialog must not open a second Pix by itself.
  useEffect(() => {
    if (!opened) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has('assinar')) return;
    url.searchParams.delete('assinar');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`);
  }, [opened]);
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
    <PlansScreen
      {...props}
      port={port}
      simulated={false}
      validationOffer={validationCode !== null}
    />
  );
}
