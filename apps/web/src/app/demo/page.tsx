import { ArrowRight, Building2 } from 'lucide-react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/brand/logo';
import { MoneyHero } from '@/components/brand/money-hero';
import { SandboxSeal } from '@/components/brand/sandbox-seal';
import { runDemoAnalysis } from '@/demo/analysis.ts';
import { DEMO_PERSONAS } from '@/demo/catalog.ts';
import { titleCase } from '@/demo/view.ts';
import { TrackFooter } from '@/features/track/track-frame';

// Persona choice (ARCHITECTURE §13 `/demo`; IDENTITY-AND-UI Screen 0 "Demo persona"): static, each card shows
// the R$ the engine calculated for that persona at build time (§7.3), the hero first and featured.

export const metadata: Metadata = {
  title: 'Demo · Refund',
  description:
    'Veja o Refund achar o dinheiro de uma empresa fictícia, com dados sintéticos e o motor de verdade.',
};

const REGIME = (simples: boolean) => (simples ? 'Simples Nacional' : 'Fora do Simples');

export default async function DemoPage() {
  const personas = await Promise.all(
    [...DEMO_PERSONAS]
      .sort((a, b) => Number(b.hero) - Number(a.hero))
      .map(async (p) => ({ p, run: await runDemoAnalysis(p) })),
  );
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-[1120px] items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" aria-label="Refund, página inicial" className="text-xl">
            <Logo />
          </Link>
          <SandboxSeal />
        </div>
      </header>
      <main
        id="conteudo"
        className="mx-auto w-full max-w-[720px] flex-1 px-4 py-10 sm:px-6 lg:py-16"
      >
        <h1 className="type-h1 text-balance text-foreground">Escolha a empresa da demo</h1>
        <p className="type-body-lg mt-3 max-w-[56ch] text-muted-foreground">
          Empresa e pessoas fictícias, com dados sintéticos. O motor faz a conta de verdade e cita a
          lei em cada centavo. Leva uns 2 minutos.
        </p>
        <ul className="mt-10 flex flex-col gap-4">
          {personas.map(({ p, run }) => {
            const company = p.data.company;
            const total = run.result.engineResult?.total.savings12m ?? null;
            const href = `/demo/${p.id}/comecar/cnpj` as Route;
            return (
              <li key={p.id}>
                <Link
                  href={href}
                  data-testid={`persona-${p.id}`}
                  data-hero={p.hero ? 'true' : undefined}
                  className="group block rounded-xl border border-strong-border bg-surface p-6 shadow-sm transition-[border-color,box-shadow] duration-(--dur-fast) hover:border-foreground hover:shadow-md sm:p-8"
                >
                  <div className="flex items-start gap-4">
                    <span className="grid size-11 shrink-0 place-items-center rounded-md bg-surface-2">
                      <Building2
                        className="size-5 text-muted-foreground"
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                    </span>
                    <div className="min-w-0">
                      <p className="type-h3 text-foreground">
                        {titleCase(company.displayLegalName)}
                      </p>
                      <p className="type-small mt-1 text-muted-foreground">
                        {p.data.holderDisplayName}, {p.role} · {REGIME(company.simples.optedIn)} ·{' '}
                        {company.uf}
                      </p>
                    </div>
                  </div>
                  {total !== null ? (
                    <div className="mt-6 border-t border-border pt-6">
                      <p className="type-small text-muted-foreground">
                        O motor achou, nos próximos 12 meses:
                      </p>
                      <MoneyHero
                        cents={total}
                        size="lg"
                        testId={`demo/persona-total-${p.id}`}
                        srLabel="O motor achou"
                        className="mt-2"
                      />
                    </div>
                  ) : null}
                  <span className="mt-6 inline-flex h-12 items-center gap-2 rounded-md bg-primary px-5 text-base font-medium text-primary-foreground transition-colors duration-(--dur-fast) group-hover:bg-primary/80">
                    Começar com a {p.data.holderDisplayName}
                    <ArrowRight className="size-4" strokeWidth={1.5} aria-hidden="true" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </main>
      <TrackFooter />
    </div>
  );
}
