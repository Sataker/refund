import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DEMO_PERSONAS } from '@/demo/catalog.ts';
import { requireSnapshot } from '@/demo/snapshot.ts';
import { demoFinance } from '@/features/finance/demo-view';
import { FinanceEntryCard } from '@/features/finance/entry';
import { Dashboard } from '@/features/findings/dashboard.client';
import { roiOfferTerms } from '@/server/plans/offer.ts';

// Screen 5 on /demo (ARCHITECTURE §13 `/demo/[persona]/painel`, §7.3): static, computed at build time from the
// persona's pipeline run. The browser only swaps in the engine's result for the visitor's own Screen 7 answers.

export const dynamicParams = false;

export function generateStaticParams(): { persona: string }[] {
  return DEMO_PERSONAS.map((p) => ({ persona: p.id }));
}

export const metadata: Metadata = { title: 'Painel · demo · Refund', robots: { index: false } };

export default async function DemoDashboardPage({
  params,
}: {
  params: Promise<{ persona: string }>;
}) {
  const { persona } = await params;
  const [snap, finance] = await Promise.all([requireSnapshot(persona), demoFinance(persona)]);
  if (!snap) notFound();
  return (
    <Dashboard
      persona={persona}
      title={`${snap.view.companyName} + ${snap.view.holderName}`}
      holderName={snap.view.holderName}
      base={snap.dashboard}
      cards={snap.cards}
      offer={{ terms: roiOfferTerms(), href: `/demo/${persona}/plano` }}
      financeCard={
        finance.ok ? (
          <FinanceEntryCard view={finance.value.view} href={`/demo/${persona}/financas`} />
        ) : null
      }
    />
  );
}
