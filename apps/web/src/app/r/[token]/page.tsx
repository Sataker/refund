import { findingOf, markReportOpened } from '@refund/db';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Disclaimer } from '@/components/brand/disclaimer';
import { Logo } from '@/components/brand/logo';
import { SandboxSeal } from '@/components/brand/sandbox-seal';
import { lawExcerpt } from '@/demo/snapshot.ts';
import { displayTitle, findingText } from '@/features/demo/display';
import { Report } from '@/features/findings/report';
import { alertCostLabel } from '@/features/findings/text';
import { AccountantDecision, type ReviewItem } from '@/features/live/accountant-decision.client';
import {
  bankBannerText,
  exampleFor,
  exampleText,
  isExampleBank,
  liveSealLabel,
} from '@/features/live/data-origin';
import { OriginBanner } from '@/features/live/origin-banner';
import { formatBrtDate } from '@/lib/date';
import { formatBRL } from '@/lib/format';
import { type LiveAnalysis, loadLiveAnalysis, reportResult } from '@/server/analysis/read.ts';
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

/**
 * The rows the accountant reviews (bug bash 20/11): the same as the /demo accountant view, each with the engine's
 * amount and the § of its first LegalRef; savings and recovery first, alerts and risks read-only.
 */
function reviewItems(live: LiveAnalysis): ReviewItem[] {
  const example = isExampleBank(live.origin);
  const rank = (t: string) => (t === 'savings' ? 0 : t === 'recovery' ? 1 : 2);
  return live.rows
    .map((r) => ({ id: r.id, f: findingOf(r) }))
    .sort(
      (a, b) =>
        rank(a.f.type) - rank(b.f.type) ||
        b.f.marginalValue12m - a.f.marginalValue12m ||
        a.f.order - b.f.order,
    )
    .flatMap(({ id, f }): ReviewItem[] => {
      const ref = f.refs[0];
      const lawRef = ref ? { lawRef: { label: ref.label, url: ref.url } } : {};
      const title = displayTitle(f.ruleId, f.title);
      if (f.type === 'savings')
        return [
          {
            id,
            title,
            value: `${formatBRL(f.marginalValue12m)} nos próximos 12 meses`,
            ...lawRef,
          },
        ];
      if (f.type === 'recovery')
        return [
          {
            id,
            title,
            value: f.range
              ? `${formatBRL(f.range[0])} a ${formatBRL(f.range[1])} (estimativa, fora do total)`
              : 'fora do total',
            ...lawRef,
          },
        ];
      const text = exampleText(findingText(f), exampleFor(f.ruleId, example));
      return [
        {
          id,
          title: title === f.title ? text : title,
          value:
            f.marginalValue12m > 0
              ? `${alertCostLabel(f.title)}: ${formatBRL(f.marginalValue12m)} · fora do total`
              : title === f.title
                ? 'fora do total'
                : `${text} · fora do total`,
          readOnly: true,
          ...lawRef,
        },
      ];
    });
}

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
            Em cada achado, “Aprovar” registra a sua revisão e “Pedir ajuste” pede uma correção ao
            cliente; no fim, aprove o relatório ou peça ajustes. A aprovação fica registrada no
            relatório do cliente, que vê a sua resposta na hora. Ela não muda o cálculo nem o nível
            de confiança dos achados.
          </p>
          <OriginBanner origin={live.origin} companyName={live.companyName} />
        </header>
        {found.report.message ? (
          <p className="rounded-md border border-border bg-surface p-4 text-base text-foreground print:hidden">
            Mensagem do cliente: {found.report.message}
          </p>
        ) : null}
        <AccountantDecision
          findings={reviewItems(live)}
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
          example={isExampleBank(live.origin)}
          anexo={live.anexo}
        />
        <Disclaimer />
      </main>
    </div>
  );
}
