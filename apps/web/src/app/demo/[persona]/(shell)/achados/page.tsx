import { ChevronRight } from 'lucide-react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ConfidenceBadge } from '@/components/brand/confidence-badge';
import { DEMO_PERSONAS } from '@/demo/catalog.ts';
import { requireSnapshot } from '@/demo/snapshot.ts';
import type { DashboardFinding } from '@/features/findings/model';
import { formatBRL } from '@/lib/format';

// "Achados" in the shell (D30 tab bar): every finding of the persona's run, by kind, each opening Screen 6.

export const dynamicParams = false;

export function generateStaticParams(): { persona: string }[] {
  return DEMO_PERSONAS.map((p) => ({ persona: p.id }));
}

export const metadata: Metadata = { title: 'Achados · demo · Refund', robots: { index: false } };

function Row({ persona, f, value }: { persona: string; f: DashboardFinding; value: string }) {
  return (
    <li>
      <Link
        href={`/demo/${persona}/achados/${f.ruleId}` as Route}
        data-testid={`list-${f.ruleId}`}
        className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface p-4 transition-colors duration-(--dur-fast) hover:border-strong-border"
      >
        <span className="flex min-w-0 flex-col gap-1">
          <span className="text-base font-medium text-foreground">{f.title}</span>
          <span className="type-small num text-muted-foreground">{value}</span>
          {f.type === 'savings' || f.type === 'recovery' ? (
            <ConfidenceBadge level={f.confidence} />
          ) : null}
        </span>
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground"
          strokeWidth={1.5}
          aria-hidden="true"
        />
      </Link>
    </li>
  );
}

export default async function DemoFindingsPage({
  params,
}: {
  params: Promise<{ persona: string }>;
}) {
  const { persona } = await params;
  const snap = await requireSnapshot(persona);
  if (!snap) notFound();
  const d = snap.dashboard;
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1.5">
        <p className="type-small text-muted-foreground">
          Achados · {snap.view.companyName} + {snap.view.holderName}
        </p>
        <h1 className="font-serif text-[36px] leading-[40px] font-normal text-foreground lg:text-[44px] lg:leading-[48px]">
          O que achamos
        </h1>
      </header>
      <section aria-labelledby="h-economia" className="flex flex-col gap-3">
        <h2 id="h-economia" className="type-h4 text-foreground">
          Pagar a menos
        </h2>
        <ul className="flex flex-col gap-2">
          {d.savings.map((f) => (
            <Row
              key={f.ruleId}
              persona={persona}
              f={f}
              value={`${formatBRL(f.cents)} nos próximos 12 meses`}
            />
          ))}
        </ul>
      </section>
      {d.recovery.length > 0 ? (
        <section aria-labelledby="h-recuperar" className="flex flex-col gap-3">
          <h2 id="h-recuperar" className="type-h4 text-foreground">
            Para recuperar · fora do total
          </h2>
          <ul className="flex flex-col gap-2">
            {d.recovery.map((f) => (
              <Row
                key={f.ruleId}
                persona={persona}
                f={f}
                value={
                  f.range ? `${formatBRL(f.range[0])} a ${formatBRL(f.range[1])} (estimativa)` : ''
                }
              />
            ))}
          </ul>
        </section>
      ) : null}
      {d.alerts.length > 0 ? (
        <section aria-labelledby="h-alertas" className="flex flex-col gap-3">
          <h2 id="h-alertas" className="type-h4 text-foreground">
            Riscos e alertas · fora do total
          </h2>
          <ul className="flex flex-col gap-2">
            {d.alerts.map((f) => (
              <Row
                key={f.ruleId}
                persona={persona}
                f={f}
                value={
                  f.cents > 0
                    ? `custo de caixa ${formatBRL(f.cents)}`
                    : f.type === 'risk'
                      ? 'risco'
                      : 'alerta'
                }
              />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
