'use client';

import type { Route } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { ConfirmCard } from './confirm';
import type { DashboardModel } from './model';
import { useVisitorAnswers } from './visitor.client';

// UX review H4: the detail, the report and the accountant view are built with the persona's answers. When the
// visitor changed answers in Confirmar, they say so and point to the dashboard (which already shows the engine's new
// total); a finding that leaves the result under the visitor's answers is greyed out.

interface VisitorNoticeProps {
  persona: string;
  holderName: string;
  cards: ConfirmCard[];
  base: DashboardModel;
  /** On a finding detail: grey out the content when this finding is not in the visitor's result. */
  ruleId?: string;
  children?: ReactNode;
}

export function VisitorNotice({
  persona,
  holderName,
  cards,
  base,
  ruleId,
  children,
}: VisitorNoticeProps) {
  const v = useVisitorAnswers(persona, cards, base);
  const settled = v.custom && v.status === 'idle';
  const present = [...v.model.savings, ...v.model.recovery, ...v.model.alerts].some(
    (f) => f.ruleId === ruleId,
  );
  const dropped = ruleId !== undefined && settled && !present;
  return (
    <>
      {v.ready && v.custom ? (
        <div
          role="status"
          data-testid="visitor-notice"
          data-dropped={dropped ? 'true' : undefined}
          className="type-small flex flex-col gap-2 rounded-lg border border-border bg-surface-2 px-4 py-3 text-foreground sm:flex-row sm:items-center sm:justify-between print:hidden"
        >
          <span>
            Estes números usam as respostas da {holderName}. Você mudou respostas em Confirmar: o
            painel já mostra o total novo.
            {dropped ? ' Com as suas respostas, este achado sai do resultado.' : ''}
          </span>
          <Link
            href={`/demo/${persona}/painel` as Route}
            className="shrink-0 font-medium text-cobalt underline-offset-4 hover:underline"
          >
            Ver painel
          </Link>
        </div>
      ) : null}
      {children === undefined ? null : (
        <div
          className={cn('flex flex-col gap-8 transition-opacity', dropped && 'opacity-50')}
          data-testid="visitor-scope"
        >
          {children}
        </div>
      )}
    </>
  );
}
