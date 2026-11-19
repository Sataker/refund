import { Send } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { Disclaimer } from '@/components/brand/disclaimer';
import { Logo } from '@/components/brand/logo';
import { SandboxSeal } from '@/components/brand/sandbox-seal';
import { ThemeToggle } from '@/components/brand/theme-toggle.client';
import { demoPersona } from '@/demo/catalog.ts';
import { titleCase } from '@/demo/view.ts';
import { ShellLock, ShellRestart, SidebarNav, TabBar } from '@/features/demo/shell-nav.client';

// The /demo app shell (IDENTITY-AND-UI §5 "App shell"): 248px sidebar on desktop; on mobile a top bar with the seal
// and the 5-item tab bar (D30). Logo, SandboxSeal and Disclaimer are always visible. Screens 5–8 and 5b live here.

export default async function DemoShell({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ persona: string }>;
}) {
  const { persona: id } = await params;
  const persona = demoPersona(id);
  if (!persona) notFound();
  const company = titleCase(persona.data.company.displayLegalName);
  return (
    <div className="min-h-dvh bg-background lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <a
        href="#conteudo"
        className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Pular para o conteúdo
      </a>
      <ShellLock persona={id} />
      <aside className="sticky top-0 hidden h-dvh flex-col gap-8 border-r border-border bg-surface px-4 py-6 lg:flex print:hidden">
        <Link
          href="/"
          aria-label="Refund, página inicial"
          className="inline-flex min-h-11 items-center px-3 text-[22px]"
        >
          <Logo />
        </Link>
        <SidebarNav base={`/demo/${id}`} />
        <div className="mt-auto flex flex-col items-start gap-3 px-3">
          <div className="flex flex-col">
            <span className="type-small font-medium text-foreground">
              {persona.data.holderDisplayName}
            </span>
            <span className="type-caption text-muted-foreground">{company} · persona</span>
          </div>
          <ThemeToggle />
          <ShellRestart persona={id} />
          <SandboxSeal className="self-start whitespace-normal" />
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
              {company} + {persona.data.holderDisplayName}
            </p>
            <div className="flex items-center gap-2">
              <SandboxSeal compact className="lg:hidden" />
              <span className="lg:hidden">
                <ThemeToggle compact shortcut={false} />
              </span>
              <Link
                href={`/demo/${id}/relatorio` as Route}
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
          {children}
        </main>
        <footer className="border-t border-border pb-20 lg:pb-0 print:hidden">
          <div className="mx-auto flex max-w-[1080px] flex-wrap items-center justify-between gap-3 px-4 py-4 lg:px-8">
            <Disclaimer />
            <span className="lg:hidden">
              <ShellRestart persona={id} />
            </span>
          </div>
        </footer>
      </div>
      <TabBar base={`/demo/${id}`} />
    </div>
  );
}
