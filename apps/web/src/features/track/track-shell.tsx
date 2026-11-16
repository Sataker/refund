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
  stepPath,
  stepSummary,
  type TrackProgress,
} from './steps';

// IDENTITY-AND-UI §5 "First-access track": no sidebar, tab bar or navigation; only the logo, the
// timeline in 4 stages, the SandboxSeal, the Disclaimer and a discreet "Sair". Mobile: a 4-segment bar
// with the stage name, never "pergunta 3 de 9". Desktop: a vertical timeline beside a 560px column.

interface TrackShellProps {
  step: Step;
  progress: TrackProgress;
  children: ReactNode;
}

function stageState(stageId: number, step: Step, p: TrackProgress): 'done' | 'current' | 'todo' {
  const stage = STAGES.find((s) => s.id === stageId);
  const current = stageOf(step).id;
  if (stageId < current) return 'done';
  if (stageId > current) return 'todo';
  const steps = (stage?.steps ?? []) as readonly Step[];
  return steps.length > 0 && steps.every((s) => !applies(s, p) || isDone(s, p))
    ? 'done'
    : 'current';
}

/** Fraction of the current stage already done (the mobile segment fills as its steps complete). */
function stageFill(step: Step, p: TrackProgress): number {
  const steps = (stageOf(step).steps as readonly Step[]).filter((s) => applies(s, p));
  if (steps.length === 0) return 0;
  return steps.filter((s) => isDone(s, p)).length / steps.length;
}

export function TrackShell({ step, progress, children }: TrackShellProps) {
  const stage = stageOf(step);
  const back = previousStep(step, progress);
  const current = currentStep(progress);
  const fill = stageFill(step, progress);

  return (
    <div className="flex min-h-dvh flex-col bg-background" data-testid="track" data-step={step}>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-[1120px] items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" aria-label="Refund, página inicial" className="text-xl">
            <Logo />
          </Link>
          <div className="flex items-center gap-4">
            <SandboxSeal className="hidden sm:inline-flex" />
            <Link
              href="/"
              className="type-small text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Sair
            </Link>
          </div>
        </div>
        {/* Mobile timeline: 4 segments + the stage name. */}
        <div className="mx-auto max-w-[1120px] px-4 pb-3 lg:hidden" data-testid="track-progress">
          <div className="flex gap-1.5" aria-hidden="true">
            {STAGES.map((s) => {
              const state = stageState(s.id, step, progress);
              const width =
                state === 'done' ? 100 : state === 'current' ? Math.max(12, fill * 100) : 0;
              return (
                <span key={s.id} className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                  <span
                    className="block h-full rounded-full bg-foreground transition-[width] duration-(--dur-base)"
                    style={{ width: `${width}%` }}
                  />
                </span>
              );
            })}
          </div>
          <p className="type-caption mt-2 text-muted-foreground">
            {stage.id} de 4 · {stage.name}
          </p>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[1120px] flex-1 gap-10 px-4 py-6 sm:px-6 lg:grid-cols-[240px_minmax(0,560px)] lg:justify-center lg:gap-16 lg:py-12">
        <nav aria-label="Etapas do primeiro acesso" className="hidden lg:block">
          <ol className="sticky top-12 flex flex-col gap-6">
            {STAGES.map((s) => {
              const state = stageState(s.id, step, progress);
              const steps = (s.steps as readonly Step[]).filter((x) => applies(x, progress));
              return (
                <li key={s.id} aria-current={s.id === stage.id ? 'step' : undefined}>
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
                        const summary = stepSummary(x, progress);
                        const done = isDone(x, progress);
                        const here = x === step;
                        const reachable = done || x === current;
                        const label = summary ?? STEP_LABEL[x];
                        return (
                          <li key={x} className="type-small">
                            {reachable && !here ? (
                              <Link
                                href={stepPath(x) as Route}
                                className="inline-flex items-center gap-1.5 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                              >
                                {done ? (
                                  <Check className="size-3.5 text-success" aria-hidden="true" />
                                ) : null}
                                {label}
                              </Link>
                            ) : (
                              <span
                                className={cn(
                                  'inline-flex items-center gap-1.5',
                                  here ? 'font-medium text-foreground' : 'text-subtle',
                                )}
                              >
                                {done ? (
                                  <Check className="size-3.5 text-success" aria-hidden="true" />
                                ) : null}
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

        <main className="flex min-w-0 flex-col">
          <div className="mb-6 h-10">
            {back ? (
              <Link
                href={stepPath(back) as Route}
                className="type-small inline-flex h-10 items-center gap-2 rounded-md pr-3 text-muted-foreground hover:text-foreground"
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

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[1120px] flex-col gap-3 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Disclaimer size="caption" />
          <SandboxSeal className="self-start sm:hidden" />
        </div>
      </footer>
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
