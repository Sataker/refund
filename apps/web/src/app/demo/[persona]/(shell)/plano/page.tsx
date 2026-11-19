import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DEMO_PERSONAS, demoPersona } from '@/demo/catalog.ts';
import { DemoPlans } from '@/features/plans/demo-plans.client';
import { plansModel } from '@/server/plans/offer.ts';

// Screen 10 on /demo (ARCHITECTURE §13 `/demo/[persona]/plano`, simulated): the prices come from the catalog in code at
// build time; the Pix is staged in the browser and labelled "simulação" (TESTS D14). Zero env, no network.

export const dynamicParams = false;

export function generateStaticParams(): { persona: string }[] {
  return DEMO_PERSONAS.map((p) => ({ persona: p.id }));
}

export const metadata: Metadata = { title: 'Planos · demo · Refund', robots: { index: false } };

export default async function DemoPlanPage({ params }: { params: Promise<{ persona: string }> }) {
  const { persona } = await params;
  if (!demoPersona(persona)) notFound();
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1.5">
        <p className="type-small text-muted-foreground">Planos e Pix</p>
        <h1 className="font-serif text-[36px] leading-[40px] font-normal text-foreground lg:text-[44px] lg:leading-[48px]">
          O valor é grátis. O caminho completo é do plano.
        </h1>
        <p className="type-small max-w-[60ch] text-muted-foreground">
          Todos os achados aparecem com o valor em qualquer plano. Os planos pagos abrem todos os
          cálculos, o plano de ação completo e o acompanhamento.
        </p>
      </header>
      <DemoPlans persona={persona} model={plansModel()} />
    </div>
  );
}
