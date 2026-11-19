import type { ReactNode } from 'react';
import { LiveShell, PLAN_LABEL } from '@/features/live/live-shell';
import { LiveUnavailable } from '@/features/track/live-unavailable';
import { shellPage } from '@/server/analysis/page.ts';

// Screens 5–8 and 5b in /app (ARCHITECTURE §13): only the session that owns the analysis; the shell lock sends an
// unfinished track to its step and an unfinished run to Screen 4.

export default async function LiveAnalysisShell({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const page = await shellPage(id);
  if (page.kind === 'off') return <LiveUnavailable message={page.message} />;
  return (
    <LiveShell
      base={`/app/analises/${id}`}
      companyName={page.live.companyName}
      planLabel={PLAN_LABEL[page.live.plan] ?? page.live.plan}
    >
      {children}
    </LiveShell>
  );
}
