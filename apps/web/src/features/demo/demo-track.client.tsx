'use client';

import { ArrowRight, FlaskConical } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  answersKey,
  type DemoTrackState,
  effectiveAnswers,
  fromQuery,
  loadTrack,
  saveTrack,
} from '@/demo/answers';
import { restartDemo, updatePersonaState } from '@/demo/demo-session';
import { ChoiceStep } from '@/features/track/choice-step.client';
import {
  ABROAD_OPTIONS,
  applies,
  EMPLOYEES_OPTIONS,
  REVENUE_OPTIONS,
  STEPS,
  type Step,
} from '@/features/track/steps';
import { StepTitle, TrackFrame } from '@/features/track/track-frame';
import { DemoCnpjStep } from './cnpj-step.client';
import { DemoConnectStep } from './connect-step.client';
import { demoBase, demoProgress, demoStepHref } from './progress';
import type { DemoPersonaView } from './types';

// The first-access track on /demo (D19; IDENTITY-AND-UI §5 "On /demo"): the same track as /app, with the
// persona's answers pre-selected and the advance button highlighted, so the visitor reaches the analysis with
// one tap per step. Answers live in the URL and in sessionStorage (ARCHITECTURE §13), never on a server.

export interface DemoTrackSlots {
  /** Server-rendered Screen 1 card (CompanyCard). */
  companyCard?: ReactNode;
  /** Server-rendered Screen 2 content (ConsentContent). */
  consent?: ReactNode;
  /** Every distinct estimate, rendered at build; the browser only picks one (ARCHITECTURE §4.2). */
  estimates?: { variants: Record<string, ReactNode>; index: Record<string, string> };
}

interface DemoTrackProps {
  persona: DemoPersonaView;
  step: Step;
  defaults: DemoTrackState;
  slots: DemoTrackSlots;
}

const FOOTNOTE = 'É só para estimar. O número exato vem do extrato.';

export function SkipToDashboard({ persona }: { persona: string }) {
  return (
    <Link
      href={`${demoBase(persona)}/painel` as Route}
      onClick={() => updatePersonaState(persona, { trackDone: true })}
      className="type-small text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      data-testid="skip-to-dashboard"
    >
      Pular para o painel
    </Link>
  );
}

export function RestartDemo({ onRestart }: { onRestart: () => void }) {
  return (
    <button
      type="button"
      onClick={() => {
        restartDemo();
        onRestart();
      }}
      className="type-small text-muted-foreground underline underline-offset-4 hover:text-foreground"
      data-testid="restart-demo"
    >
      Recomeçar demo
    </button>
  );
}

function Advance({
  label,
  onClick,
  className,
}: {
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button
      type="button"
      size="xl"
      onClick={onClick}
      className={`demo-cue w-full sm:w-auto sm:self-start ${className ?? ''}`}
      data-testid="track-advance"
    >
      {label}
      <ArrowRight className="size-4" strokeWidth={1.5} aria-hidden="true" />
    </Button>
  );
}

export function DemoTrack({ persona, step, defaults, slots }: DemoTrackProps) {
  const router = useRouter();
  const [state, setState] = useState<DemoTrackState>(defaults);

  // After hydration (the static HTML carries the persona's answers): the URL wins, then this tab's storage.
  useEffect(() => {
    const restored = fromQuery(window.location.search, loadTrack(persona.id, defaults));
    setState(restored);
    saveTrack(persona.id, restored);
  }, [persona.id, defaults]);

  const progress = demoProgress(step, state, persona);
  const next: Step | 'analysis' =
    STEPS.slice(STEPS.indexOf(step) + 1).find((s) => applies(s, progress)) ?? 'analysis';

  useEffect(() => {
    router.prefetch(demoStepHref(persona.id, next, state) as Route);
  }, [router, persona.id, next, state]);

  const go = useCallback(
    (target: Step | 'analysis', nextState: DemoTrackState = state) => {
      saveTrack(persona.id, nextState);
      setState(nextState);
      router.push(demoStepHref(persona.id, target, nextState) as Route);
    },
    [router, persona.id, state],
  );

  /** A chip saves the answer and the track walks on (ChoiceStep gives the 300 ms of feedback). */
  const choose = (patch: Partial<DemoTrackState['answers']>) => async () => {
    const nextState = { ...state, answers: { ...state.answers, ...patch } };
    saveTrack(persona.id, nextState);
    setState(nextState);
    return { ok: true as const, value: { next: demoStepHref(persona.id, next, nextState) } };
  };

  let body: ReactNode = null;
  switch (step) {
    case 'cnpj':
      body = (
        <>
          <StepTitle title="Qual é o CNPJ da sua empresa?" help="Leva uns 2 minutos." />
          <DemoCnpjStep
            personaCnpj={persona.cnpj}
            companyName={persona.companyName}
            onFound={() => go(next)}
          />
        </>
      );
      break;
    case 'confirmar-empresa':
      body = (
        <>
          <StepTitle title="É você?" />
          {slots.companyCard}
          <div className="mt-8 flex flex-col gap-2">
            <Advance label="Sou eu" onClick={() => go(next)} />
            <Button
              type="button"
              variant="link"
              size="lg"
              className="self-start px-0"
              onClick={() => go('cnpj')}
              data-testid="reject-company"
            >
              Não é minha empresa
            </Button>
          </div>
        </>
      );
      break;
    case 'faturamento':
    case 'funcionarios':
    case 'exterior': {
      const q = {
        faturamento: {
          title: 'Quanto a empresa fatura por mês, em média?',
          help: undefined,
          name: 'Faturamento médio por mês',
          options: REVENUE_OPTIONS,
          selected: state.answers.monthlyRevenueBracket,
          save: (v: string) =>
            choose({
              monthlyRevenueBracket: v as DemoTrackState['answers']['monthlyRevenueBracket'],
            }),
        },
        funcionarios: {
          title: 'Tem funcionários com carteira assinada?',
          help: undefined,
          name: 'Funcionários com carteira assinada',
          options: EMPLOYEES_OPTIONS,
          selected: state.answers.hasEmployees,
          save: (v: string) =>
            choose({ hasEmployees: v as DemoTrackState['answers']['hasEmployees'] }),
        },
        exterior: {
          title: 'Recebe de clientes no exterior?',
          help: 'Da receita da empresa nos últimos 12 meses.',
          name: 'Receita de clientes no exterior',
          options: ABROAD_OPTIONS,
          selected: state.answers.receivesFromAbroad,
          save: (v: string) =>
            choose({ receivesFromAbroad: v as DemoTrackState['answers']['receivesFromAbroad'] }),
        },
      }[step];
      body = (
        <>
          <StepTitle title={q.title} {...(q.help ? { help: q.help } : {})} />
          <ChoiceStep
            key={q.selected}
            name={q.name}
            options={q.options}
            selected={q.selected}
            save={(v) => q.save(v)()}
            footnote={FOOTNOTE}
          />
          {/* Mobile: the highlighted button stays in reach below 8 chips (sticky bar). */}
          <div className="sticky bottom-0 z-10 -mx-4 mt-4 border-t border-border bg-background px-4 py-3 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
            <Advance label="Continuar" onClick={() => go(next)} />
          </div>
        </>
      );
      break;
    }
    case 'estimativa': {
      const key = answersKey(effectiveAnswers(state.answers, persona.questions));
      const variant = slots.estimates?.index[key];
      body = (
        <>
          <StepTitle title="Quanto isso pode valer para você?" />
          <div data-testid="estimate-slot" data-answers={key}>
            {variant ? slots.estimates?.variants[variant] : null}
          </div>
          <Advance label="Ver o número exato" onClick={() => go(next)} className="mt-8" />
        </>
      );
      break;
    }
    case 'permissoes':
      body = (
        <>
          <StepTitle title="O que vamos ler e o que nunca fazemos" />
          {slots.consent}
          <Advance label="Conectar com Open Finance" onClick={() => go(next)} className="mt-8" />
        </>
      );
      break;
    case 'conta-pj':
      body = (
        <>
          <StepTitle title="Conecte a conta da empresa" />
          <ConnectSeal />
          <DemoConnectStep holder="PJ" account={persona.accounts.PJ} onContinue={() => go(next)} />
        </>
      );
      break;
    case 'conta-pf':
      body = (
        <>
          <StepTitle title="Agora a sua conta pessoal" />
          <ConnectSeal />
          <DemoConnectStep
            holder="PF"
            account={persona.accounts.PF}
            onContinue={() => go(next, { ...state, pfSkipped: false })}
            onSkip={() => go(next, { ...state, pfSkipped: true })}
          />
        </>
      );
      break;
  }

  return (
    <TrackFrame
      step={step}
      progress={progress}
      hrefOf={(s) => demoStepHref(persona.id, s, state)}
      exit={{ href: '/demo', label: 'Sair' }}
      topAction={<SkipToDashboard persona={persona.id} />}
      footerAction={
        <RestartDemo
          onRestart={() => {
            setState(defaults);
            router.push(`${demoBase(persona.id)}/comecar/cnpj` as Route);
          }}
        />
      }
    >
      {body}
    </TrackFrame>
  );
}

/** D3: the accounts on /demo are the persona's; the real integration is shown in the sandbox (/app, video). */
export function ConnectSeal() {
  return (
    <p
      className="type-caption mb-6 inline-flex items-center gap-2 self-start rounded-full border border-border bg-surface px-3 py-1 text-muted-foreground"
      data-testid="demo-connect-seal"
    >
      <FlaskConical className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
      dados da persona sintética · integração real demonstrada no sandbox
    </p>
  );
}
