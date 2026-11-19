import { ArrowLeft, Check } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Disclaimer } from '@/components/brand/disclaimer';
import { Logo } from '@/components/brand/logo';
import { SandboxSeal } from '@/components/brand/sandbox-seal';
import { cn } from '@/lib/utils';
import {
  applies,
  currentStep,
  isDone,
  previousStep,
  STAGES,
  STEP_LABEL,
  type Step,
  stageOf,
  stepSummary,
  type TrackProgress,
} from './steps';

// The first-access track frame (IDENTITY-AND-UI §5 "First-access track"), shared by /demo and /app: the
// same layout as E11's TrackShell, with the URLs injected (`hrefOf`), so both modes draw one track. No
// hooks: it renders inside a server page (/app) or inside the demo's client track (answers in the URL).
// Only the logo, the 4-stage timeline, the SandboxSeal, the Disclaimer and a discreet exit (rule 5).

export interface TrackFrameProps {
  /** The step on screen; 'analysis' = stage 4 (Screen 4), full width without the side timeline. */
  step: Step | 'analysis';
  progress: TrackProgress;
  hrefOf: (step: Step) => string;
  exit: { href: string; label: string };
  /** Discreet action at the top, e.g. "Pular para o painel" on /demo. */
  topAction?: ReactNode;
  /** Discreet action in the footer, e.g. "Recomeçar demo". */
  footerAction?: ReactNode;
  /** Live `/app`: the seal says the company data is public and real (SandboxSeal `live`). */
  live?: boolean;
  children: ReactNode;
}

type StageState = 'done' | 'current' | 'todo';

function stageState(stageId: number, step: TrackFrameProps['step'], p: TrackProgress): StageState {
  const current = step === 'analysis' ? 4 : stageOf(step).id;
  if (stageId < current) return 'done';
  if (stageId > current) return 'todo';
  const steps = (STAGES.find((s) => s.id === stageId)?.steps ?? []) as readonly Step[];
  return steps.length > 0 && steps.every((s) => !applies(s, p) || isDone(s, p))
    ? 'done'
    : 'current';
}

/** Fraction of the current stage already done (the mobile segment fills as its steps complete). */
function stageFill(step: TrackFrameProps['step'], p: TrackProgress): number {
  if (step === 'analysis') return 0.5;
  const steps = (stageOf(step).steps as readonly Step[]).filter((s) => applies(s, p));
  if (steps.length === 0) return 0;
  return steps.filter((s) => isDone(s, p)).length / steps.length;
}

export function TrackProgressBar({
  step,
  progress,
  className,
}: {
  step: TrackFrameProps['step'];
  progress: TrackProgress;
  className?: string;
}) {
  const stage = step === 'analysis' ? STAGES[3] : stageOf(step);
  const fill = stageFill(step, progress);
  return (
    <div className={className} data-testid="track-progress">
      <div className="flex gap-1.5" aria-hidden="true">
        {STAGES.map((s) => {
          const state = stageState(s.id, step, progress);
          const width = state === 'done' ? 100 : state === 'current' ? Math.max(12, fill * 100) : 0;
          return (
            <span key={s.id} className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
              <span
                className="block h-full origin-left rounded-full bg-foreground transition-transform duration-(--dur-base) ease-(--ease-out-expo)"
                style={{ transform: `scaleX(${width / 100})` }}
              />
            </span>
          );
        })}
      </div>
      <p className="type-caption mt-2 text-muted-foreground">
        {stage.id} de 4 · {stage.name}
      </p>
    </div>
  );
}

function Timeline({
  step,
  progress,
  hrefOf,
}: Pick<TrackFrameProps, 'step' | 'progress' | 'hrefOf'>) {
  const current = currentStep(progress);
  return (
    <nav aria-label="Etapas do primeiro acesso" className="hidden lg:block">
      <ol className="sticky top-12 flex flex-col gap-6">
        {STAGES.map((s) => {
          const state = stageState(s.id, step, progress);
          const steps = (s.steps as readonly Step[]).filter((x) => applies(x, progress));
          const here = step === 'analysis' ? s.id === 4 : s.id === stageOf(step).id;
          return (
            <li key={s.id} aria-current={here ? 'step' : undefined}>
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    'num grid size-6 shrink-0 place-items-center rounded-full border text-[12px] font-semibold',
                    state === 'done' && 'border-success bg-success text-background',
                    state === 'current' && 'border-foreground text-foreground',
                    state === 'todo' && 'border-border text-subtle',
                  )}
                >
                  {state === 'done' ? (
                    <Check className="size-3.5" strokeWidth={2.5} aria-hidden="true" />
                  ) : (
                    s.id
                  )}
                </span>
                <span
                  className={cn(
                    'type-small font-medium',
                    state === 'todo' ? 'text-subtle' : 'text-foreground',
                  )}
                >
                  {s.name}
                </span>
              </div>
              {steps.length > 0 ? (
                <ul className="mt-2 ml-3 flex flex-col gap-1 border-l border-border pl-6">
                  {steps.map((x) => {
                    const done = isDone(x, progress);
                    const isHere = x === step;
                    const reachable = done || x === current;
                    const label = stepSummary(x, progress) ?? STEP_LABEL[x];
                    const mark = done ? (
                      <Check className="size-3.5 shrink-0 text-success" aria-hidden="true" />
                    ) : null;
                    return (
                      <li key={x} className="type-small" data-testid={`timeline-${x}`}>
                        {reachable && !isHere ? (
                          <Link
                            href={hrefOf(x) as Route}
                            className="inline-flex min-h-6 items-center gap-1.5 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                          >
                            {mark}
                            {label}
                          </Link>
                        ) : (
                          <span
                            className={cn(
                              'inline-flex min-h-6 items-center gap-1.5',
                              isHere ? 'font-medium text-foreground' : 'text-subtle',
                            )}
                          >
                            {mark}
                            {label}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function TrackHeader({
  step,
  progress,
  exit,
  topAction,
  live = false,
}: Pick<TrackFrameProps, 'step' | 'progress' | 'exit' | 'topAction' | 'live'>) {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex h-14 max-w-[1120px] items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="Refund, página inicial" className="text-xl">
          <Logo />
        </Link>
        <div className="flex items-center gap-4">
          <SandboxSeal live={live} className="hidden md:inline-flex" />
          {topAction}
          <Link
            href={exit.href as Route}
            className="type-small text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {exit.label}
          </Link>
        </div>
      </div>
      <TrackProgressBar
        step={step}
        progress={progress}
        className={cn('mx-auto max-w-[1120px] px-4 pb-3', step !== 'analysis' && 'lg:hidden')}
      />
    </header>
  );
}

export function TrackFooter({
  footerAction,
  live = false,
}: Pick<TrackFrameProps, 'footerAction' | 'live'>) {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-3 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Disclaimer size="caption" />
        <div className="flex flex-wrap items-center gap-4">
          <SandboxSeal live={live} className="md:hidden" />
          {footerAction}
        </div>
      </div>
    </footer>
  );
}

export function TrackFrame({
  step,
  progress,
  hrefOf,
  exit,
  topAction,
  footerAction,
  live = false,
  children,
}: TrackFrameProps) {
  const back = step === 'analysis' ? null : previousStep(step, progress);
  return (
    <div
      className="flex min-h-dvh flex-col overflow-x-clip bg-background"
      data-testid="track"
      data-step={step}
    >
      <TrackHeader step={step} progress={progress} exit={exit} topAction={topAction} live={live} />
      <div className="mx-auto grid w-full max-w-[1120px] flex-1 gap-10 px-4 py-6 sm:px-6 lg:grid-cols-[240px_minmax(0,560px)] lg:justify-center lg:gap-16 lg:py-12">
        <Timeline step={step} progress={progress} hrefOf={hrefOf} />
        <main id="conteudo" className="flex min-w-0 flex-col">
          <div className="mb-4 h-10">
            {back ? (
              <Link
                href={hrefOf(back) as Route}
                className="type-small -ml-1 inline-flex h-10 items-center gap-2 rounded-md pr-3 pl-1 text-muted-foreground hover:text-foreground"
                data-testid="track-back"
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
                Voltar
              </Link>
            ) : null}
          </div>
          <div key={step} className="step-enter flex flex-col">
            {children}
          </div>
        </main>
      </div>
      <TrackFooter footerAction={footerAction} live={live} />
    </div>
  );
}

/** Question title (≤ 8 words) + at most one help line (simplicity rule 1). */
export function StepTitle({ title, help }: { title: string; help?: string }) {
  return (
    <div className="mb-8">
      <h1 className="type-h1 text-balance text-foreground">{title}</h1>
      {help ? <p className="type-body-lg mt-3 text-muted-foreground">{help}</p> : null}
    </div>
  );
}
