'use client';

import { ChevronDown, Diamond } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatBRL, formatYearMonth } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Sparkline } from './sparkline.tsx';
import { TaxSeal } from './tax-seal.client.tsx';
import { comparedTo, formatBps, formatDate, ORIGIN_LABEL } from './text.ts';
import type { GroupLine, SealFinding, TxRow } from './types.ts';

// "Por categoria" (Screen 5b, hierarchy item 4): the heart of the screen. Each group is a disclosure (a plain button
// with aria-expanded; no accordion library, ARCHITECTURE §11.1 budget); its seals sit outside the button (a chip is
// its own button). `#grupo-<slug>` opens a group already expanded.

export interface CategoryListProps {
  groups: GroupLine[];
  findings: Record<string, SealFinding>;
  transactions: Record<string, TxRow>;
  confirmHref: string;
  holder: 'pj' | 'pf';
  /** Test-id key per slug (`groupKeys`): the groupId, plus the direction when the holder has both. */
  keys: Record<string, string>;
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
            <span className="type-small col-span-2 row-start-2 min-w-0 break-words text-foreground lg:col-span-1 lg:row-auto lg:truncate">
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
  testKey,
  open,
  onToggle,
  findings,
  transactions,
  confirmHref,
}: Omit<CategoryListProps, 'groups' | 'holder' | 'keys'> & {
  group: GroupLine;
  testKey: string;
  open: boolean;
  onToggle: () => void;
}) {
  const last = group.byMonth.at(-1);
  const prev = group.byMonth.at(-2);
  const contentId = `grupo-${group.slug}-conteudo`;
  return (
    <div
      id={`grupo-${group.slug}`}
      data-testid={`fv-group-${testKey}`}
      data-cents={group.total12m}
      className="scroll-mt-6 border-b border-border"
    >
      <h3 className="flex">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={onToggle}
          className="flex min-h-11 flex-1 items-center gap-3 rounded-md py-3 text-left"
        >
          <span className="flex min-w-0 flex-1 flex-col gap-0.5 lg:flex-row lg:items-center lg:gap-4">
            <span className="flex min-w-0 items-center gap-1.5 text-base font-medium text-foreground lg:flex-1">
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
              <span className="type-small lg:w-[72px] lg:text-right">{group.count} lanç.</span>
            </span>
          </span>
          <Sparkline values={group.byMonth.map((m) => m.cents)} className="hidden lg:block" />
          <ChevronDown
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-transform duration-(--dur-fast)',
              open && 'rotate-180',
            )}
            aria-hidden="true"
          />
        </button>
      </h3>
      {group.seals.length > 0 || group.pending > 0 ? (
        <div className="-mt-1 flex flex-wrap items-center gap-2 pb-3">
          {group.seals.map((seal) => (
            <TaxSeal
              key={seal.kind}
              groupKey={testKey}
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
              data-testid={`fv-pending-${testKey}`}
              className="type-small inline-flex min-h-11 items-center font-medium text-cobalt underline-offset-4 hover:underline lg:min-h-0"
            >
              {group.pending} a confirmar →
            </a>
          ) : null}
        </div>
      ) : null}
      <div id={contentId} hidden={!open} className="flex flex-col gap-3 pb-4">
        {open && last !== undefined && prev !== undefined ? (
          <p className="type-small text-muted-foreground">
            <span className="num">
              {formatYearMonth(last.month)}: {formatBRL(group.lastMonth)}
            </span>{' '}
            · {comparedTo(group.deltaCents, prev.month)}
          </p>
        ) : null}
        {open ? (
          <>
            <Sparkline
              values={group.byMonth.map((m) => m.cents)}
              className="lg:hidden"
              label={`${group.label}, 12 meses`}
            />
            <GroupTransactions group={group} transactions={transactions} />
          </>
        ) : null}
      </div>
    </div>
  );
}

export function CategoryList({
  groups,
  findings,
  transactions,
  confirmHref,
  keys,
}: CategoryListProps) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const sync = () => {
      const hash = decodeURIComponent(window.location.hash.replace(/^#grupo-/, ''));
      if (hash !== '' && groups.some((g) => g.slug === hash)) {
        setOpen((current) => (current.has(hash) ? current : new Set([...current, hash])));
      }
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [groups]);
  const toggle = (slug: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  return (
    <div className="border-t border-border">
      {groups.map((g) => (
        <GroupItem
          key={g.slug}
          group={g}
          testKey={keys[g.slug] ?? g.groupId}
          open={open.has(g.slug)}
          onToggle={() => toggle(g.slug)}
          findings={findings}
          transactions={transactions}
          confirmHref={confirmHref}
        />
      ))}
    </div>
  );
}
