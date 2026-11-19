import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Disclaimer } from '@/components/brand/disclaimer';
import { Logo } from '@/components/brand/logo';
import { SandboxSeal } from '@/components/brand/sandbox-seal';
import { type LiveActions, LivePlans } from '@/features/plans/live-plans.client';
import { LiveUnavailable } from '@/features/track/live-unavailable';
import { currentStep, stepPath } from '@/features/track/steps';
import { CONTACT_EMAIL, CONTACT_PLACEHOLDER } from '@/lib/contact';
import { requireCapability } from '@/server/capabilities.ts';
import { activePlanWith } from '@/server/entitlements.ts';
import { liveContext } from '@/server/live.ts';
import { paymentsConfig } from '@/server/payments/gateway.ts';
import { plansModel } from '@/server/plans/offer.ts';
import { loadTrack } from '@/server/track/state.ts';
import { getCharge, simulateDevPayment, startPixCheckout } from './actions';

// Screen 10 live (ARCHITECTURE §13 `/app/plano`; IDENTITY-AND-UI Screen 10): the 4 cards with the catalog's prices and
// the real one-time Pix (AbacatePay). The plan in force is read on the server; the paywall itself lives in the
// server actions and the serialization, never here. `?oferta=validacao` shows the hidden R$ 1,00 offer.

export const metadata: Metadata = { title: 'Planos · Refund', robots: { index: false } };

const DATE = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  dateStyle: 'short',
});

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await liveContext();
  if (!ctx.ok) return <LiveUnavailable message={ctx.error.message} />;
  const { db, userId } = ctx.value;
  // ARCHITECTURE §13 shell lock: the plan route waits for the first-access track like the other shell routes.
  const { progress } = await loadTrack(db, userId);
  const step = currentStep(progress);
  if (step !== 'done') redirect(stepPath(step) as never);

  const { oferta } = await searchParams;
  const active = await activePlanWith(db, userId);
  const payments = paymentsConfig();
  const off = requireCapability('payments');
  const actions: LiveActions | null = payments
    ? {
        start: startPixCheckout,
        get: getCharge,
        simulate: payments.keyMode === 'test' ? simulateDevPayment : null,
      }
    : null;

  return (
    <div className="flex min-h-dvh flex-col bg-background" data-testid="plan-page">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-[1120px] items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="Refund, página inicial" className="text-xl">
            <Logo />
          </Link>
          <SandboxSeal live className="hidden sm:inline-flex" />
        </div>
      </header>
      <main
        id="conteudo"
        className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col gap-6 px-4 py-10 sm:px-6"
      >
        <div className="flex flex-col gap-2">
          <p className="type-small">
            <Link href={'/app' as Route} className="text-cobalt underline underline-offset-4">
              ← Voltar
            </Link>
          </p>
          <h1 className="font-serif text-[36px] leading-[40px] font-normal text-foreground lg:text-[44px] lg:leading-[48px]">
            O valor é grátis. O caminho completo é do plano.
          </h1>
          <p className="type-small max-w-[60ch] text-muted-foreground">
            Todos os achados aparecem com o valor em qualquer plano. Os planos pagos abrem todos os
            cálculos, o plano de ação completo e o acompanhamento.
          </p>
        </div>
        <LivePlans
          model={plansModel()}
          current={active.plan}
          currentUntil={active.until ? DATE.format(active.until) : null}
          actions={actions}
          validationOffer={oferta === 'validacao'}
          contactEmail={CONTACT_EMAIL === CONTACT_PLACEHOLDER ? null : CONTACT_EMAIL}
          {...(off.ok ? {} : { offMessage: off.error.message })}
        />
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto max-w-[1120px] px-4 py-5 sm:px-6">
          <Disclaimer size="caption" />
        </div>
      </footer>
    </div>
  );
}
