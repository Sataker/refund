import Link from 'next/link';
import type { ReactNode } from 'react';
import { Disclaimer } from '@/components/brand/disclaimer';
import { Logo } from '@/components/brand/logo';
import { SandboxSeal } from '@/components/brand/sandbox-seal';
import { ThemeToggle } from '@/components/brand/theme-toggle.client';

// TEMPORARY frame for Screen 5b until E13's /demo/[persona] shell exists (logo, SandboxSeal and Disclaimer are
// "always visible", IDENTITY-AND-UI §5). When E13 adds app/demo/[persona]/layout.tsx with the sidebar and the 5-item
// tab bar (D30), delete this file: the page renders inside the shell's content area unchanged.
export default function FinanceFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-[1080px] items-center justify-between gap-3 px-4 py-3 lg:px-8">
          <Link
            href="/"
            aria-label="Refund, página inicial"
            className="inline-flex min-h-11 items-center text-[22px]"
          >
            <Logo />
          </Link>
          <div className="flex items-center gap-2">
            <SandboxSeal className="hidden sm:inline-flex" />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main
        id="conteudo"
        className="mx-auto w-full max-w-[1080px] flex-1 px-4 pt-6 pb-10 lg:px-8 lg:pt-10"
      >
        <SandboxSeal className="mb-4 sm:hidden" />
        {children}
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto max-w-[1080px] px-4 py-4 lg:px-8">
          <Disclaimer />
        </div>
      </footer>
    </div>
  );
}
