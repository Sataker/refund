'use client';

import { Diamond } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion.client';
import { formatBRL, formatYearMonth } from '@/lib/format';
import { Sparkline } from './sparkline.tsx';
import { TaxSeal } from './tax-seal.client.tsx';
import { comparedTo, formatBps, formatDate, ORIGIN_LABEL } from './text.ts';
import type { GroupLine, SealFinding, TxRow } from './types.ts';

// "Por categoria" (Screen 5b, hierarchy item 4): the heart of the screen. Each group is an accordion item; its seals
// sit outside the trigger (a chip is its own button). `#grupo-<slug>` opens a group already expanded.

export interface CategoryListProps {
  groups: GroupLine[];
  findings: Record<string, SealFinding>;
  transactions: Record<string, TxRow>;
  confirmHref: string;
  /** Accordion item values are the slugs; the ids are unique per holder panel. */
  holder: 'pj' | 'pf';
}

function GroupTransactions({
  group,
  transactions,
}: {
  group: GroupLine;
  transactions: Record<string, TxRow>;
}) {
  return (
    <ul className="flex flex-col divide-y divide-border rounded-md border border-border bg-surface">
      {group.transactionIds.map((id) => {
        const t = transactions[id];
        if (t === undefined) return null;
        return (
          <li
            key={id}
            className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 px-3 py-2 lg:grid-cols-[150px_1fr_auto]"
          >
            <span className="num type-caption inline-flex items-center gap-2 text-muted-foreground">
              {formatDate(t.date)}
              {t.origin === null ? null : (
                <span className="inline-flex items-center gap-1 rounded-sm border border-border px-1.5">
                  {t.origin === 'llm' ? <Diamond className="size-3" aria-hidden="true" /> : null}
                  {ORIGIN_LABEL[t.origin]}
                </span>
              )}
            </span>
            <span className="type-small col-span-2 row-start-2 min-w-0 truncate text-foreground lg:col-span-1 lg:row-auto">
              {t.label}
            </span>
            <span
              className="num type-small col-start-2 row-start-1 text-right text-foreground lg:col-auto lg:row-auto"
              data-cents={t.amountCents}
            >
              {formatBRL(t.amountCents)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function GroupItem({
  group,
  findings,
  transactions,
  confirmHref,
}: Omit<CategoryListProps, 'groups' | 'holder'> & { group: GroupLine }) {
  const last = group.byMonth.at(-1);
  const prev = group.byMonth.at(-2);
  return (
    <AccordionItem
      value={group.slug}
      id={`grupo-${group.slug}`}
      data-testid={`fv-group-${group.groupId}`}
      data-cents={group.total12m}
      className="scroll-mt-24 border-border"
    >
      <AccordionTrigger className="items-center gap-3 py-3 hover:no-underline">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5 lg:flex-row lg:items-center lg:gap-4">
          <span className="text-base flex min-w-0 items-center gap-1.5 font-medium text-foreground lg:flex-1">
            <span className="truncate">{group.label}</span>
            {group.byOrigin.llm > 0 ? (
              <Diamond
                className="size-3 shrink-0 text-muted-foreground"
                aria-label="classificado por IA"
              />
            ) : null}
          </span>
          <span className="num flex items-baseline gap-2 text-muted-foreground lg:gap-4">
            <span
              className="text-base font-medium text-foreground lg:w-[150px] lg:text-right"
              data-cents={group.total12m}
            >
              {formatBRL(group.total12m)}
            </span>
            <span className="type-small lg:w-[64px] lg:text-right" data-bps={group.shareBps}>
              {formatBps(group.shareBps)}
            </span>
            <span className="type-small lg:w-[36px] lg:text-right" title="lançamentos">
              <span className="sr-only">lançamentos: </span>
              {group.count}
            </span>
          </span>
        </span>
        <Sparkline values={group.byMonth.map((m) => m.cents)} className="hidden lg:block" />
      </AccordionTrigger>
      {group.seals.length > 0 || group.pending > 0 ? (
        <div className="-mt-1 flex flex-wrap items-center gap-2 pb-3">
          {group.seals.map((seal) => (
            <TaxSeal
              key={seal.kind}
              groupId={group.groupId}
              seal={seal}
              findings={seal.ruleIds.flatMap((id) => {
                const f = findings[id];
                return f === undefined ? [] : [f];
              })}
            />
          ))}
          {group.pending > 0 ? (
            <a
              href={confirmHref}
              data-testid={`fv-pending-${group.groupId}`}
              className="type-small font-medium text-cobalt underline-offset-4 hover:underline"
            >
              {group.pending} a confirmar →
            </a>
          ) : null}
        </div>
      ) : null}
      <AccordionContent className="flex flex-col gap-3 pb-4">
        {last !== undefined && prev !== undefined ? (
          <p className="type-small text-muted-foreground">
            <span className="num">
              {formatYearMonth(last.month)}: {formatBRL(group.lastMonth)}
            </span>{' '}
            · {comparedTo(group.deltaCents, prev.month)}
          </p>
        ) : null}
        <Sparkline
          values={group.byMonth.map((m) => m.cents)}
          className="lg:hidden"
          label={`${group.label}, 12 meses`}
        />
        <GroupTransactions group={group} transactions={transactions} />
      </AccordionContent>
    </AccordionItem>
  );
}

export function CategoryList({ groups, findings, transactions, confirmHref }: CategoryListProps) {
  const [open, setOpen] = useState<string[]>([]);
  useEffect(() => {
    const sync = () => {
      const hash = decodeURIComponent(window.location.hash.replace(/^#grupo-/, ''));
      if (hash !== '' && groups.some((g) => g.slug === hash)) {
        setOpen((current) => (current.includes(hash) ? current : [...current, hash]));
      }
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [groups]);
  return (
    <Accordion
      type="multiple"
      value={open}
      onValueChange={setOpen}
      className="border-t border-border"
    >
      {groups.map((g) => (
        <GroupItem
          key={g.groupId}
          group={g}
          findings={findings}
          transactions={transactions}
          confirmHref={confirmHref}
        />
      ))}
    </Accordion>
  );
}
