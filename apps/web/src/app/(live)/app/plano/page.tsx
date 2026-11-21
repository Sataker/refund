import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Disclaimer } from '@/components/brand/disclaimer';
import { Logo } from '@/components/brand/logo';
import { SandboxSeal } from '@/components/brand/sandbox-seal';
import { companyNameOf } from '@/features/company/scope';
import { liveSealLabel } from '@/features/live/data-origin';
import { type LiveActions, LivePlans } from '@/features/plans/live-plans.client';
import { safeReturnPath } from '@/features/plans/return-path';
import { type CheckoutIntent, parseCheckoutIntent, roiHeadline } from '@/features/plans/roi';
import { LiveUnavailable } from '@/features/track/live-unavailable';
import { currentStep, plansReachable, stepPath } from '@/features/track/steps';
import { CONTACT_EMAIL, CONTACT_PLACEHOLDER } from '@/lib/contact';
import { requireCapability } from '@/server/capabilities.ts';
import { safeEqual } from '@/server/crypto.ts';
import { activePlanWith } from '@/server/entitlements.ts';
import { liveContext } from '@/server/live.ts';
import { paymentsConfig } from '@/server/payments/gateway.ts';
import { PLAN_TIER } from '@/server/plans/catalog.ts';
import { plansModel } from '@/server/plans/offer.ts';
import { roiBasis } from '@/server/plans/roi.ts';
import { loadTrack, originOfTrack } from '@/server/track/state.ts';
import { getCharge, simulateDevPayment, startPixCheckout } from './actions';

// Screen 10 live (ARCHITECTURE §13 `/app/plano`; IDENTITY-AND-UI Screen 10): the 4 cards with the catalog's prices and
// the real one-time Pix (AbacatePay). The plan in force is read on the server; the paywall itself lives in the
// server actions and the serialization, never here. `?oferta=validacao&codigo=…` shows the hidden R$ 1,00 offer.
// D58 (PLAN §18, 21/11): `?assinar=<plan>-<period>` preselects a Pix plan and opens its dialog (the ROI offer's
// "Desbloquear"), and the headline quotes the user's own return when there is a confirmed total or an estimate.

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
  // ARCHITECTURE §13 shell lock, relaxed by D58: the plan route opens once the estimate is on screen.
  const track = await loadTrack(db, userId);
  const { progress, company } = track;
  if (!plansReachable(progress)) redirect(stepPath(currentStep(progress)) as never);

  const { oferta, voltar, codigo, assinar, login } = await searchParams;
  // Back to where the offer or the paywall was seen: only a path of this user's own /app (no open redirect).
  const returnTo = safeReturnPath(voltar);
  const [active, basis] = await Promise.all([
    activePlanWith(db, userId),
    roiBasis(db, userId, track),
  ]);
  const model = plansModel();
  const roi = roiHeadline(
    basis,
    model.business.yearlyCents,
    company ? companyNameOf(company.company) : 'sua empresa',
  );
  const linkedCompany = company ? (company.company.mei.optedIn ? 'mei' : 'other') : null;
  const intent = fittingIntent(parseCheckoutIntent(assinar), linkedCompany, active.plan);
  const payments = paymentsConfig();
  const off = requireCapability('payments');
  // The R$ 1,00 offer shows only with VALIDATION_OFFER_CODE set and the right code in the link (the server action
  // checks it again; payments review M1).
  const offerCode =
    oferta === 'validacao' &&
    typeof codigo === 'string' &&
    payments?.validationCode &&
    safeEqual(codigo, payments.validationCode)
      ? codigo
      : null;
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
          <SandboxSeal
            live
            label={liveSealLabel(originOfTrack(track))}
            className="hidden sm:inline-flex"
          />
        </div>
      </header>
      <main
        id="conteudo"
        className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col gap-6 px-4 py-10 sm:px-6"
      >
        <div className="flex flex-col gap-2">
          <p className="type-small">
            <Link
              href={(returnTo ?? '/app') as Route}
              className="text-cobalt underline underline-offset-4"
            >
              ← Voltar
            </Link>
          </p>
          <h1
            className="font-serif text-[36px] leading-[40px] font-normal text-balance text-foreground lg:text-[44px] lg:leading-[48px]"
            data-testid="plans-heading"
            {...(roi ? { 'data-multiple': roi.multiple, 'data-cents': roi.cents } : {})}
          >
            {roi ? roi.title : 'O valor é grátis. O caminho completo é do plano.'}
          </h1>
          {roi ? (
            <p className="type-body-lg num max-w-[60ch] text-foreground" data-testid="plans-roi">
              {roi.line}
            </p>
          ) : null}
          <p className="type-small max-w-[60ch] text-muted-foreground">
            Todos os achados aparecem com o valor em qualquer plano. Os planos pagos abrem todos os
            cálculos, o plano de ação completo e o acompanhamento.
          </p>
        </div>
        <LivePlans
          model={model}
          current={active.plan}
          currentUntil={active.until ? DATE.format(active.until) : null}
          actions={actions}
          validationCode={offerCode}
          linkedCompany={linkedCompany}
          returnTo={returnTo}
          initialCheckout={intent}
          loginError={login === 'erro'}
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

/**
 * D58 (review L2): a link may only open a Pix that fits the linked company (Pessoal + MEI only for an MEI CNPJ) and
 * never a lower tier than the plan in force; anything else just shows the plans.
 */
function fittingIntent(
  intent: CheckoutIntent | null,
  linkedCompany: 'mei' | 'other' | null,
  current: string,
): CheckoutIntent | null {
  if (!intent) return null;
  if (intent.plan === 'mei' && linkedCompany !== 'mei') return null;
  const tiers = PLAN_TIER as readonly string[];
  if (tiers.indexOf(intent.plan) < tiers.indexOf(current)) return null;
  return intent;
}
