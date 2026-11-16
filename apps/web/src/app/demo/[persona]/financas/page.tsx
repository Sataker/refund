import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DEMO_FINANCE_PERSONAS, demoFinance } from '@/features/finance/demo-view';
import { FinanceError, FinanceScreen } from '@/features/finance/finance-screen';

// Screen 5b in /demo (ARCHITECTURE §13): computed at build time from the persona's pipeline run with the canonical
// answers. Zero network and zero environment variables (§7). Free on every plan (§8.3).
// Shell lock (§13): E12/E13 own the track state; this route joins their lock list (`FINANCE_NAV.segment`).

export const dynamicParams = false;

export function generateStaticParams() {
  return DEMO_FINANCE_PERSONAS.map((persona) => ({ persona }));
}

export const metadata: Metadata = { title: 'Finanças · Refund' };

export default async function DemoFinancePage({
  params,
}: {
  params: Promise<{ persona: string }>;
}) {
  const { persona } = await params;
  const result = await demoFinance(persona);
  if (!result.ok) {
    if (result.reason === 'UNKNOWN_PERSONA') notFound();
    return (
      <FinanceError dashboard={`/demo/${persona}/painel`} retry={`/demo/${persona}/financas`} />
    );
  }
  return <FinanceScreen data={result.value} />;
}
