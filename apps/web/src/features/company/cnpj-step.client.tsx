'use client';

import { ArrowRight } from 'lucide-react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useId, useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import type { ClientResult } from '@/features/track/client-types';
import { cnpjHint, cnpjStatus, maskCnpj } from '@/lib/cnpj';
import { cn } from '@/lib/utils';

interface CnpjStepProps {
  /** CNPJ typed on the landing (`?cnpj=`): the lookup starts on its own (track, step `cnpj`). */
  initial?: string;
  lookup: (input: { cnpj: string; context: 'live' }) => Promise<ClientResult<{ next: string }>>;
}

/**
 * Step `cnpj` (IDENTITY-AND-UI §5): the only typed field of the track. Pasting accepts punctuation,
 * automatic mask, alphanumeric CNPJ (`inputmode="text"`, `autocapitalize="characters"`, never numeric).
 * Errors stay on this screen, in human language, with a way out (rule 7).
 */
export function CnpjStep({ initial, lookup }: CnpjStepProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(() => maskCnpj(initial ?? ''));
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const hintId = useId();
  const autoStarted = useRef(false);
  const status = cnpjStatus(value);
  const localError = !touched
    ? null
    : status.kind === 'empty'
      ? 'Digite o CNPJ para continuar.'
      : cnpjHint(status);
  const error = localError ?? serverError;

  function submit(cnpj: string) {
    setServerError(null);
    start(async () => {
      const r = await lookup({ cnpj, context: 'live' });
      if (r.ok) router.push(r.value.next as Route);
      else {
        setServerError(r.error.message);
        inputRef.current?.focus();
      }
    });
  }

  // One-shot on arrival from the landing; `submit` and `initial` are stable for this purpose.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once on mount
  useEffect(() => {
    if (autoStarted.current) return;
    const s = cnpjStatus(initial ?? '');
    if (s.kind === 'valid') {
      autoStarted.current = true;
      submit(s.cnpj);
    }
  }, []);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTouched(true);
    if (status.kind !== 'valid') {
      inputRef.current?.focus();
      return;
    }
    submit(status.cnpj);
  }

  return (
    <form onSubmit={onSubmit} noValidate data-testid="cnpj-step">
      <label htmlFor="track-cnpj" className="sr-only">
        CNPJ da sua empresa
      </label>
      <input
        ref={inputRef}
        id="track-cnpj"
        name="cnpj"
        value={value}
        onChange={(e) => {
          setServerError(null);
          setValue(maskCnpj(e.target.value));
          if (cnpjStatus(e.target.value).kind === 'valid') setTouched(true);
        }}
        onBlur={() => value !== '' && setTouched(true)}
        placeholder="00.000.000/0000-00"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        inputMode="text"
        // biome-ignore lint/a11y/noAutofocus: the track's only field; the screen exists to type it
        autoFocus
        aria-invalid={error !== null}
        aria-describedby={hintId}
        disabled={pending}
        className={cn(
          'num h-14 w-full rounded-md border bg-surface px-4 font-mono text-lg text-foreground shadow-xs transition-colors duration-(--dur-fast) placeholder:text-subtle disabled:opacity-70',
          error ? 'border-risk' : 'border-strong-border',
        )}
      />
      <p
        id={hintId}
        aria-live="polite"
        data-testid="cnpj-hint"
        className={cn('type-small mt-2 min-h-5', error ? 'text-risk' : 'text-muted-foreground')}
      >
        {error ?? (pending ? 'Lendo os dados públicos da Receita…' : 'Leva uns 2 minutos.')}
      </p>
      <Button
        type="submit"
        size="xl"
        className="mt-6 w-full sm:w-auto"
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? 'Buscando a empresa…' : 'Continuar'}
        <ArrowRight className="size-4" strokeWidth={1.5} aria-hidden="true" />
      </Button>
      {pending ? <CompanyCardSkeleton /> : null}
    </form>
  );
}

/** Loading (0–2 s): the card's final shape, as if the agent were reading (Screen 1). */
function CompanyCardSkeleton() {
  return (
    <div
      className="mt-8 rounded-lg border border-border bg-surface p-5"
      aria-hidden="true"
      data-testid="company-card-skeleton"
    >
      {[60, 40, 80, 70, 55].map((w, i) => (
        <div
          key={w}
          className="enter mb-3 h-4 rounded-sm bg-surface-2 last:mb-0"
          style={{ width: `${w}%`, ['--enter-delay' as string]: `${i * 80}ms` }}
        />
      ))}
    </div>
  );
}
