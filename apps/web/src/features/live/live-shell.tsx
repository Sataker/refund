import { Gem, Send, UserRound } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Disclaimer } from '@/components/brand/disclaimer';
import { Logo } from '@/components/brand/logo';
import { SandboxSeal } from '@/components/brand/sandbox-seal';
import { ThemeToggle } from '@/components/brand/theme-toggle.client';
import { SidebarNav, TabBar } from '@/features/demo/shell-nav.client';
import { type DataOrigin, liveSealLabel } from './data-origin';
import { OriginBanner } from './origin-banner';

// The /app shell (IDENTITY-AND-UI §5 "App shell"; D30): the same sidebar and 5-item tab bar as /demo, under
// /app/analises/[id]. Server component: the analysis and the plan are read by the layout.

export function LiveShell({
  base,
  companyName,
  planLabel,
  origin,
  children,
}: {
  base: string;
  companyName: string;
  planLabel: string;
  origin: DataOrigin;
  children: ReactNode;
}) {
  const seal = liveSealLabel(origin);
  return (
    <div className="min-h-dvh bg-background lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <a
        href="#conteudo"
        className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Pular para o conteúdo
      </a>
      <aside className="sticky top-0 hidden h-dvh flex-col gap-8 border-r border-border bg-surface px-4 py-6 lg:flex print:hidden">
        <Link
          href="/"
          aria-label="Refund, página inicial"
          className="inline-flex min-h-11 items-center px-3 text-[22px]"
        >
          <Logo />
        </Link>
        <SidebarNav base={base} />
        <div className="mt-auto flex flex-col items-start gap-3 px-3">
          <div className="flex flex-col">
            <span className="type-small font-medium text-foreground">{companyName}</span>
            <span className="type-caption text-muted-foreground" data-testid="plan-label">
              Plano {planLabel} ·{' '}
              <Link
                href={'/app/plano' as Route}
                data-testid="nav-plano"
                className="text-cobalt underline-offset-4 hover:underline"
              >
                ver planos
              </Link>
            </span>
          </div>
          <Link
            href={'/app/conta' as Route}
            data-testid="nav-conta"
            className="type-small inline-flex items-center gap-1.5 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            <UserRound className="size-4" strokeWidth={1.5} aria-hidden="true" />
            Conta e privacidade
          </Link>
          <ThemeToggle />
          <SandboxSeal live label={seal} className="self-start whitespace-normal" />
        </div>
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur print:hidden">
          <div className="mx-auto flex max-w-[1080px] items-center justify-between gap-3 px-4 py-2.5 lg:px-8">
            <Link
              href="/"
              aria-label="Refund, página inicial"
              className="inline-flex min-h-11 items-center text-[20px] lg:hidden"
            >
              <Logo />
            </Link>
            <p className="type-small hidden truncate text-muted-foreground lg:block">
              {companyName}
            </p>
            <div className="flex items-center gap-2">
              <SandboxSeal live={!origin.companySynthetic} compact className="lg:hidden" />
              <Link
                href={'/app/plano' as Route}
                aria-label="Planos"
                data-testid="header-plano"
                className="inline-flex size-10 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-2 lg:hidden"
              >
                <Gem className="size-4" strokeWidth={1.5} aria-hidden="true" />
              </Link>
              <Link
                href={'/app/conta' as Route}
                aria-label="Conta e privacidade"
                className="inline-flex size-10 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-2 lg:hidden"
              >
                <UserRound className="size-4" strokeWidth={1.5} aria-hidden="true" />
              </Link>
              <Link
                href={`${base}/relatorio` as Route}
                data-testid="send-to-accountant"
                className="type-small hidden min-h-10 items-center gap-2 rounded-md bg-primary px-4 font-medium text-primary-foreground transition-opacity duration-(--dur-fast) hover:opacity-90 sm:inline-flex"
              >
                <Send className="size-4" strokeWidth={1.5} aria-hidden="true" />
                Mandar para meu contador
              </Link>
            </div>
          </div>
        </header>
        <main
          id="conteudo"
          className="mx-auto w-full max-w-[1080px] flex-1 overflow-x-clip px-4 pt-6 pb-28 lg:px-8 lg:pt-10 lg:pb-12 print:max-w-none print:p-0"
        >
          <OriginBanner origin={origin} companyName={companyName} className="mb-6 print:hidden" />
          {children}
        </main>
        <footer className="border-t border-border pb-20 lg:pb-0 print:hidden">
          <div className="mx-auto flex max-w-[1080px] flex-wrap items-center justify-between gap-3 px-4 py-4 lg:px-8">
            <Disclaimer />
            <span className="flex items-center gap-4">
              <Link
                href={'/app/plano' as Route}
                data-testid="footer-plano"
                className="type-small text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                Planos
              </Link>
              <Link
                href={'/privacidade' as Route}
                className="type-small text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                Privacidade
              </Link>
            </span>
          </div>
        </footer>
      </div>
      <TabBar base={base} />
    </div>
  );
}

export const PLAN_LABEL: Record<string, string> = {
  free: 'Grátis',
  personal: 'Pessoal',
  mei: 'MEI',
  business: 'Empresa',
  accountant_partner: 'Contador Parceiro',
  accountant_pro: 'Contador Pro',
  accounting_firm: 'Escritório',
  api: 'Parceiros',
};
