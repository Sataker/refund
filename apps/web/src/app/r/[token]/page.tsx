import { markReportOpened } from '@refund/db';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Disclaimer } from '@/components/brand/disclaimer';
import { Logo } from '@/components/brand/logo';
import { SandboxSeal } from '@/components/brand/sandbox-seal';
import { lawExcerpt } from '@/demo/snapshot.ts';
import { displayTitle } from '@/features/demo/display';
import { Report } from '@/features/findings/report';
import { AccountantDecision } from '@/features/live/accountant-decision.client';
import { bankBannerText, liveSealLabel } from '@/features/live/data-origin';
import { OriginBanner } from '@/features/live/origin-banner';
import { formatBrtDate } from '@/lib/date';
import { loadLiveAnalysis, reportResult } from '@/server/analysis/read.ts';
import { getDb } from '@/server/db.ts';
import { reportByToken } from '@/server/report/report.ts';
import { decideReportFor } from './actions';

// `/r/[token]` (ARCHITECTURE §13, Screen 8): the accountant's view, public and authenticated only by the token (its
// sha256 is what we store). Always the full report, for free (§8.2: the channel loop). Never indexed, never cached.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Relatório para aprovação · Refund',
  robots: { index: false, follow: false },
};

function Gone() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[560px] flex-col justify-center gap-4 px-4">
      <Logo />
      <h1 className="type-h2 text-foreground">Este link expirou ou não existe.</h1>
      <p className="text-base text-muted-foreground">
        Peça ao seu cliente um link novo. Cada link vale 30 dias.
      </p>
    </main>
  );
}

export default async function AccountantReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const handle = await getDb().catch(() => null);
  if (!handle) return <Gone />;
  const found = await reportByToken(handle.db, token);
  if (!found) return <Gone />;
  const live = await loadLiveAnalysis(handle.db, found.userId, found.report.analysisId);
  if (!live) return <Gone />;
  await markReportOpened(handle.db, found.report.id);
  const result = reportResult(live, true);
  const labels = new Map<string, string>();
  for (const f of result.findings)
    for (const ref of f.actionPlan.flatMap((s) => s.refIds)) {
      const e = lawExcerpt(ref);
      if (e) labels.set(ref, e.label);
    }
  const decided = found.report.decision === 'pending' ? null : found.report.decision;
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border bg-surface print:hidden">
        <div className="mx-auto flex h-14 max-w-[960px] items-center justify-between px-4">
          <Link href="/" aria-label="Refund, página inicial" className="text-xl">
            <Logo />
          </Link>
          <span className="type-caption text-muted-foreground">Relatório para o contador</span>
        </div>
      </header>
      <main
        id="conteudo"
        className="mx-auto flex max-w-[960px] flex-col gap-6 px-4 py-8"
        data-testid="accountant-page"
      >
        <header className="flex flex-col gap-2 print:hidden">
          <h1 className="type-h3 text-foreground" data-testid="accountant-title">
            {live.companyName} pediu sua revisão · {formatBrtDate(found.report.createdAt)}
          </h1>
          <SandboxSeal
            live
            label={liveSealLabel(live.origin)}
            className="self-start whitespace-normal"
          />
          <p className="type-small text-muted-foreground" data-testid="accountant-howto">
            Em cada achado, “Aprovo” confirma a conta e “Ajustar” pede uma correção ao cliente; no
            fim, aprove o relatório ou peça ajustes. O cliente vê a sua resposta na hora.
          </p>
          <OriginBanner origin={live.origin} companyName={live.companyName} />
        </header>
        {found.report.message ? (
          <p className="rounded-md border border-border bg-surface p-4 text-base text-foreground print:hidden">
            Mensagem do cliente: {found.report.message}
          </p>
        ) : null}
        <AccountantDecision
          findings={live.rows.map((r) => ({ id: r.id, title: displayTitle(r.ruleId, r.title) }))}
          decide={decideReportFor.bind(null, token)}
          decided={decided}
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
        <Disclaimer />
      </main>
    </div>
  );
}
