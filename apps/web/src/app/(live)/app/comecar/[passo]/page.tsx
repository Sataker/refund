import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { joinWaitlist } from '@/app/(marketing)/actions';
import { CnpjStep } from '@/features/company/cnpj-step.client';
import { CompanyCard } from '@/features/company/company-card';
import { EstimateView, RuleList } from '@/features/company/estimate-view';
import { estimateStop, regimeStop } from '@/features/company/scope';
import { ConnectStep } from '@/features/connection/connect-step.client';
import { ConsentContent } from '@/features/connection/consent-content';
import { WaitlistForm } from '@/features/landing/waitlist-form.client';
import { AdvanceButton } from '@/features/track/advance-button.client';
import { ChoiceStep } from '@/features/track/choice-step.client';
import { LiveUnavailable } from '@/features/track/live-unavailable';
import {
  ABROAD_OPTIONS,
  access,
  EMPLOYEES_OPTIONS,
  isStep,
  REVENUE_OPTIONS,
  type Step,
  stepPath,
  type TrackProgress,
} from '@/features/track/steps';
import { StepTitle, TrackShell } from '@/features/track/track-shell';
import { estimateFor } from '@/server/company/lookup.ts';
import {
  completeAnswers,
  meiNearLimit,
  meiRevenueOptions,
  todayBrt,
} from '@/server/company/profile.ts';
import { CONSENT_SCOPES, TERMS_VERSION } from '@/server/connection/connections.ts';
import { pluggyAvailable } from '@/server/financial/availability.ts';
import { liveContext } from '@/server/live.ts';
import { loadTrack, type TrackCompany } from '@/server/track/state.ts';
import {
  answerStep,
  confirmCompany,
  connectSampleData,
  createConnectToken,
  getConnectionStatus,
  lookupCnpj,
  markEstimateSeen,
  recordConsent,
  registerPluggyItem,
  rejectCompany,
  revokeConnection,
  skipPersonalAccount,
} from '../actions';

// First-access track, one step per screen (D19; IDENTITY-AND-UI §5; ARCHITECTURE §13). The step comes
// from the URL, the progress from the anonymous session; a future step or a skipped conditional step
// redirects to the right one, and answered steps stay open for corrections.

interface PageProps {
  params: Promise<{ passo: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const CONNECT_ACTIONS = {
  connectSample: connectSampleData,
  createConnectToken,
  registerItem: registerPluggyItem,
  getStatus: getConnectionStatus,
  revoke: revokeConnection,
};

export default async function TrackStepPage({ params, searchParams }: PageProps) {
  const { passo } = await params;
  if (!isStep(passo)) notFound();
  const ctx = await liveContext();
  if (!ctx.ok) return <LiveUnavailable message={ctx.error.message} />;
  const { db, userId, caps, secrets } = ctx.value;
  const { progress, company } = await loadTrack(db, userId);
  const gate = access(passo, progress);
  if (gate.kind === 'redirect') redirect(stepPath(gate.to) as never);

  const query = await searchParams;
  const typed = typeof query.cnpj === 'string' ? query.cnpj : undefined;
  const pluggyOn =
    passo === 'conta-pj' || passo === 'conta-pf' ? await pluggyAvailable(caps, secrets) : false;

  return (
    <TrackShell
      step={passo}
      progress={progress}
      synthetic={company?.company.source === 'persona' || company?.company.source === 'replay'}
    >
      <StepBody
        step={passo}
        progress={progress}
        company={company}
        typedCnpj={typed}
        pluggyOn={pluggyOn}
      />
    </TrackShell>
  );
}

function StepBody({
  step,
  progress,
  company,
  typedCnpj,
  pluggyOn,
}: {
  step: Step;
  progress: TrackProgress;
  company: TrackCompany | null;
  typedCnpj: string | undefined;
  pluggyOn: boolean;
}) {
  switch (step) {
    case 'cnpj':
      return (
        <>
          <StepTitle title="Qual é o CNPJ da sua empresa?" />
          <CnpjStep lookup={lookupCnpj} {...(typedCnpj ? { initial: typedCnpj } : {})} />
        </>
      );
    case 'confirmar-empresa': {
      if (!company) return null;
      const stop = regimeStop(company.company);
      if (stop !== null) {
        const c = company.company;
        return (
          <>
            <StepTitle title="É você?" />
            <CompanyCard company={c} />
            <ScopeStop
              message={stop.message}
              reason={stop.reason}
              data={{ [`data-${stop.reason}`]: stop.regime }}
              waitlist={
                stop.reason === 'regime'
                  ? 'Quer saber quando o Refund calcular o seu regime? Deixe seu e-mail.'
                  : null
              }
            />
          </>
        );
      }
      return (
        <>
          <StepTitle title="É você?" />
          <CompanyCard company={company.company} />
          <div className="mt-8 flex flex-col gap-2">
            <AdvanceButton action={confirmCompany} label="Sou eu" testId="confirm-company" />
            <AdvanceButton
              action={rejectCompany}
              label="Não é minha empresa"
              variant="link"
              arrow={false}
              testId="reject-company"
              className="-mt-2 items-start"
            />
          </div>
        </>
      );
    }
    case 'faturamento': {
      // H5: an MEI only sees the bands an MEI can have (the engine's limit with its tolerance).
      const allowed =
        company?.company.mei.optedIn === true
          ? new Set(meiRevenueOptions(company.company, todayBrt()))
          : null;
      return (
        <>
          <StepTitle title="Quanto a empresa fatura por mês, em média?" />
          <ChoiceStep
            name="Faturamento médio por mês"
            options={
              allowed ? REVENUE_OPTIONS.filter((o) => allowed.has(o.value)) : REVENUE_OPTIONS
            }
            selected={progress.answers.monthlyRevenueBracket}
            save={answerStep.bind(null, 'faturamento')}
            footnote="É só para estimar. O número exato vem do extrato."
          />
        </>
      );
    }
    case 'funcionarios':
      return (
        <>
          <StepTitle title="Tem funcionários com carteira assinada?" />
          <ChoiceStep
            name="Funcionários com carteira assinada"
            options={EMPLOYEES_OPTIONS}
            selected={progress.answers.hasEmployees}
            save={answerStep.bind(null, 'funcionarios')}
            footnote="É só para estimar. O número exato vem do extrato."
          />
        </>
      );
    case 'exterior':
      return (
        <>
          <StepTitle title="Recebe de clientes no exterior?" />
          <ChoiceStep
            name="Receita de clientes no exterior"
            options={ABROAD_OPTIONS}
            selected={progress.answers.receivesFromAbroad}
            save={answerStep.bind(null, 'exterior')}
            footnote="É só para estimar. O número exato vem do extrato."
          />
        </>
      );
    case 'estimativa': {
      if (!company) return null;
      // H5: an MEI stops here with its own reason (a fixed DAS-MEI, no anexo); the MEI limit alert only when the
      // revenue band can reach R03's alert floor.
      const stopHere = estimateStop(company.company);
      if (stopHere?.reason === 'mei') {
        const estimate = estimateFor(company.company, completeAnswers(progress.answers));
        const near = meiNearLimit(
          company.company,
          progress.answers.monthlyRevenueBracket,
          todayBrt(),
        );
        const r03 =
          near && estimate.ok ? estimate.value.rules.filter((r) => r.ruleId === 'R03') : [];
        return (
          <>
            <StepTitle title="Quanto isso pode valer para você?" />
            <RuleList rules={r03} />
            <ScopeStop
              message={stopHere.message}
              reason="mei"
              data={{ 'data-cnae': stopHere.cnae }}
              waitlist={null}
            />
          </>
        );
      }
      const estimate = estimateFor(company.company, completeAnswers(progress.answers));
      // The activity stop: like the regime one, the track ends here with the ways out (no consent, no bank).
      const activity = stopHere;
      return (
        <>
          <StepTitle title="Quanto isso pode valer para você?" />
          {estimate.ok ? (
            <EstimateView estimate={estimate.value} cnae={company.company.primaryCnae.code} />
          ) : (
            <p className="type-body-lg text-muted-foreground" role="alert">
              {estimate.error.message}
            </p>
          )}
          {activity !== null ? (
            <ScopeStop
              message={activity.message}
              reason="activity"
              data={{ 'data-cnae': activity.cnae }}
              waitlist="Quer saber quando o Refund calcular a sua atividade? Deixe seu e-mail."
            />
          ) : (
            <AdvanceButton
              action={markEstimateSeen}
              label="Ver o número exato"
              testId="see-exact-number"
              className="mt-8"
            />
          )}
        </>
      );
    }
    case 'permissoes':
      return (
        <>
          <StepTitle title="O que vamos ler e o que nunca fazemos" />
          <ConsentContent />
          <AdvanceButton
            action={recordConsent.bind(null, {
              scopes: [...CONSENT_SCOPES],
              termsVersion: TERMS_VERSION,
            })}
            label="Conectar com Open Finance"
            testId="give-consent"
            className="mt-8"
          />
        </>
      );
    case 'conta-pj':
      return (
        <>
          <StepTitle title="Conecte a conta da empresa" />
          <ConnectStep
            holder="PJ"
            pluggyOn={pluggyOn}
            existing={progress.pj}
            nextHref={stepPath('conta-pf')}
            {...(company ? { companyCnpj: company.company.cnpj } : {})}
            actions={CONNECT_ACTIONS}
          />
        </>
      );
    case 'conta-pf':
      return (
        <>
          <StepTitle title="Agora a sua conta pessoal" />
          <ConnectStep
            holder="PF"
            pluggyOn={pluggyOn}
            existing={progress.pf}
            nextHref={stepPath('done')}
            actions={{ ...CONNECT_ACTIONS, skip: skipPersonalAccount }}
          />
        </>
      );
  }
}

/**
 * The out-of-scope stop (H3), for the regime at "É você?" and for the activity at the estimate: the reason in plain
 * words and the ways out (the demo, another CNPJ, the waitlist). Never a button that goes on.
 */
function ScopeStop({
  message,
  reason,
  data,
  waitlist,
}: {
  message: string;
  reason: 'regime' | 'activity' | 'status' | 'mei';
  data: Record<`data-${string}`, string>;
  /** The one waitlist line (null: no waitlist, e.g. a closed company). */
  waitlist: string | null;
}) {
  return (
    <>
      <section
        className="mt-8 flex flex-col gap-4 rounded-lg border border-warning bg-warning-soft p-5"
        data-testid="out-of-scope"
        data-reason={reason}
        {...data}
        aria-labelledby="fora-titulo"
      >
        <p id="fora-titulo" className="type-body-lg text-foreground" role="status">
          {message}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Link
            href="/demo"
            data-testid="out-of-scope-demo"
            className="inline-flex min-h-12 items-center justify-center rounded-md bg-primary px-5 font-medium text-primary-foreground"
          >
            Ver a demo com a Marina
          </Link>
          <AdvanceButton
            action={rejectCompany}
            label="Usar outro CNPJ"
            variant="outline"
            arrow={false}
            testId="out-of-scope-other-cnpj"
          />
        </div>
      </section>
      {waitlist ? (
        <section className="mt-8" aria-label="Lista de espera">
          <WaitlistForm join={joinWaitlist} label={waitlist} cnpjKnown />
        </section>
      ) : null}
    </>
  );
}
