import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Disclaimer } from '@/components/brand/disclaimer';
import { Logo } from '@/components/brand/logo';
import { SandboxSeal } from '@/components/brand/sandbox-seal';
import { ROUTES } from '@/features/landing/routes';

/**
 * `/app` without a database (backup deployment, zero env in production; ARCHITECTURE §4.10, §12): a
 * human sentence and the way out, the demo. Never an error code.
 */
export function LiveUnavailable({ message }: { message: string }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background" data-testid="live-unavailable">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-[1120px] items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="Refund, página inicial" className="text-xl">
            <Logo />
          </Link>
          <SandboxSeal className="hidden sm:inline-flex" />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-[560px] flex-1 flex-col justify-center px-4 py-16">
        <h1 className="type-h1 text-foreground">Modo ao vivo indisponível</h1>
        <p className="type-body-lg mt-4 text-muted-foreground">{message}</p>
        <Link
          href={ROUTES.demo}
          className="mt-8 inline-flex h-14 items-center justify-center gap-2 self-start rounded-md bg-primary px-6 text-base font-medium text-primary-foreground hover:bg-primary/80"
        >
          Ver a demo
          <ArrowRight className="size-4" strokeWidth={1.5} aria-hidden="true" />
        </Link>
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto max-w-[1120px] px-4 py-5 sm:px-6">
          <Disclaimer size="caption" />
        </div>
      </footer>
    </div>
  );
}
