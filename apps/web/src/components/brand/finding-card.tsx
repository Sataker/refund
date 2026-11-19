import type { Confidence } from '@refund/engine';
import { CalendarClock, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { formatBRL } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ConfidenceBadge } from './confidence-badge';
import { LawSeal, type LawSealRef } from './law-seal';

interface FindingCardProps {
  /** Plain-language headline (layer 1, §2.3). */
  title: string;
  /** `Finding.marginalValue12m`. */
  cents: number;
  /** "nos próximos 12 meses" etc. */
  period?: string;
  testId?: string;
  lawRef: LawSealRef;
  /** Omitted on Screen 4 (the analysis), where the total carries one line for all; shown on Screens 5/6. */
  confidence?: Confidence;
  /** "1 decisão com seu contador". */
  effort?: string;
  /** Warning chip when the deadline is < 60 days away (the caller decides). */
  deadline?: { label: string; urgent: boolean };
  /** Extra line, e.g. the steady-state value. */
  footnote?: ReactNode;
  /** "Ver cálculo" link content; without it the chevron is not shown. */
  action?: ReactNode;
  className?: string;
}

/** Finding card (IDENTITY-AND-UI §4.8). Hover: --border-strong + shadow-md in 140 ms. */
export function FindingCard({
  title,
  cents,
  period = 'nos próximos 12 meses',
  testId,
  lawRef,
  confidence,
  effort,
  deadline,
  footnote,
  action,
  className,
}: FindingCardProps) {
  return (
    <Card
      data-testid={testId}
      className={cn(
        'gap-3 rounded-lg border border-border px-5 py-5 shadow-sm ring-0 transition-[border-color,box-shadow] duration-(--dur-fast) ease-(--ease-standard) hover:border-strong-border hover:shadow-md',
        className,
      )}
    >
      <p className="type-body-lg font-semibold text-foreground">{title}</p>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span data-cents={cents} className="type-money-md text-found-ink">
          {formatBRL(cents)}
        </span>
        <span className="type-small text-muted-foreground">{period}</span>
      </p>
      {footnote ? <div className="type-small text-muted-foreground">{footnote}</div> : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <LawSeal lawRef={lawRef} />
        {confidence ? <ConfidenceBadge level={confidence} /> : null}
        {effort ? <span className="type-caption text-muted-foreground">{effort}</span> : null}
        {deadline ? (
          <span
            className={cn(
              'type-caption inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5',
              deadline.urgent ? 'bg-warning-soft text-warning' : 'text-muted-foreground',
            )}
          >
            <CalendarClock className="size-3" strokeWidth={1.5} aria-hidden="true" />
            {deadline.label}
          </span>
        ) : null}
      </div>
      {action ? (
        <div className="type-small inline-flex items-center gap-1 font-medium text-cobalt">
          {action}
          <ChevronRight className="size-4" strokeWidth={1.5} aria-hidden="true" />
        </div>
      ) : null}
    </Card>
  );
}
