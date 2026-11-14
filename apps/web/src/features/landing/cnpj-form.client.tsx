'use client';

import { ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useId, useRef, useState } from 'react';
import { cnpjHint, cnpjStatus, maskCnpj } from '@/lib/cnpj';
import { cx } from '@/lib/cx';
import { ROUTES } from './routes';

// Same look as <Button size="xl"> (components/ui/button.tsx), without cva/radix in the landing bundle.
const PRIMARY_XL =
  'inline-flex h-14 w-full shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-6 text-base font-medium whitespace-nowrap text-primary-foreground transition-colors duration-(--dur-fast) hover:bg-primary/80 active:translate-y-px sm:w-auto';

interface CnpjFormProps {
  /** Distinguishes the hero form from the final CTA (ids and test ids). */
  id: string;
  className?: string;
}

/**
 * Hero CNPJ field (IDENTITY-AND-UI Screen 0): the largest interactive element of the page (56px), automatic
 * mask, pasting with punctuation accepted, "Faltam N dígitos" in real time. For now it opens /demo (E6); the
 * live lookup is wired in E11. The CNPJ typed here is not sent or stored anywhere.
 */
export function CnpjForm({ id, className }: CnpjFormProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [touched, setTouched] = useState(false);
  const hintId = useId();
  const status = cnpjStatus(value);
  const error = !touched
    ? null
    : status.kind === 'empty'
      ? 'Digite o CNPJ para continuar.'
      : cnpjHint(status);
  const invalid = error !== null;

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTouched(true);
    if (status.kind !== 'valid') {
      inputRef.current?.focus();
      return;
    }
    router.push(ROUTES.demo);
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      data-testid={`${id}/cnpj-form`}
      className={cx('w-full max-w-2xl', className)}
    >
      <label htmlFor={`${id}-cnpj`} className="type-small mb-2 block font-medium text-foreground">
        CNPJ da sua empresa
      </label>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <input
          ref={inputRef}
          id={`${id}-cnpj`}
          name="cnpj"
          value={value}
          onChange={(e) => {
            setValue(maskCnpj(e.target.value));
            if (cnpjStatus(e.target.value).kind === 'valid') setTouched(true);
          }}
          onBlur={() => value !== '' && setTouched(true)}
          placeholder="00.000.000/0000-00"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          inputMode="text"
          aria-invalid={invalid}
          aria-describedby={hintId}
          className={cx(
            'num h-14 w-full min-w-0 rounded-md sm:flex-1 lg:min-w-[22.5rem] border bg-surface px-4 font-mono text-lg text-foreground shadow-xs transition-colors duration-(--dur-fast) placeholder:text-subtle',
            invalid ? 'border-risk' : 'border-strong-border',
          )}
        />
        <button type="submit" className={PRIMARY_XL}>
          Ver quanto posso economizar
          <ArrowRight className="size-4" strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
      <p
        id={hintId}
        aria-live="polite"
        className={cx('type-small mt-2 min-h-5', error ? 'text-risk' : 'text-muted-foreground')}
      >
        {error ?? 'Sem cadastro. Nesta versão, o botão abre a demo com dados sintéticos.'}
      </p>
    </form>
  );
}
