import type { Metadata, Route } from 'next';
import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { DEMO_PERSONAS, demoPersona } from '@/demo/catalog.ts';
import { estimateTable } from '@/demo/estimates.ts';
import { personaView } from '@/demo/view.ts';
import { CompanyCard } from '@/features/company/company-card';
import { EstimateView } from '@/features/company/estimate-view';
import { ConsentContent } from '@/features/connection/consent-content';
import { DemoTrack, type DemoTrackSlots } from '@/features/demo/demo-track.client';
import { demoProgress } from '@/features/demo/progress';
import { applies, isStep, STEP_LABEL, STEPS } from '@/features/track/steps';

// First-access track on /demo (D19; ARCHITECTURE §13 `/demo/[persona]/comecar/[passo]`): static pages,
// one per persona and step (ADR-004). Everything the step needs is computed here at build time; the answers
// the visitor changes travel in the URL and in sessionStorage.

export const dynamicParams = false;

export function generateStaticParams(): { persona: string; passo: string }[] {
  return DEMO_PERSONAS.flatMap((p) => STEPS.map((passo) => ({ persona: p.id, passo })));
}

interface PageProps {
  params: Promise<{ persona: string; passo: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { passo } = await params;
  return {
    title: `${isStep(passo) ? STEP_LABEL[passo] : 'Demo'} · demo · Refund`,
    robots: { index: false },
  };
}

export default async function DemoStepPage({ params }: PageProps) {
  const { persona: id, passo } = await params;
  const persona = demoPersona(id);
  if (!persona || !isStep(passo)) notFound();
  const view = personaView(persona);
  const defaults = { answers: persona.profileAnswers, pfSkipped: false };

  // A conditional step that does not apply leads to the next one (ARCHITECTURE §13).
  if (!applies(passo, demoProgress(passo, defaults, view))) {
    const after = STEPS.slice(STEPS.indexOf(passo) + 1).find((s) =>
      applies(s, demoProgress(s, defaults, view)),
    );
    redirect((after ? `/demo/${id}/comecar/${after}` : `/demo/${id}/analise`) as Route);
  }

  const slots: DemoTrackSlots = {};
  if (passo === 'confirmar-empresa')
    slots.companyCard = <CompanyCard company={persona.data.company} />;
  if (passo === 'permissoes') slots.consent = <ConsentContent />;
  if (passo === 'estimativa') {
    const table = estimateTable(persona);
    if (table.ok) {
      const variants: Record<string, ReactNode> = {};
      for (const v of table.value.variants)
        variants[v.id] = (
          <EstimateView estimate={v.estimate} cnae={persona.data.company.primaryCnae.code} />
        );
      slots.estimates = { variants, index: table.value.index };
    }
  }

  return <DemoTrack persona={view} step={passo} defaults={defaults} slots={slots} />;
}
