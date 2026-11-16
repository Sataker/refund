'use client';

import { ArrowRight } from 'lucide-react';
import { type FormEvent, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cnpjHint, cnpjStatus, maskCnpj, normalizeCnpj } from '@/lib/cnpj';
import { cn } from '@/lib/utils';

interface DemoCnpjStepProps {
  /** The persona's synthetic CNPJ, already typed in (IDENTITY-AND-UI §5 "On /demo"). */
  personaCnpj: string;
  companyName: string;
  onFound: () => void;
}

/**
 * Step `cnpj` on /demo: the only typed field of the track (automatic mask, pasting with punctuation, the
 * alphanumeric CNPJ: `inputmode="text"`, `autocapitalize="characters"`). The demo only knows its personas,
 * so another valid CNPJ gets a human way back instead of a lookup (no network in /demo).
 */
export function DemoCnpjStep({ personaCnpj, companyName, onFound }: DemoCnpjStepProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(maskCnpj(personaCnpj));
  const [touched, setTouched] = useState(false);
  const [other, setOther] = useState(false);
  const hintId = useId();
  const fieldId = useId();
  const status = cnpjStatus(value);
  const hint = !touched
    ? null
    : status.kind === 'empty'
      ? 'Digite o CNPJ para continuar.'
      : cnpjHint(status);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTouched(true);
    if (status.kind !== 'valid') {
      inputRef.current?.focus();
      return;
    }
    if (normalizeCnpj(value) === personaCnpj) onFound();
    else setOther(true);
  }

  const invalid = hint !== null;
  return (
    <form onSubmit={onSubmit} noValidate data-testid="cnpj-step">
      <label htmlFor={fieldId} className="type-small mb-2 block font-medium text-foreground">
        CNPJ da sua empresa
      </label>
      <input
        ref={inputRef}
        id={fieldId}
        name="cnpj"
        value={value}
        onChange={(e) => {
          setValue(maskCnpj(e.target.value));
          setOther(false);
          if (cnpjStatus(e.target.value).kind === 'valid') setTouched(true);
        }}
        onBlur={() => value !== '' && setTouched(true)}
        placeholder="00.000.000/0000-00"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        inputMode="text"
        aria-invalid={invalid || other}
        aria-describedby={hintId}
        className={cn(
          'num h-14 w-full min-w-0 rounded-md border bg-surface px-4 font-mono text-lg text-foreground shadow-xs transition-colors duration-(--dur-fast) placeholder:text-subtle',
          invalid || other ? 'border-risk' : 'border-strong-border',
        )}
      />
      <div id={hintId} aria-live="polite" className="type-small mt-2 min-h-5">
        {invalid ? <p className="text-risk">{hint}</p> : null}
        {other ? (
          <div className="text-foreground">
            <p>
              Na demo, só as empresas fictícias têm dados. A sua empresa entra pelo Refund ao vivo.
            </p>
            <button
              type="button"
              className="mt-1 font-medium text-cobalt underline underline-offset-4"
              onClick={() => {
                setValue(maskCnpj(personaCnpj));
                setOther(false);
              }}
            >
              Usar o CNPJ da {companyName}
            </button>
          </div>
        ) : null}
        {!invalid && !other ? (
          <p className="text-muted-foreground">CNPJ fictício da {companyName}, já preenchido.</p>
        ) : null}
      </div>
      <Button
        type="submit"
        size="xl"
        className="demo-cue mt-6 w-full sm:w-auto"
        data-testid="track-advance"
      >
        Buscar empresa
        <ArrowRight className="size-4" strokeWidth={1.5} aria-hidden="true" />
      </Button>
    </form>
  );
}
