'use client';

import { useEffect, useMemo, useState } from 'react';
import { demoSession, updatePersonaState } from '@/demo/demo-session';
import type { PlansModel } from './model';
import { type CheckoutPort, PlansScreen } from './plans-screen.client';

// /demo/[persona]/plano (ARCHITECTURE §8.3 "Demo", §13; TESTS D14): the plans screen with a simulated Pix. No server
// action, no network: the "charge" and the "payment" live in the visitor's browser (demo-session.ts), and every step
// says "simulação". The visitor already sees everything in the demo; this only stages the moment to pay.

const SIMULATED_BRCODE = 'SIMULACAO-REFUND-DEMO-ESTE-PIX-NAO-EXISTE-E-NAO-PODE-SER-PAGO';

function newChargeId(): string {
  try {
    return `demo-${crypto.randomUUID()}`;
  } catch {
    return `demo-${Date.now().toString(36)}`;
  }
}

export function DemoPlans({ persona, model }: { persona: string; model: PlansModel }) {
  const [current, setCurrent] = useState<string>('free');
  useEffect(() => {
    const p = demoSession().personas[persona]?.plan;
    if (p?.paidAt !== undefined) setCurrent(p.plan);
  }, [persona]);

  const port = useMemo<CheckoutPort>(
    () => ({
      async start(plan, period) {
        const chargeId = newChargeId();
        updatePersonaState(persona, { plan: { plan, period, chargeId } });
        const yearly = period === 'yearly';
        const price = period === 'validation' ? null : model[plan];
        const amountCents =
          price === null
            ? model.validation.amountCents
            : yearly
              ? price.yearlyCents
              : price.monthlyCents;
        return {
          ok: true,
          value: {
            chargeId,
            brCode: SIMULATED_BRCODE,
            brCodeBase64: '',
            expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
            devMode: true,
            amountCents,
          },
        };
      },
      async poll(chargeId) {
        const p = demoSession().personas[persona]?.plan;
        return {
          ok: true,
          value: {
            status: p?.chargeId === chargeId && p.paidAt !== undefined ? 'paid' : 'pending',
          },
        };
      },
      async simulate(chargeId) {
        const p = demoSession().personas[persona]?.plan;
        if (p?.chargeId !== chargeId) {
          return {
            ok: false,
            error: { code: 'NOT_FOUND', message: 'Simulação expirada. Abra de novo.' },
          };
        }
        updatePersonaState(persona, { plan: { ...p, paidAt: Date.now() } });
        return { ok: true, value: undefined };
      },
      onPaid: (plan) => setCurrent(plan),
    }),
    [persona, model],
  );

  return <PlansScreen model={model} current={current} port={port} simulated contactEmail={null} />;
}
