import type { Route } from 'next';
import { notFound, redirect } from 'next/navigation';
import { DEMO_PERSONAS, demoPersona } from '@/demo/catalog.ts';

// `/demo/[persona]` opens the persona's first-access track (D19, 14/11: Screen 1 became the steps of
// `/demo/[persona]/comecar/[passo]`). Kept as a short link, e.g. for the QR code on the last slide (§6.1).

export const dynamicParams = false;

export function generateStaticParams(): { persona: string }[] {
  return DEMO_PERSONAS.map((p) => ({ persona: p.id }));
}

export default async function DemoPersonaPage({
  params,
}: {
  params: Promise<{ persona: string }>;
}) {
  const { persona } = await params;
  if (!demoPersona(persona)) notFound();
  redirect(`/demo/${persona}/comecar/cnpj` as Route);
}
