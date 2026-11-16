'use client';

import { Tabs } from 'radix-ui';
import { type ReactNode, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

// The holder switch (Screen 5b, hierarchy item 1): "Empresa · PJ" / "Você · PF". The page is static (built once),
// so `?holder=pj|pf` is read after hydration and written back with replaceState (GLOSSARY §10: query keys are code).
// Only the active panel is mounted, so test ids never repeat on screen.

type Holder = 'pj' | 'pf';

export function HolderTabs({ pj, pf }: { pj: ReactNode | null; pf: ReactNode | null }) {
  const fallback: Holder = pj === null ? 'pf' : 'pj';
  const [holder, setHolder] = useState<Holder>(fallback);
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('holder');
    if ((wanted === 'pj' && pj !== null) || (wanted === 'pf' && pf !== null)) setHolder(wanted);
  }, [pj, pf]);
  const change = (value: string) => {
    if (value !== 'pj' && value !== 'pf') return;
    setHolder(value);
    const url = new URL(window.location.href);
    url.searchParams.set('holder', value);
    window.history.replaceState(window.history.state, '', url);
  };
  const tab =
    'type-small relative inline-flex min-h-10 flex-1 items-center justify-center rounded-md px-4 font-medium text-muted-foreground transition-colors duration-(--dur-fast) data-[state=active]:bg-surface data-[state=active]:text-foreground data-[state=active]:shadow-sm lg:flex-none';
  return (
    <Tabs.Root value={holder} onValueChange={change} className="flex flex-col gap-6">
      <Tabs.List
        aria-label="De quem é o dinheiro"
        className="inline-flex w-full gap-1 rounded-lg bg-surface-2 p-1 lg:w-fit"
      >
        {pj === null ? null : (
          <Tabs.Trigger value="pj" data-testid="fv-holder-pj" className={tab}>
            Empresa · PJ
          </Tabs.Trigger>
        )}
        {pf === null ? null : (
          <Tabs.Trigger value="pf" data-testid="fv-holder-pf" className={cn(tab)}>
            Você · PF
          </Tabs.Trigger>
        )}
      </Tabs.List>
      {pj === null ? null : (
        <Tabs.Content value="pj" className="outline-none">
          {pj}
        </Tabs.Content>
      )}
      {pf === null ? null : (
        <Tabs.Content value="pf" className="outline-none">
          {pf}
        </Tabs.Content>
      )}
    </Tabs.Root>
  );
}
