'use client';

import { Check, RotateCcw } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { formatBRL } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { ConfirmCard } from './confirm';
import type { DashboardModel } from './model';
import { formatCivilDate } from './text';
import { useVisitorAnswers } from './visitor.client';

// Screen 7 on /demo (IDENTITY-AND-UI §5; EXECUTION §9 16/11): the pipeline's cards come already answered by the
// persona (ENGINE-SPEC F.2). The visitor goes through them; any change runs the real pipeline again and the total
// follows. Ordered by effect on the total (D23).

interface ConfirmScreenProps {
  persona: string;
  holderName: string;
  base: DashboardModel;
  cards: ConfirmCard[];
}

export function ConfirmScreen({ persona, holderName, base, cards }: ConfirmScreenProps) {
  const v = useVisitorAnswers(persona, cards, base);
  const pending = cards.filter((c) => !v.reviewed.includes(c.id)).length;

  if (cards.length === 0)
    return (
      <p
        className="rounded-lg border border-border bg-surface p-6 text-base text-foreground"
        data-testid="confirm-empty"
      >
        Nada para confirmar. Tudo o que achamos já está sólido.
      </p>
    );

  return (
    <div className="flex flex-col gap-6" data-testid="confirm" data-ready={v.ready}>
      <header className="flex flex-col gap-3">
        <h1 className="font-serif text-[36px] leading-[40px] font-normal text-foreground lg:text-[44px] lg:leading-[48px]">
          Confirmar
        </h1>
        <p className="max-w-[64ch] text-base text-muted-foreground">
          Estas são as perguntas que a análise fez, já respondidas como a {holderName} respondeu.
          Revise cada uma; se mudar uma resposta, o motor refaz a conta.
        </p>
        <div className="flex flex-col gap-1.5">
          <p className="type-small text-foreground">
            <span data-testid="confirm-pending" data-count={pending} className="num font-medium">
              {pending === 0 ? 'Tudo revisado' : `Faltam ${pending} de ${cards.length}`}
            </span>
          </p>
          <div className="flex h-1.5 gap-1" aria-hidden="true">
            {cards.map((c) => (
              <span
                key={c.id}
                className={cn(
                  'h-full flex-1 rounded-full',
                  v.reviewed.includes(c.id) ? 'bg-foreground' : 'bg-surface-3',
                )}
              />
            ))}
          </div>
        </div>
      </header>

      <div
        className="sticky top-14 z-20 -mx-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border bg-background/95 px-4 py-3 backdrop-blur lg:top-[57px] lg:mx-0 lg:rounded-lg lg:border lg:px-5"
        aria-live="polite"
      >
        <span className="type-small text-muted-foreground">
          Total confirmado, próximos 12 meses
        </span>
        <span
          className={cn(
            'type-money-md num text-found-ink transition-opacity',
            v.status === 'loading' && 'opacity-50',
          )}
          data-testid="confirm/total"
          data-cents={v.model.total}
          data-status={v.status}
        >
          {formatBRL(v.model.total)}
        </span>
        {v.status === 'error' ? (
          <span
            className="type-small flex w-full items-center justify-between gap-3 text-foreground"
            role="alert"
          >
            Não conseguimos refazer a conta agora.
            <Button type="button" variant="outline" size="sm" onClick={v.retry}>
              <RotateCcw className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
              Tentar de novo
            </Button>
          </span>
        ) : null}
      </div>

      <ol className="flex flex-col gap-4">
        {cards.map((c, i) => {
          const choice = v.choices[c.id] ?? c.personaChoice;
          const reviewed = v.reviewed.includes(c.id);
          return (
            <li
              key={c.id}
              data-testid={`card-${c.id}`}
              data-choice={choice}
              data-reviewed={reviewed}
              className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="type-caption num text-muted-foreground">
                  {i + 1} de {cards.length}
                </span>
                {reviewed ? (
                  <span className="type-caption inline-flex items-center gap-1 text-success">
                    <Check className="size-3.5" strokeWidth={2} aria-hidden="true" />
                    revisada
                  </span>
                ) : null}
              </div>
              {c.sample ? (
                <div className="flex flex-col gap-0.5">
                  <p
                    className="type-money-md num text-foreground"
                    data-cents={c.sample.amountCents}
                  >
                    {formatBRL(c.sample.amountCents)}
                  </p>
                  <p className="type-small num text-muted-foreground">
                    {formatCivilDate(c.sample.date)} · {c.sample.label}
                    {c.transactions > 1 ? ` · e mais ${c.transactions - 1}` : ''}
                  </p>
                </div>
              ) : null}
              <p className="type-body-lg text-foreground" id={`q-${c.id}`}>
                {c.text}
              </p>
              {c.impact > 0 ? (
                <p className="type-small text-muted-foreground">
                  Pode mudar até <span className="num text-foreground">{formatBRL(c.impact)}</span>{' '}
                  no total.
                </p>
              ) : null}
              <fieldset aria-labelledby={`q-${c.id}`} className="flex flex-wrap gap-2">
                {c.options.map((o) => {
                  const on = o.value === choice;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      aria-pressed={on}
                      data-testid={`answer-${c.id}-${o.value}`}
                      onClick={() => v.choose(c.id, o.value)}
                      className={cn(
                        'type-small min-h-11 rounded-md border px-4 font-medium transition-colors duration-(--dur-fast)',
                        on
                          ? 'border-foreground bg-foreground text-background'
                          : 'border-strong-border bg-surface text-foreground hover:bg-surface-2',
                      )}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </fieldset>
              <p className="type-caption text-muted-foreground">
                {choice === c.personaChoice
                  ? `Resposta da ${holderName}.`
                  : 'Sua resposta (diferente da persona).'}
              </p>
            </li>
          );
        })}
      </ol>

      {pending === 0 ? (
        <div
          className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5 sm:flex-row sm:items-center sm:justify-between"
          data-testid="confirm-done"
        >
          <p className="text-base text-foreground">
            Pronto. Suas respostas confirmaram{' '}
            <span className="num font-medium">{formatBRL(v.model.total)}</span>.
          </p>
          <Link
            href={`/demo/${persona}/painel` as Route}
            className="type-small inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 font-medium text-primary-foreground"
          >
            Voltar ao painel
          </Link>
        </div>
      ) : null}
    </div>
  );
}
