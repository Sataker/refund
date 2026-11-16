'use client';

import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';

// The holder switch (Screen 5b, hierarchy item 1): "Empresa · PJ" / "Você · PF", as an ARIA tablist (no tabs
// library on this route, ARCHITECTURE §11.1). The page is static, so `?holder=pj|pf` is read after hydration and
// written back with replaceState (GLOSSARY §10: query keys are code). Only the active panel is mounted, so test ids
// never repeat on screen.

type Holder = 'pj' | 'pf';
const LABEL: Record<Holder, string> = { pj: 'Empresa · PJ', pf: 'Você · PF' };

export function HolderTabs({ pj, pf }: { pj: ReactNode | null; pf: ReactNode | null }) {
  const available: Holder[] = [
    ...(pj === null ? [] : ['pj' as const]),
    ...(pf === null ? [] : ['pf' as const]),
  ];
  const [holder, setHolder] = useState<Holder>(available[0] ?? 'pj');
  const id = useId();
  const tabs = useRef<Partial<Record<Holder, HTMLButtonElement | null>>>({});
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('holder');
    if ((wanted === 'pj' && pj !== null) || (wanted === 'pf' && pf !== null)) setHolder(wanted);
  }, [pj, pf]);

  const select = (value: Holder, focus = false) => {
    setHolder(value);
    if (focus) tabs.current[value]?.focus();
    const url = new URL(window.location.href);
    url.searchParams.set('holder', value);
    window.history.replaceState(window.history.state, '', url);
  };
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = available.indexOf(holder);
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0 || available.length < 2) return;
    e.preventDefault();
    const next = available[(i + step + available.length) % available.length];
    if (next !== undefined) select(next, true);
  };

  return (
    <div className="flex flex-col gap-6">
      <div
        role="tablist"
        aria-label="De quem é o dinheiro"
        className="inline-flex w-full gap-1 rounded-lg bg-surface-2 p-1 lg:w-fit"
      >
        {available.map((h) => (
          <button
            key={h}
            ref={(el) => {
              tabs.current[h] = el;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${h}`}
            aria-selected={holder === h}
            aria-controls={`${id}-panel`}
            tabIndex={holder === h ? 0 : -1}
            data-testid={`fv-holder-${h}`}
            data-state={holder === h ? 'active' : 'inactive'}
            onClick={() => select(h)}
            onKeyDown={onKey}
            className="type-small relative inline-flex min-h-11 flex-1 items-center justify-center rounded-md px-4 font-medium text-muted-foreground transition-colors duration-(--dur-fast) data-[state=active]:bg-surface data-[state=active]:text-foreground data-[state=active]:shadow-sm lg:flex-none"
          >
            {LABEL[h]}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-tab-${holder}`}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: ARIA tabs pattern: the panel takes focus after the tabs
        tabIndex={0}
        className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
      >
        {holder === 'pj' ? pj : pf}
      </div>
    </div>
  );
}
