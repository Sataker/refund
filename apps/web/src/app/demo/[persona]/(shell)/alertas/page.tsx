import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DEMO_PERSONAS } from '@/demo/catalog.ts';
import { demoLawAlert } from '@/demo/law-alert.ts';
import { LawAlert } from '@/features/law/law-alert.client';

// Screen 9 on /demo (ARCHITECTURE §13 `/demo/[persona]/alertas`; E16 task 3): static, built at build time from the
// law-change fixture and the persona's run. "Simular publicação" only reveals what the build computed.

export const dynamicParams = false;

export function generateStaticParams(): { persona: string }[] {
  return DEMO_PERSONAS.map((p) => ({ persona: p.id }));
}

export const metadata: Metadata = { title: 'Alertas · demo · Refund', robots: { index: false } };

export default async function DemoAlertsPage({ params }: { params: Promise<{ persona: string }> }) {
  const { persona } = await params;
  const model = await demoLawAlert(persona);
  if (!model) notFound();
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1.5">
        <p className="type-small text-muted-foreground">
          Quando uma lei que usamos muda · canal: e-mail
        </p>
        <h1 className="font-serif text-[36px] leading-[40px] font-normal text-foreground lg:text-[44px] lg:leading-[48px]">
          Alertas
        </h1>
      </header>
      <LawAlert model={model} persona={persona} />
    </div>
  );
}
