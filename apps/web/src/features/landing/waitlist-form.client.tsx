'use client';

import { type FormEvent, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
        <Input
          id={emailId}
          name="email"
          type="email"
          autoComplete="email"
          placeholder="voce@empresa.com.br"
          aria-describedby={noteId}
          className="h-12 sm:flex-1"
        />
        <Button type="submit" size="lg" variant="outline">
          Entrar na lista
        </Button>
      </div>
      <p id={noteId} aria-live="polite" className="type-small mt-2 text-muted-foreground">
        {submitted
          ? 'A lista abre na próxima versão. Por enquanto, nada foi enviado nem guardado.'
          : 'Avisamos quando a análise com a sua conta estiver aberta.'}
      </p>
    </form>
  );
}
