import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DEMO_PERSONAS } from '@/demo/catalog.ts';
import { lawExcerpt, requireSnapshot } from '@/demo/snapshot.ts';
import { Report } from '@/features/findings/report';
import { ReportApprovalLine, ReportPanel } from '@/features/findings/report-status.client';
import { VisitorNotice } from '@/features/findings/visitor-notice.client';

// Screen 8 on /demo (ARCHITECTURE §13 `/demo/[persona]/relatorio`): the printable calculation record, built at build
// time from the persona's run, and the approval panel (the accountant approves in another tab, BroadcastChannel).

export const dynamicParams = false;

export function generateStaticParams(): { persona: string }[] {
  return DEMO_PERSONAS.map((p) => ({ persona: p.id }));
}

export const metadata: Metadata = { title: 'Relatório · demo · Refund', robots: { index: false } };

export default async function DemoReportPage({ params }: { params: Promise<{ persona: string }> }) {
  const { persona } = await params;
  const snap = await requireSnapshot(persona);
  if (!snap) notFound();
  const labels = new Map<string, string>();
  for (const f of snap.result.findings)
    for (const id of f.actionPlan.flatMap((s) => s.refIds)) {
      const e = lawExcerpt(id);
      if (e) labels.set(id, e.label);
    }
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1.5 print:hidden">
        <p className="type-small text-muted-foreground">
          Relatório · {snap.view.companyName} + {snap.view.holderName}
        </p>
        <h1 className="font-serif text-[36px] leading-[40px] font-normal text-foreground lg:text-[44px] lg:leading-[48px]">
          Relatório para o contador
        </h1>
      </header>
      <VisitorNotice
        persona={persona}
        holderName={snap.view.holderName}
        cards={snap.cards}
        base={snap.dashboard}
      />
      <ReportPanel persona={persona} />
      <Report
        company={snap.view.companyName}
        holderName={snap.view.holderName}
        analysisDate={snap.facts.analysisDate}
        result={snap.result}
        model={snap.dashboard}
        labelOf={(id) => labels.get(id)}
        approval={<ReportApprovalLine persona={persona} />}
      />
    </div>
  );
}
