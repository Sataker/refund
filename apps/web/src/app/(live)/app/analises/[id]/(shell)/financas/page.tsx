import type { Metadata } from 'next';
import { saveFinanceExclusions } from '@/app/(live)/app/analises/actions';
import { FinanceError, FinanceScreen } from '@/features/finance/finance-screen';
import { LiveUnavailable } from '@/features/track/live-unavailable';
import { shellPage } from '@/server/analysis/page.ts';
import { liveFinance } from '@/server/financial-view.ts';

// Screen 5b in /app (ARCHITECTURE §13 `/app/analises/[id]/financas`; E14b task 6): one server component over
// `listAnalysisLedger`, the same FinanceScreen as /demo. Free on every plan (§8.3). "Remover"/"Desfazer" store the
// owner's exclusions for this analysis (D31); the findings and the totals of the analysis never change.

export const metadata: Metadata = { title: 'Finanças · Refund', robots: { index: false } };

export default async function LiveFinancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const page = await shellPage(id);
  if (page.kind === 'off') return <LiveUnavailable message={page.message} />;
  const finance = await liveFinance(page.ctx.db, page.live);
  const base = `/app/analises/${id}`;
  if (!finance.ok) return <FinanceError dashboard={`${base}/painel`} retry={`${base}/financas`} />;
  return <FinanceScreen data={finance.value} persist={saveFinanceExclusions.bind(null, id)} />;
}
