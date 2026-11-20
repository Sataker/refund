import type { Route } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Disclaimer } from '@/components/brand/disclaimer';
import { Logo } from '@/components/brand/logo';
import { ROUTES } from '@/features/landing/routes';
import { SiteFooter } from '@/features/landing/sections';

// Shell of the support pages (ARCHITECTURE §13 "Support"; IDENTITY-AND-UI §5.14): the /privacidade layout from E14,
// plus a way back to /demo in the header and the site footer so every support page links the others. The page-level
// disclaimer is opt-out: it belongs next to an R$ or a tax promise, not on /status or /seguranca (UX review E20, L1).
// Static, zero env.

export function SupportPage({
  title,
  lead,
  testId,
  disclaimer = true,
  children,
}: {
  title: string;
  lead: ReactNode;
  testId: string;
  /** The "Estimativa informativa" line under the content (the footer keeps its own). */
  disclaimer?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2"
      >
        Pular para o conteúdo
      </a>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-16 max-w-[1120px] items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" aria-label="Refund, página inicial" className="text-xl">
            <Logo />
          </Link>
          <Link
            href={ROUTES.demo}
            data-testid="support/demo-link"
            className="type-small inline-flex h-11 items-center rounded-md border border-strong-border bg-surface px-4 font-medium text-foreground transition-colors duration-(--dur-fast) hover:bg-muted"
          >
            Ver a demonstração
          </Link>
        </div>
      </header>
      <main
        id="conteudo"
        className="mx-auto flex w-full max-w-[720px] flex-1 flex-col gap-8 px-4 py-12"
        data-testid={testId}
      >
        <div className="flex flex-col gap-3">
          <h1 className="type-h1 text-foreground">{title}</h1>
          <p className="type-body-lg text-muted-foreground">{lead}</p>
        </div>
        {children}
        {disclaimer ? <Disclaimer /> : null}
      </main>
      <SiteFooter />
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="type-h4 text-foreground">{title}</h2>
      <div className="flex flex-col gap-2 text-base text-foreground">{children}</div>
    </section>
  );
}

export function Bullets({ children }: { children: ReactNode }) {
  return <ul className="flex list-disc flex-col gap-2 pl-5">{children}</ul>;
}

/** Inline link to another page of the site, in the body text of a support page. */
export function TextLink({ href, children }: { href: Route; children: ReactNode }) {
  return (
    <Link href={href} className="text-cobalt underline underline-offset-4">
      {children}
    </Link>
  );
}
