import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Disclaimer } from '@/components/brand/disclaimer';
import { Logo } from '@/components/brand/logo';
import { SandboxSeal } from '@/components/brand/sandbox-seal';
import { DEMO_PERSONAS } from '@/demo/catalog.ts';
import { requireSnapshot } from '@/demo/snapshot.ts';
import { displayTitle } from '@/features/demo/display';
import { type AccountantItem, AccountantReview } from '@/features/findings/accountant.client';
import { DEMO_ACCOUNTANT_FULL } from '@/features/findings/text';
import { VisitorNotice } from '@/features/findings/visitor-notice.client';
import { formatBRL } from '@/lib/format';

// The accountant's tab on /demo (ARCHITECTURE §13 `/demo/[persona]/contador`, §4.7 note): the live product sends a
// link by e-mail (`/r/[token]`); the demo opens this page in another tab and approves through BroadcastChannel.

export const dynamicParams = false;

export function generateStaticParams(): { persona: string }[] {
  return DEMO_PERSONAS.map((p) => ({ persona: p.id }));
}

export const metadata: Metadata = {
  title: 'Visão do contador · demo · Refund',
  robots: { index: false },
};

export default async function DemoAccountantPage({
  params,
}: {
  params: Promise<{ persona: string }>;
}) {
  const { persona } = await params;
  const snap = await requireSnapshot(persona);
  if (!snap) notFound();
  const ordered = [...snap.result.findings].sort(
    (a, b) => b.marginalValue12m - a.marginalValue12m || a.order - b.order,
  );
  const savingsFirst = [
    ...ordered.filter((f) => f.type === 'savings'),
    ...ordered.filter((f) => f.type === 'recovery'),
    ...ordered.filter((f) => f.type === 'alert' || f.type === 'risk'),
  ];
  const items: AccountantItem[] = savingsFirst.flatMap((f): AccountantItem[] => {
    const title = displayTitle(f.ruleId, f.title);
    if (f.type === 'savings')
      return [
        {
          ruleId: f.ruleId,
          title,
          value: `${formatBRL(f.marginalValue12m)} nos próximos 12 meses`,
        },
      ];
    if ((f.type === 'alert' || f.type === 'risk') && f.marginalValue12m >= 0)
      return [
        {
          ruleId: f.ruleId,
          title,
          value:
            f.marginalValue12m > 0
              ? `custo de caixa ${formatBRL(f.marginalValue12m)} · fora do total`
              : 'fora do total',
          readOnly: true,
        },
      ];
    if (f.type === 'recovery' && f.range)
      return [
        {
          ruleId: f.ruleId,
          title: 'Recuperar o que foi pago a mais',
          value: `${formatBRL(f.range[0])} a ${formatBRL(f.range[1])} (estimativa, fora do total)`,
        },
      ];
    return [];
  });
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-[860px] items-center justify-between gap-3 px-4 py-3">
          <span className="text-[22px]">
            <Logo />
          </span>
          <SandboxSeal compact />
        </div>
      </header>
      <main
        id="conteudo"
        className="mx-auto flex w-full max-w-[860px] flex-1 flex-col gap-6 px-4 py-8"
      >
        <header className="flex flex-col gap-2">
          <p className="type-small text-muted-foreground">Visão do contador · demo, sem login</p>
          <h1 className="font-serif text-[32px] leading-[36px] font-normal text-foreground lg:text-[40px] lg:leading-[44px]">
            Relatório de {snap.view.companyName} para {DEMO_ACCOUNTANT_FULL}
          </h1>
          <p className="text-base text-muted-foreground">
            Total confirmado nos próximos 12 meses:{' '}
            <span className="num font-medium text-foreground" data-cents={snap.dashboard.total}>
              {formatBRL(snap.dashboard.total)}
            </span>
            . Revise cada achado e aprove.
          </p>
        </header>
        <VisitorNotice
          persona={persona}
          holderName={snap.view.holderName}
          cards={snap.cards}
          base={snap.dashboard}
        />
        <AccountantReview persona={persona} items={items} />
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto max-w-[860px] px-4 py-4">
          <Disclaimer />
        </div>
      </footer>
    </div>
  );
}
