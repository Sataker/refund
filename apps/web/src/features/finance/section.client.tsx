'use client';

import { ChevronDown } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Secondary section of Screen 5b ("O que mudou" … "Cobranças em duplicidade"): open on desktop (a plain heading),
 * collapsed on mobile behind a disclosure button with its summary in the header ("Tarifas bancárias · nenhuma").
 */
export function FinanceSection({
  title,
  summary,
  children,
  testId,
  focusId,
  attrs,
}: {
  title: string;
  summary?: string | undefined;
  children: ReactNode;
  testId: string;
  /** Focus target after a D31 undo (tabIndex -1). */
  focusId?: string;
  attrs?: Record<`data-${string}`, string | number>;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const text = (
    <span>
      {title}
      {summary === undefined ? null : (
        <span className="font-normal text-muted-foreground"> · {summary}</span>
      )}
    </span>
  );
  return (
    <section
      data-testid={testId}
      {...attrs}
      {...(focusId === undefined ? {} : { id: focusId, tabIndex: -1 })}
      className="border-t border-border pt-4"
    >
      <h2 className="hidden text-base font-semibold text-foreground lg:block">{text}</h2>
      <h2 className="text-base font-semibold text-foreground lg:hidden">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-11 w-full items-center justify-between gap-3 text-left"
        >
          {text}
          <ChevronDown
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-transform duration-(--dur-fast)',
              open && 'rotate-180',
            )}
            aria-hidden="true"
          />
        </button>
      </h2>
      <div id={id} className={cn('pt-3', open ? 'block' : 'hidden lg:block')}>
        {children}
      </div>
    </section>
  );
}
