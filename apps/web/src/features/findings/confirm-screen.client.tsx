'use client';

import { Check, RotateCcw } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { sampleDescription } from '@/features/demo/display';
import { formatBRL } from '@/lib/format';
import { cn } from '@/lib/utils';
import { type ConfirmCard, DONT_KNOW, OTHER, otherCents, parseReaisToCents } from './confirm';
import type { DashboardModel } from './model';
import { formatCivilDate } from './text';
import { useVisitorAnswers } from './visitor.client';

// Screen 7 on /demo (IDENTITY-AND-UI §5; EXECUTION §9 16/11): the pipeline's cards come already answered by the
// persona (ENGINE-SPEC F.2), so they count as answered (UX review H3). The visitor can confirm them all at once or
// change any; a change runs the real pipeline again and the total follows. Ordered by effect on the total (D23).
// "Pendentes" are the cards the engine still has open ("Não sei").

interface ConfirmScreenProps {
  persona: string;
  holderName: string;
  base: DashboardModel;
  cards: ConfirmCard[];
}

/** Cards that ask the same question (two employees) get "pessoa 1 de 2" so the visitor can tell them apart. */
function twins(cards: readonly ConfirmCard[]): Record<string, string> {
  const byText = new Map<string, string[]>();
  for (const c of cards) byText.set(c.text, [...(byText.get(c.text) ?? []), c.id]);
  const out: Record<string, string> = {};
  for (const ids of byText.values())
    if (ids.length > 1)
      for (const [i, id] of ids.entries()) out[id] = `pessoa ${i + 1} de ${ids.length}`;
  return out;
}

export function ConfirmScreen({ persona, holderName, base, cards }: ConfirmScreenProps) {
  const v = useVisitorAnswers(persona, cards, base);
  const choiceOf = (c: ConfirmCard) => v.choices[c.id] ?? c.personaChoice;
  const open = cards.filter((c) => choiceOf(c) === DONT_KNOW).length;
  const answered = cards.length - open;
  const allReviewed = cards.every((c) => v.reviewed.includes(c.id));
  const labels = twins(cards);

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
          Estas são as perguntas que a análise fez, já respondidas como a {holderName} respondeu. Se
          mudar uma resposta, o motor refaz a conta.
        </p>
        <div className="flex flex-col gap-1.5">
          <p className="type-small text-foreground">
            <span
              data-testid="confirm-pending"
              data-count={open}
              data-answered={answered}
              className="num font-medium"
            >
              {answered} de {cards.length} respondidas
            </span>
            {open === 0 ? ' · revise se quiser' : ` · ${open} em aberto`}
          </p>
          <div className="flex h-1.5 gap-1" aria-hidden="true">
            {cards.map((c) => (
              <span
                key={c.id}
                className={cn(
                  'h-full flex-1 rounded-full',
                  choiceOf(c) === DONT_KNOW ? 'bg-surface-3' : 'bg-foreground',
                )}
              />
            ))}
          </div>
        </div>
        {allReviewed && !v.custom ? null : (
          // UX review G2 H1: once an answer differs from the persona's, the primary action confirms the visitor's
          // answers and a secondary one brings the persona's back (the build-time total, to the cent).
          <div className="flex flex-wrap items-center gap-3">
            {allReviewed ? null : (
              <Button type="button" size="lg" data-testid="confirm-all" onClick={v.reviewAll}>
                <Check className="size-4" strokeWidth={1.5} aria-hidden="true" />
                {v.custom
                  ? 'Confirmar minhas respostas'
                  : `Confirmar as respostas da ${holderName}`}
              </Button>
            )}
            {v.custom ? (
              <Button
                type="button"
                size="lg"
                variant="outline"
                data-testid="restore-persona"
                onClick={v.restorePersona}
              >
                <RotateCcw className="size-4" strokeWidth={1.5} aria-hidden="true" />
                Voltar às respostas da {holderName}
              </Button>
            ) : null}
          </div>
        )}
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

      {allReviewed ? (
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

      <ol className="flex flex-col gap-4">
        {cards.map((c, i) => (
          <CardItem
            key={c.id}
            card={c}
            index={i}
            total={cards.length}
            twin={labels[c.id]}
            choice={choiceOf(c)}
            reviewed={v.reviewed.includes(c.id)}
            holderName={holderName}
            onChoose={(value) => v.choose(c.id, value)}
          />
        ))}
      </ol>
    </div>
  );
}

function CardItem({
  card: c,
  index,
  total,
  twin,
  choice,
  reviewed,
  holderName,
  onChoose,
}: {
  card: ConfirmCard;
  index: number;
  total: number;
  twin: string | undefined;
  choice: string;
  reviewed: boolean;
  holderName: string;
  onChoose: (value: string) => void;
}) {
  const typed = otherCents(choice);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState(false);
  const submit = () => {
    const cents = parseReaisToCents(text);
    if (cents === null) return setInvalid(true);
    setInvalid(false);
    setEditing(false);
    onChoose(`${OTHER}:${cents}`);
  };
  return (
    <li
      data-testid={`card-${c.id}`}
      data-choice={choice}
      data-reviewed={reviewed}
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="type-caption num text-muted-foreground">
          {index + 1} de {total}
          {twin ? ` · ${twin}` : ''}
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
          <p className="type-money-md num text-foreground" data-cents={c.sample.amountCents}>
            {formatBRL(c.sample.amountCents)}
          </p>
          <p className="type-small num text-muted-foreground">
            {formatCivilDate(c.sample.date)} ·{' '}
            {sampleDescription(
              c.sample.label.replace(/\s*-\s*\[pessoa\]\s*$/, ''),
              c.sample.amountCents,
            )}
            {c.transactions > 1 ? ` · e mais ${c.transactions - 1}` : ''}
          </p>
        </div>
      ) : null}
      <p className="type-body-lg text-foreground" id={`q-${c.id}`}>
        {c.text}
      </p>
      {c.impact > 0 ? (
        <p className="type-small text-muted-foreground">
          Pode mudar até <span className="num text-foreground">{formatBRL(c.impact)}</span> no
          total.
        </p>
      ) : null}
      <fieldset aria-labelledby={`q-${c.id}`} className="flex flex-wrap gap-2">
        {c.options.map((o) => {
          const on = o.value === OTHER ? typed !== null || editing : o.value === choice;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              data-testid={`answer-${c.id}-${o.value}`}
              onClick={() => (o.value === OTHER ? setEditing(true) : onChoose(o.value))}
              className={cn(
                'type-small min-h-11 rounded-md border px-4 font-medium transition-colors duration-(--dur-fast)',
                on
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-strong-border bg-surface text-foreground hover:bg-surface-2',
              )}
            >
              {o.value === OTHER && typed !== null ? `${o.label}: ${formatBRL(typed)}` : o.label}
            </button>
          );
        })}
      </fieldset>
      {editing ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label className="flex flex-col gap-1">
            <span className="type-small text-muted-foreground">Pró-labore bruto por mês</span>
            <input
              inputMode="decimal"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="R$ 2.500,00"
              aria-invalid={invalid}
              data-testid={`other-${c.id}`}
              className="min-h-11 rounded-md border border-strong-border bg-surface px-3 text-base text-foreground"
            />
          </label>
          <Button type="submit" size="lg" variant="outline">
            Usar este valor
          </Button>
          {invalid ? (
            <p className="type-small w-full text-risk" role="alert">
              Digite um valor em reais, como 2.500,00.
            </p>
          ) : null}
        </form>
      ) : null}
      <p className="type-caption text-muted-foreground">
        {choice === c.personaChoice
          ? `Resposta da ${holderName}.`
          : 'Sua resposta (diferente da persona).'}
      </p>
    </li>
  );
}
