'use client';

import {
  FileText,
  LayoutDashboard,
  ListChecks,
  type LucideIcon,
  SearchCheck,
  Send,
} from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { demoSession, rememberReturn, restartDemo } from '@/demo/demo-session';
import { FINANCE_NAV } from '@/features/finance/entry';
import { cn } from '@/lib/utils';

// The /demo app shell navigation (IDENTITY-AND-UI §5 "App shell"; D30: the 5-item mobile tab bar). One list feeds
// the desktop sidebar and the mobile tab bar, so both always show the same 5 destinations.

interface NavItem {
  label: string;
  segment: string;
  icon: LucideIcon;
}

export const SHELL_NAV: readonly NavItem[] = [
  { label: 'Painel', segment: 'painel', icon: LayoutDashboard },
  FINANCE_NAV,
  { label: 'Achados', segment: 'achados', icon: SearchCheck },
  { label: 'Confirmar', segment: 'confirmar', icon: ListChecks },
  { label: 'Relatório', segment: 'relatorio', icon: FileText },
];

/** ARCHITECTURE §13 shell lock: the segments that wait for the first-access track. */
export const LOCKED_SEGMENTS: readonly string[] = SHELL_NAV.map((n) => n.segment);

function useActive(base: string): (segment: string) => boolean {
  const path = usePathname();
  return (segment) => path.startsWith(`${base}/${segment}`);
}

/** `base`: '/demo/<persona>' or '/app/analises/<id>' (the same 5 destinations under it). */
export function SidebarNav({ base }: { base: string }) {
  const active = useActive(base);
  return (
    <nav aria-label="Seções" className="flex flex-col gap-1">
      {SHELL_NAV.map(({ label, segment, icon: Icon }) => {
        const on = active(segment);
        return (
          <Link
            key={segment}
            href={`${base}/${segment}` as Route}
            aria-current={on ? 'page' : undefined}
            data-testid={`nav-${segment}`}
            className={cn(
              'type-small flex min-h-10 items-center gap-3 rounded-md px-3 font-medium transition-colors duration-(--dur-fast)',
              on
                ? 'bg-surface-2 text-foreground'
                : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
            )}
          >
            <Icon className="size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function TabBar({ base }: { base: string }) {
  const active = useActive(base);
  return (
    <nav
      aria-label="Seções"
      data-testid="tab-bar"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden print:hidden"
    >
      <ul className="grid grid-cols-5">
        {SHELL_NAV.map(({ label, segment, icon: Icon }) => {
          const on = active(segment);
          return (
            <li key={segment}>
              <Link
                href={`${base}/${segment}` as Route}
                aria-current={on ? 'page' : undefined}
                data-testid={`tab-${segment}`}
                className={cn(
                  'flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] leading-4 font-medium',
                  on ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                <Icon
                  className={cn('size-5', on && 'text-cobalt')}
                  strokeWidth={on ? 2 : 1.5}
                  aria-hidden="true"
                />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Shell lock (ARCHITECTURE §13): until the track ends (analysis watched or "Pular para o painel"), the shell routes
 * send the visitor back to the track. /demo keeps that state in the browser only (demo-session.ts). D58: the plans
 * screen stays open, as on /app after the estimate, because the estimate's offer leads there.
 */
export function ShellLock({ persona }: { persona: string }) {
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (pathname === `/demo/${persona}/plano`) return;
    if (demoSession().personas[persona]?.trackDone !== true) {
      rememberReturn(persona, window.location.pathname);
      router.replace(`/demo/${persona}/comecar/cnpj` as Route);
    }
  }, [persona, router, pathname]);
  return null;
}

/** The header's "Mandar para meu contador", hidden on the report itself (UX review G2 L5). */
export function SendToAccountant({ persona }: { persona: string }) {
  const href = `/demo/${persona}/relatorio`;
  if (usePathname() === href) return null;
  return (
    <Link
      href={href as Route}
      data-testid="send-to-accountant"
      className="type-small hidden min-h-10 items-center gap-2 rounded-md bg-primary px-4 font-medium text-primary-foreground transition-opacity duration-(--dur-fast) hover:opacity-90 sm:inline-flex"
    >
      <Send className="size-4" strokeWidth={1.5} aria-hidden="true" />
      Mandar para meu contador
    </Link>
  );
}

export function ShellRestart({ persona }: { persona: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        restartDemo();
        router.push(`/demo/${persona}/comecar/cnpj` as Route);
      }}
      className="type-small text-muted-foreground underline underline-offset-4 hover:text-foreground"
      data-testid="restart-demo"
    >
      Recomeçar demo
    </button>
  );
}
