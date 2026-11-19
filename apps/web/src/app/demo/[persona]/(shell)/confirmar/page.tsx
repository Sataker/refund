import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DEMO_PERSONAS } from '@/demo/catalog.ts';
import { requireSnapshot } from '@/demo/snapshot.ts';
import { ConfirmScreen } from '@/features/findings/confirm-screen.client';

// Screen 7 on /demo (ARCHITECTURE §13 `/demo/[persona]/confirmar`): the cards the pipeline asked, built at build
// time with the persona's answers; a change is recalculated by POST /api/demo/recalcular (real pipeline).

export const dynamicParams = false;

export function generateStaticParams(): { persona: string }[] {
  return DEMO_PERSONAS.map((p) => ({ persona: p.id }));
}

export const metadata: Metadata = { title: 'Confirmar · demo · Refund', robots: { index: false } };

export default async function DemoConfirmPage({
  params,
}: {
  params: Promise<{ persona: string }>;
}) {
  const { persona } = await params;
  const snap = await requireSnapshot(persona);
  if (!snap) notFound();
  return (
    <ConfirmScreen
      persona={persona}
      holderName={snap.view.holderName}
      base={snap.dashboard}
      cards={snap.cards}
    />
  );
}
