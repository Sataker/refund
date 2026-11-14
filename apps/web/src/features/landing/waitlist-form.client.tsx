'use client';

import { type FormEvent, useId, useState } from 'react';

/**
 * Waitlist (IDENTITY-AND-UI §5.12): interface only. E11 wires the server action; until then nothing typed
 * here leaves the browser, and the form says so instead of pretending.
 */
export function WaitlistForm() {
  const [submitted, setSubmitted] = useState(false);
  const emailId = useId();
  const noteId = useId();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitted(true);
  }

  return (
    <form onSubmit={onSubmit} data-testid="waitlist-form" className="w-full max-w-xl">
      <label htmlFor={emailId} className="type-small mb-2 block font-medium text-foreground">
        Quer usar com a sua empresa? Entre na lista.
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={emailId}
          name="email"
          type="email"
          autoComplete="email"
          placeholder="voce@empresa.com.br"
          aria-describedby={noteId}
          className="h-12 w-full min-w-0 rounded-md border border-strong-border bg-surface px-3 text-base text-foreground transition-colors duration-(--dur-fast) placeholder:text-subtle sm:flex-1"
        />
        <button
          type="submit"
          className="inline-flex h-12 shrink-0 items-center justify-center rounded-md border border-strong-border bg-surface px-5 text-base font-medium text-foreground transition-colors duration-(--dur-fast) hover:bg-muted active:translate-y-px"
        >
          Entrar na lista
        </button>
      </div>
      <p id={noteId} aria-live="polite" className="type-small mt-2 text-muted-foreground">
        {submitted
          ? 'A lista abre na próxima versão. Por enquanto, nada foi enviado nem guardado.'
          : 'Avisamos quando a análise com a sua conta estiver aberta.'}
      </p>
    </form>
  );
}
