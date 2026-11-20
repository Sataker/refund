import { latestReport } from '@refund/db';
import type { Metadata } from 'next';
import { sendReportFor } from '@/app/(live)/app/analises/actions';
import { lawExcerpt } from '@/demo/snapshot.ts';
import { Report } from '@/features/findings/report';
import { bankBannerText, liveSealLabel } from '@/features/live/data-origin';
import { ReportSender } from '@/features/live/report-sender.client';
import { LiveUnavailable } from '@/features/track/live-unavailable';
import { shellPage } from '@/server/analysis/page.ts';
import { reportResult } from '@/server/analysis/read.ts';
import { reportStatusOf } from '@/server/report/report.ts';

// Screen 8 in /app (ARCHITECTURE §13 `/app/analises/[id]/relatorio`). The owner's printable report follows the plan
// (`reportPdf: 'summary'` on free: values, plan and citations, with the calculation only of the largest finding; the
// locked traces are emptied on the server). The accountant opens the full one through the link (§8.2).

export const metadata: Metadata = { title: 'Relatório · Refund', robots: { index: false } };

export default async function LiveReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const page = await shellPage(id);
  if (page.kind === 'off') return <LiveUnavailable message={page.message} />;
  const { ctx, live } = page;
  const full = live.ent.reportPdf !== 'summary';
  const result = reportResult(live, full);
  const last = await latestReport(ctx.db, id);
  const labels = new Map<string, string>();
  for (const f of result.findings)
    for (const ref of f.actionPlan.flatMap((s) => s.refIds)) {
      const e = lawExcerpt(ref);
      if (e) labels.set(ref, e.label);
    }
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1.5 print:hidden">
        <p className="type-small text-muted-foreground">Relatório · {live.companyName}</p>
        <h1 className="font-serif text-[36px] leading-[40px] font-normal text-foreground lg:text-[44px] lg:leading-[48px]">
          Relatório para o contador
        </h1>
        {full ? null : (
          <p className="type-small text-muted-foreground" data-testid="report-summary-note">
            No plano Grátis este relatório mostra a conta completa só do maior achado. Seu contador
            recebe o relatório completo pelo link.
          </p>
        )}
      </header>
      <ReportSender
        send={sendReportFor.bind(null, id)}
        emailOn={ctx.caps.email}
        last={last ? { reportId: last.id, status: reportStatusOf(last) } : null}
      />
      <Report
        company={live.companyName}
        analysisDate={live.analysisDate}
        result={result}
        model={live.dashboard}
        labelOf={(ref) => labels.get(ref)}
        live
        seal={liveSealLabel(live.origin)}
        notice={bankBannerText(live.origin, live.companyName)}
      />
    </div>
  );
}
