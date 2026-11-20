'use client';

import { Check } from 'lucide-react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { type KeyboardEvent, useEffect, useRef, useState, useTransition } from 'react';
import { cn } from '@/lib/utils';
import type { ClientResult } from './client-types';

interface Option {
  value: string;
  label: string;
}

interface ChoiceStepProps {
  name: string;
  options: readonly Option[];
  selected: string | undefined;
  save: (value: string) => Promise<ClientResult<{ next: string }>>;
  footnote?: string;
}

const FEEDBACK_MS = 300;

/**
 * Track simplicity rule 2: answer by tapping. A chip selects, gives 300ms of feedback and advances on
 * its own. Keyboard: arrows move between chips, a number picks one, Enter/Space confirm.
 */
export function ChoiceStep({ name, options, selected, save, footnote }: ChoiceStepProps) {
  const router = useRouter();
  const [choice, setChoice] = useState<string | undefined>(selected);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function pick(value: string) {
    if (pending) return;
    setChoice(value);
    setError(null);
    start(async () => {
      const [r] = await Promise.all([
        save(value),
        new Promise((resolve) => setTimeout(resolve, FEEDBACK_MS)),
      ]);
      if (r.ok) router.push(r.value.next as Route);
      else setError(r.error.message);
    });
  }

  // Track rule 2 (M5): keys 1–9 pick a chip anywhere on the step, not only with focus inside the group.
  const pickRef = useRef(pick);
  pickRef.current = pick;
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const n = Number(e.key);
      if (!/^[1-9]$/.test(e.key) || n > options.length) return;
      const option = options[n - 1];
      if (!option) return;
      e.preventDefault();
      pickRef.current(option.value);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [options]);

  function onKeyDown(e: KeyboardEvent<HTMLFieldSetElement>) {
    const index = refs.current.indexOf(document.activeElement as HTMLButtonElement);
    const delta = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (delta !== undefined) {
      e.preventDefault();
      const nextIndex = (Math.max(index, 0) + delta + options.length) % options.length;
      refs.current[nextIndex]?.focus();
    }
  }

  const focusIndex = Math.max(
    0,
    options.findIndex((o) => o.value === choice),
  );

  return (
    <div>
      <fieldset
        onKeyDown={onKeyDown}
        className="grid gap-3 sm:grid-cols-2"
        data-testid="choice-group"
      >
        <legend className="sr-only">{name}</legend>
        {options.map((o, i) => {
          const checked = o.value === choice;
          return (
            <button
              key={o.value}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              aria-pressed={checked}
              tabIndex={i === focusIndex ? 0 : -1}
              disabled={pending && !checked}
              onClick={() => pick(o.value)}
              data-value={o.value}
              className={cn(
                'flex min-h-14 w-full items-center justify-between gap-3 rounded-md border px-4 py-3 text-left text-base font-medium transition-[background-color,border-color,color] duration-(--dur-fast)',
                checked
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-strong-border bg-surface text-foreground hover:bg-muted',
                pending && !checked && 'opacity-60',
              )}
            >
              <span>{o.label}</span>
              <span
                aria-hidden="true"
                className={cn(
                  'grid size-6 shrink-0 place-items-center rounded-full border',
                  checked ? 'border-background' : 'border-border',
                )}
              >
                {checked ? <Check className="size-3.5" strokeWidth={2.5} /> : null}
              </span>
            </button>
          );
        })}
      </fieldset>
      {footnote ? <p className="type-small mt-4 text-muted-foreground">{footnote}</p> : null}
      <p aria-live="polite" className="type-small mt-2 min-h-5 text-risk">
        {error}
      </p>
    </div>
  );
}
