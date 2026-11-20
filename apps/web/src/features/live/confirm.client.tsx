'use client';

import { Check, Loader2 } from 'lucide-react';
import { type ReactNode, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { sampleDescription } from '@/features/demo/display';
import { type ConfirmCard, DONT_KNOW, OTHER, parseReaisToCents } from '@/features/findings/confirm';
import { formatCivilDate } from '@/features/findings/text';
import { formatBRL } from '@/lib/format';
import { cn } from '@/lib/utils';

// Screen 7 in /app (IDENTITY-AND-UI §5): the cards this analysis asked, ordered by effect on the total (D23). Each
// answer is saved on the server (answerQuestion); "Refazer a análise" runs the engine again with them (the AI never
// computes the new number).

type Result<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } };
type Answer = string | number | null;

export function LiveConfirm({
  cards,
  answer,
  redo,
}: {
  cards: ConfirmCard[];
  answer: (questionId: string, value: Answer) => Promise<Result<{ reanalyze: boolean }>>;
  redo: ReactNode;
}) {
  // M1: nothing pre-selected. Only a saved answer starts pressed; "Não sei" is neutral and pressed only once tapped.
  const [choices, setChoices] = useState<Record<string, string>>(
    Object.fromEntries(
      cards.filter((c) => c.personaChoice !== DONT_KNOW).map((c) => [c.id, c.personaChoice]),
    ),
  );
  const [typing, setTyping] = useState<Record<string, string>>({});
  const [error, setError] = useState<Record<string, string>>({});
  const [changed, setChanged] = useState(false);
  const [pending, begin] = useTransition();
  const open = cards.filter((c) => (choices[c.id] ?? DONT_KNOW) === DONT_KNOW).length;
  const answeredCount = cards.length - open;

  const send = (card: ConfirmCard, choice: string, value: Answer) =>
    begin(async () => {
      const r = await answer(card.id, value);
      if (r.ok) {
        setChoices((c) => ({ ...c, [card.id]: choice }));
        setError((e) => ({ ...e, [card.id]: '' }));
        setChanged(true);
      } else setError((e) => ({ ...e, [card.id]: r.error.message }));
    });

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
    <div className="flex flex-col gap-6" data-testid="confirm">
      <p className="type-small text-foreground">
        <span data-testid="confirm-pending" data-count={open} className="num font-medium">
          {answeredCount} de {cards.length} respondidas
        </span>
        {open === 0 ? ' · revise se quiser' : ` · ${open} em aberto`}
      </p>
      <ol className="flex flex-col gap-4">
        {cards.map((card) => {
          const current = choices[card.id] ?? null;
          return (
            <li
              key={card.id}
              data-testid={`card-${card.id}`}
              data-choice={current ?? 'none'}
              className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5"
            >
              <p className="text-base font-medium text-foreground">{card.text}</p>
              {card.sample ? (
                <p className="type-caption text-muted-foreground">
                  {formatCivilDate(card.sample.date)} ·{' '}
                  {sampleDescription(card.sample.label, card.sample.amountCents)} ·{' '}
                  <span className="num">{formatBRL(card.sample.amountCents)}</span>
                  {card.transactions > 1 ? ` · e mais ${card.transactions - 1}` : ''}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {card.options
                  .filter((o) => o.value !== OTHER)
                  .map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      disabled={pending}
                      aria-pressed={current === o.value}
                      data-testid={`answer-${card.id}-${o.value}`}
                      onClick={() => send(card, o.value, o.value === DONT_KNOW ? null : o.value)}
                      className={cn(
                        'type-small inline-flex min-h-10 items-center gap-1.5 rounded-md border px-3 font-medium',
                        current === o.value
                          ? 'border-foreground bg-foreground text-background'
                          : 'border-border text-foreground hover:bg-surface-2',
                      )}
                    >
                      {current === o.value ? <Check className="size-4" aria-hidden="true" /> : null}
                      {o.label}
                    </button>
                  ))}
              </div>
              {card.options.some((o) => o.value === OTHER) ? (
                <form
                  className="flex flex-wrap items-end gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const cents = parseReaisToCents(typing[card.id] ?? '');
                    if (cents === null) {
                      setError((x) => ({
                        ...x,
                        [card.id]: 'Digite um valor em reais, como 2.500,00.',
                      }));
                      return;
                    }
                    send(card, `${OTHER}:${cents}`, cents);
                  }}
                >
                  <label htmlFor={`other-input-${card.id}`} className="flex flex-col gap-1">
                    <span className="type-caption text-muted-foreground">
                      Outro valor (bruto, por mês)
                    </span>
                    <Input
                      id={`other-input-${card.id}`}
                      inputMode="decimal"
                      value={typing[card.id] ?? ''}
                      data-testid={`other-${card.id}`}
                      onChange={(e) => setTyping((x) => ({ ...x, [card.id]: e.target.value }))}
                      placeholder="R$ 0,00"
                      className="w-40"
                    />
                  </label>
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={pending}
                    data-testid={`save-other-${card.id}`}
                  >
                    Salvar valor
                  </Button>
                </form>
              ) : null}
              {error[card.id] ? (
                <p role="alert" className="type-small text-risk">
                  {error[card.id]}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
      <div
        className={cn(
          'flex flex-col gap-2 rounded-lg border p-4',
          changed ? 'border-cobalt bg-surface' : 'border-border',
        )}
        role="status"
      >
        <p className="type-small text-foreground">
          {pending ? (
            <Loader2 className="mr-1 inline size-4 animate-spin" aria-hidden="true" />
          ) : null}
          {changed
            ? 'Respostas salvas. Refaça a análise para o motor recalcular com elas.'
            : 'Suas respostas ficam salvas e entram na próxima análise.'}
        </p>
        {redo}
      </div>
    </div>
  );
}
