'use client';

import { type FormEvent, useId, useState, useTransition } from 'react';
import { CONTACT_EMAIL } from '@/lib/contact';
import { cx } from '@/lib/cx';

type JoinResult =
  | { ok: true; value: { joined: true } }
  | { ok: false; error: { code: string; message: string } };

export type WaitlistJoin = (input: {
  email: string;
  hasCnpj: boolean;
  origin: string;
  consent: true;
}) => Promise<JoinResult>;

const UNAVAILABLE = 'A lista de espera não está aberta neste endereço. Enquanto isso, veja a demo.';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Waitlist (IDENTITY-AND-UI §5.12; E11 task 6): e-mail, "tem CNPJ?" and an explicit consent, sent to the
 * `joinWaitlist` action (encrypted e-mail + HMAC, rate limit per IP). The answer is the same for a new
 * and a repeated e-mail, so the form never reveals who is on the list.
 */
export function WaitlistForm({
  join,
  label = 'Quer usar com a sua empresa? Entre na lista.',
  cnpjKnown = false,
}: {
  join: WaitlistJoin;
  /** The one line above the field (bug bash 20/11: the stop pages say it once). */
  label?: string;
  /** The track already has the CNPJ: "Você já tem CNPJ?" is not asked. */
  cnpjKnown?: boolean;
}) {
  const [email, setEmail] = useState('');
  const [hasCnpj, setHasCnpj] = useState<'yes' | 'no' | null>(cnpjKnown ? 'yes' : null);
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<
    { kind: 'idle' } | { kind: 'done' } | { kind: 'error'; message: string }
  >({ kind: 'idle' });
  const [pending, start] = useTransition();
  const emailId = useId();
  const noteId = useId();
  const consentId = useId();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!EMAIL.test(email.trim())) {
      setState({ kind: 'error', message: 'Confira o e-mail.' });
      return;
    }
    if (hasCnpj === null) {
      setState({ kind: 'error', message: 'Conte se você já tem CNPJ.' });
      return;
    }
    if (!consent) {
      setState({ kind: 'error', message: 'Marque o consentimento para entrar na lista.' });
      return;
    }
    start(async () => {
      try {
        const r = await join({
          email: email.trim(),
          hasCnpj: hasCnpj === 'yes',
          origin: cnpjKnown ? 'track' : 'landing',
          consent: true,
        });
        if (r.ok) setState({ kind: 'done' });
        else
          setState({
            kind: 'error',
            message: r.error.code === 'NOT_CONFIGURED' ? UNAVAILABLE : r.error.message,
          });
      } catch {
        setState({ kind: 'error', message: 'Não conseguimos enviar agora. Tente de novo.' });
      }
    });
  }

  if (state.kind === 'done') {
    return (
      <div data-testid="waitlist-form" data-state="done" className="w-full max-w-xl">
        <p className="type-body-lg text-foreground" role="status">
          Pronto. Avisamos quando a análise com a sua conta abrir.
        </p>
        <p className="type-small mt-2 text-muted-foreground">
          Guardamos o e-mail cifrado e só para esse aviso. Para sair, escreva para {CONTACT_EMAIL}.
        </p>
      </div>
    );
  }

  return (
    // method="post": if a tap lands before hydration, the native submit must never put the
    // e-mail in a URL (server logs, history, Referer).
    <form
      method="post"
      onSubmit={onSubmit}
      noValidate
      data-testid="waitlist-form"
      className="w-full max-w-xl"
    >
      <label htmlFor={emailId} className="type-small mb-2 block font-medium text-foreground">
        {label}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={emailId}
          type="email"
          autoComplete="email"
          placeholder="voce@exemplo.com.br"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-describedby={noteId}
          className="h-12 w-full min-w-0 rounded-md border border-strong-border bg-surface px-3 text-base text-foreground transition-colors duration-(--dur-fast) placeholder:text-subtle sm:flex-1"
        />
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="inline-flex h-12 shrink-0 items-center justify-center rounded-md border border-strong-border bg-surface px-5 text-base font-medium text-foreground transition-colors duration-(--dur-fast) hover:bg-muted active:translate-y-px disabled:opacity-60"
        >
          Entrar na lista
        </button>
      </div>
      {cnpjKnown ? null : (
        <fieldset className="mt-4">
          <legend className="type-small text-foreground">Você já tem CNPJ?</legend>
          <div className="mt-2 flex gap-2">
            {(
              [
                ['yes', 'Tenho'],
                ['no', 'Ainda não'],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className={cx(
                  'type-small inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border px-3 transition-colors duration-(--dur-fast) has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ring',
                  hasCnpj === value
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-strong-border bg-surface text-foreground hover:bg-muted',
                )}
              >
                <input
                  type="radio"
                  name="hasCnpj"
                  value={value}
                  checked={hasCnpj === value}
                  onChange={() => setHasCnpj(value)}
                  className="sr-only"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="mt-4 flex items-start gap-2">
        <input
          id={consentId}
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 size-5 shrink-0 accent-foreground"
        />
        <label htmlFor={consentId} className="type-small text-muted-foreground">
          Aceito receber um e-mail do Refund quando a lista abrir. Posso pedir para sair quando
          quiser.
        </label>
      </div>
      <p
        id={noteId}
        aria-live="polite"
        className={cx(
          'type-small mt-3 min-h-5',
          state.kind === 'error' ? 'text-risk' : 'text-muted-foreground',
        )}
      >
        {state.kind === 'error'
          ? state.message
          : 'Avisamos quando a análise com a sua conta estiver aberta.'}
      </p>
    </form>
  );
}
