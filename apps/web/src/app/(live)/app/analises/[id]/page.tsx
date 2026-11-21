import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/brand/logo';
import { SandboxSeal } from '@/components/brand/sandbox-seal';
import { liveSealLabel } from '@/features/live/data-origin';
import { LiveAnalysis } from '@/features/live/live-analysis.client';
import { unlockHref } from '@/features/plans/roi';
import { LiveUnavailable } from '@/features/track/live-unavailable';
import { loadAnswers } from '@/server/analysis/input.ts';
import { livePage } from '@/server/analysis/page.ts';
import { roiOfferTerms } from '@/server/plans/offer.ts';
import { offerShown } from '@/server/plans/roi.ts';

// Screen 4 in /app (ARCHITECTURE §13 `/app/analises/[id]`): the browser opens the SSE; the first connection claims
// and runs the analysis, every other one (reload, second tab) reads the persisted log.

export const metadata: Metadata = { title: 'Análise · Refund', robots: { index: false } };

export default async function LiveAnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const page = await livePage(id);
  if (page.kind === 'off') return <LiveUnavailable message={page.message} />;
  const { ctx, live } = page;
  const [answers, showOffer] = await Promise.all([
    loadAnswers(ctx.db, ctx.userId, live.analysis.companyId),
    offerShown(ctx.db, ctx.userId),
  ]);
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-[1120px] items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="Refund, página inicial" className="text-xl">
            <Logo />
          </Link>
          <SandboxSeal live label={liveSealLabel(live.origin)} className="hidden sm:inline-flex" />
        </div>
      </header>
      <main
        id="conteudo"
        className="mx-auto w-full min-w-0 max-w-[1120px] flex-1 overflow-x-clip px-4 py-6 sm:px-6 lg:py-10"
      >
        <LiveAnalysis
          analysisId={id}
          companyName={live.companyName}
          answered={answers.map((a) => a.questionId)}
          origin={live.origin}
          offer={
            showOffer ? { terms: roiOfferTerms(), href: unlockHref(`/app/analises/${id}`) } : null
          }
        />
      </main>
    </div>
  );
}
