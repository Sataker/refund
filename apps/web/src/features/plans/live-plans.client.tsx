'use client';

import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
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

type Result<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } };

export interface LiveActions {
  start: (input: {
    planId: SellablePlan;
    period: Period | 'validation';
  }) => Promise<Result<CheckoutCharge>>;
  get: (input: { chargeId: string }) => Promise<Result<{ status: ChargeStatus }>>;
  simulate: ((input: { chargeId: string }) => Promise<Result<void>>) | null;
}

export function LivePlans({
  actions,
  ...props
}: Omit<PlansScreenProps, 'port' | 'simulated'> & { actions: LiveActions | null }) {
  const router = useRouter();
  const port = useMemo<CheckoutPort | null>(() => {
    if (!actions) return null;
    const { simulate } = actions;
    return {
      start: (planId, period) => actions.start({ planId, period }),
      poll: (chargeId) => actions.get({ chargeId }),
      ...(simulate ? { simulate: (chargeId: string) => simulate({ chargeId }) } : {}),
      onPaid: () => router.refresh(),
    };
  }, [actions, router]);
  return <PlansScreen {...props} port={port} simulated={false} />;
}
