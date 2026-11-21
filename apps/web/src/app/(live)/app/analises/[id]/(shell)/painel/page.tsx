import type { Metadata } from 'next';
import { reanalyze } from '@/app/(live)/app/analises/actions';
import { FinanceEntryCard } from '@/features/finance/entry';
import { DashboardView } from '@/features/findings/dashboard.client';
import { confirmProgress } from '@/features/findings/progress';
import { StartAnalysisButton } from '@/features/live/buttons.client';
import { exampleTitle } from '@/features/live/data-origin';
import { unlockHref } from '@/features/plans/roi';
import { LiveUnavailable } from '@/features/track/live-unavailable';
import { questionsOf } from '@/server/analysis/actions.ts';
import { loadAnswers } from '@/server/analysis/input.ts';
import { shellPage } from '@/server/analysis/page.ts';
import { ruleHrefs } from '@/server/analysis/read.ts';
import { liveFinance } from '@/server/financial-view.ts';
import { roiOfferTerms } from '@/server/plans/offer.ts';
import { offerShown } from '@/server/plans/roi.ts';

// Screen 5 in /app (ARCHITECTURE §13 `/app/analises/[id]/painel`): the same DashboardView as /demo over the stored
// engine result. Values are free on every plan (§8.3); the calculation behind them is not sent from here.

export const metadata: Metadata = { title: 'Painel · Refund', robots: { index: false } };

export default async function LiveDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const page = await shellPage(id);
  if (page.kind === 'off') return <LiveUnavailable message={page.message} />;
  const { ctx, live } = page;
  const [questions, answers, finance, showOffer] = await Promise.all([
    questionsOf(ctx.db, id),
    loadAnswers(ctx.db, ctx.userId, live.analysis.companyId),
    liveFinance(ctx.db, live),
    offerShown(ctx.db, ctx.userId),
  ]);
  // The same count Screen 4's CTA shows (H2: one source of truth).
  const { open } = confirmProgress(
    live.total,
    questions.map((q) => q.id),
    answers.map((a) => a.questionId),
  );
  const base = `/app/analises/${id}`;
  const heading = exampleTitle(live.origin, live.companyName);
  return (
    <DashboardView
      title={live.companyName}
      model={live.dashboard}
      hrefs={ruleHrefs(live)}
      links={{ confirm: `${base}/confirmar`, report: `${base}/relatorio` }}
      open={open}
      example={heading === null ? null : { heading }}
      zeroState
      offer={showOffer ? { terms: roiOfferTerms(), href: unlockHref(`${base}/painel`) } : null}
      actions={
        <StartAnalysisButton
          start={reanalyze.bind(null, { analysisId: id })}
          label="Refazer a análise"
          testId="reanalyze"
          variant="outline"
        />
      }
      finance={
        finance.ok ? <FinanceEntryCard view={finance.value.view} href={`${base}/financas`} /> : null
      }
    />
  );
}
