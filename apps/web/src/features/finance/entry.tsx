import { ChevronRight, Wallet } from 'lucide-react';
import { formatBRL } from '@/lib/format';
import type { FinancialView } from './types.ts';

/**
 * Shell wiring for Screen 5b (E13 owns the shell): the nav item ("Finanças", 2nd in the sidebar and in the 5-item
 * mobile tab bar, D30) and the route segment that joins the shell-lock list (ARCHITECTURE §13).
 */
export const FINANCE_NAV = { label: 'Finanças', segment: 'financas', icon: Wallet } as const;

/** The last card of Screen 5: "Para onde foi o dinheiro · R$ X saíram da empresa em 12 meses · {n} categorias com selo". */
export function FinanceEntryCard({ view, href }: { view: FinancialView; href: string }) {
  const holder = view.pj ?? view.pf;
  if (holder === null) return null;
  const sealed = holder.groups.filter((g) => g.seals.length > 0).length;
  const who = holder.holder === 'PJ' ? 'da empresa' : 'da sua conta';
  return (
    <a
      href={href}
      data-testid="fv-entry-card"
      className="group flex items-center justify-between gap-4 rounded-lg border border-border bg-surface p-4 transition-colors duration-(--dur-fast) hover:border-strong-border"
    >
      <span className="flex flex-col gap-1">
        <span className="text-base font-medium text-foreground">Para onde foi o dinheiro</span>
        <span className="type-small text-muted-foreground">
          <span className="num" data-cents={holder.outflow12m}>
            {formatBRL(holder.outflow12m)}
          </span>{' '}
          saíram {who} em 12 meses · {sealed} {sealed === 1 ? 'categoria' : 'categorias'} com selo
        </span>
      </span>
      <span className="type-small inline-flex shrink-0 items-center gap-1 font-medium text-cobalt">
        Ver finanças
        <ChevronRight className="size-4" aria-hidden="true" />
      </span>
    </a>
  );
}
