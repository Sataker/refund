import { findingOf } from '@refund/db';
import type { Finding } from '@refund/engine';
import { ArrowLeft, Lock, TriangleAlert } from 'lucide-react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setFindingMark } from '@/app/(live)/app/analises/actions';
import { CalcTrace } from '@/components/brand/calc-trace';
import { ConfidenceBadge } from '@/components/brand/confidence-badge';
import { MoneyHero } from '@/components/brand/money-hero';
import { lawExcerpt, refIdsOf } from '@/demo/snapshot.ts';
import { displayTitle, keepCurrency, RISK_LINE } from '@/features/demo/display';
import { ActionPlan, formatWhen } from '@/features/findings/action-plan';
import { type Excerpt, RefSheet } from '@/features/findings/ref-sheet';
import { MarkFindingButton } from '@/features/live/buttons.client';
import { LiveUnavailable } from '@/features/track/live-unavailable';
import { formatBRL, formatYearMonth } from '@/lib/format';
import { cn } from '@/lib/utils';
import { shellPage } from '@/server/analysis/page.ts';
import { serializedFinding } from '@/server/analysis/read.ts';

// Screen 6 + 6b in /app (ARCHITECTURE §13 `/app/analises/[id]/achados/[achadoId]`). The value, the action plan, the
// law and "não faça" are free; the calculation goes through serializeFinding (§8.3): when it is locked the trace is
// null on the server and never reaches the page (A7). The pró-labore simulator stays in /demo (it needs the facts and
// the curve, which only `interactive` plans may receive; not built in /app yet).

export const metadata: Metadata = { title: 'Achado · Refund', robots: { index: false } };

function excerptsOf(f: Finding): Record<string, Excerpt> {
  const out: Record<string, Excerpt> = {};
  for (const id of refIdsOf(f)) {
    const e = lawExcerpt(id);
    if (e) out[id] = e;
  }
  return out;
}

export default async function LiveFindingPage({
  params,
}: {
  params: Promise<{ id: string; achadoId: string }>;
}) {
  const { id, achadoId } = await params;
  const page = await shellPage(id);
  if (page.kind === 'off') return <LiveUnavailable message={page.message} />;
  const { live } = page;
  const row = live.rows.find((r) => r.id === achadoId);
  if (!row) notFound();
  const f = findingOf(row);
  const dto = serializedFinding(live, row);
  const excerpts = excerptsOf(f);
  const title = displayTitle(f.ruleId, f.title);
  const mainRefs = f.refs.map((r) => excerpts[r.id]).filter((e): e is Excerpt => e !== undefined);
  const planFinding = {
    ruleId: f.ruleId,
    type: f.type,
    actionPlan: dto.actionPlan,
    howToReceive: dto.howToReceive,
    ...(dto.recoveryItems === undefined ? {} : { recoveryItems: dto.recoveryItems }),
  };

  return (
    <article className="flex flex-col gap-8" data-testid={`detail-${f.ruleId}`}>
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/app/analises/${id}/painel#achados` as Route}
            className="type-small inline-flex min-h-10 items-center gap-1.5 font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" strokeWidth={1.5} aria-hidden="true" />
            Achados
          </Link>
          {f.type === 'savings' || f.type === 'recovery' ? (
            <ConfidenceBadge level={f.confidence} />
          ) : (
            <span className="type-caption inline-flex items-center gap-1.5 text-muted-foreground">
              <TriangleAlert
                className={cn('size-3.5', f.type === 'risk' ? 'text-risk' : 'text-warning')}
                strokeWidth={1.5}
                aria-hidden="true"
              />
              {f.type === 'risk' ? 'Risco' : 'Alerta'} · fora do total
            </span>
          )}
        </div>
        <h1 className="font-serif text-[32px] leading-[36px] font-normal tracking-[-0.01em] text-foreground lg:text-[44px] lg:leading-[48px]">
          {title}
        </h1>
        {f.type === 'savings' ? (
          <MoneyHero
            cents={f.marginalValue12m}
            size="lg"
            testId="detail/money"
            srLabel="Economia nos próximos 12 meses"
            subline={
              <span className="flex flex-col gap-0.5">
                <span>nos próximos 12 meses</span>
                {f.annualRegimeValue !== undefined ? (
                  <span
                    className="num"
                    data-testid="detail/regime"
                    data-cents={f.annualRegimeValue}
                  >
                    e {formatBRL(f.annualRegimeValue)} por ano
                    {f.regimeFrom ? ` a partir de ${formatYearMonth(f.regimeFrom)}` : ' em regime'}
                  </span>
                ) : null}
              </span>
            }
          />
        ) : f.type === 'recovery' && f.range ? (
          <p
            className="type-money-lg num text-foreground"
            data-testid="detail/range"
            data-cents-min={f.range[0]}
            data-cents-max={f.range[1]}
          >
            {formatBRL(f.range[0])} a {formatBRL(f.range[1])}
          </p>
        ) : f.marginalValue12m > 0 ? (
          <p
            className="type-money-lg num text-foreground"
            data-testid="detail/cost"
            data-cents={f.marginalValue12m}
          >
            {formatBRL(f.marginalValue12m)}
          </p>
        ) : null}
        {title !== f.title ? (
          <p className="type-body-lg max-w-[68ch] text-foreground">{keepCurrency(f.title)}</p>
        ) : null}
        {f.type === 'risk' ? (
          <p className="type-small font-medium text-risk" data-testid="risk-line">
            {RISK_LINE}
          </p>
        ) : null}
        {dto.explanation !== f.title ? (
          <p
            className="max-w-[68ch] text-base text-muted-foreground"
            data-testid="detail/explanation"
          >
            {keepCurrency(dto.explanation)}
          </p>
        ) : null}
      </header>

      <ActionPlan
        finding={planFinding}
        excerpts={excerpts}
        analysisDate={live.analysisDate}
        {...(f.type === 'savings' ? { collapseAfter: 3 } : {})}
      />
      {dto.recoveryItemsTotal !== undefined && dto.recoveryItemsTotal > 1 ? (
        <p className="type-small text-muted-foreground" data-testid="recovery-summary">
          Mostramos o período com o prazo mais curto. Os outros {dto.recoveryItemsTotal - 1}, DAS a
          DAS com os lembretes de prazo, ficam no plano Empresa.
        </p>
      ) : null}

      <section aria-label="Cálculo" className="flex flex-col gap-2">
        {dto.trace === null ? (
          <div
            className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-5"
            data-testid="trace-locked"
          >
            <p className="type-small inline-flex items-center gap-1.5 font-medium text-foreground">
              <Lock className="size-4" strokeWidth={1.5} aria-hidden="true" />
              Cálculo completo no plano Empresa
            </p>
            <p className="type-small text-muted-foreground">
              O valor acima é o mesmo em qualquer plano. No Grátis, o passo a passo da conta
              (entradas, fórmula e artigo) abre só no maior achado. Seu contador vê tudo pelo link
              do relatório.
            </p>
          </div>
        ) : (
          <CalcTrace trace={dto.trace} />
        )}
      </section>

      {mainRefs.length > 0 ? (
        <section aria-labelledby="lei-titulo" className="flex flex-col gap-3" data-testid="law">
          <h2 id="lei-titulo" className="type-h4 text-foreground">
            A lei
          </h2>
          <div className="flex flex-col gap-2">
            {mainRefs.map((e, i) => (
              <RefSheet key={e.id} excerpt={e} open={i === 0} />
            ))}
          </div>
        </section>
      ) : null}

      {f.doNot.length > 0 ? (
        <section
          aria-labelledby="naofaca-titulo"
          className="flex flex-col gap-2 rounded-lg border border-border border-l-4 border-l-risk bg-risk-soft/40 p-5"
          data-testid="do-not"
        >
          <h2
            id="naofaca-titulo"
            className="type-small inline-flex items-center gap-1.5 font-medium text-foreground"
          >
            <TriangleAlert className="size-4 text-risk" strokeWidth={1.5} aria-hidden="true" />
            Não faça
          </h2>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-base text-foreground">
            {f.doNot.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {f.tradeoffs.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="type-small font-medium text-muted-foreground">Contrapartidas</h2>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-base text-foreground">
            {f.tradeoffs.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
        <MarkFindingButton
          mark={setFindingMark.bind(null, row.id)}
          initial={row.status === 'marked'}
        />
        {f.deadline ? (
          <p className="type-small text-muted-foreground">
            Prazo mais próximo: {formatWhen(f.deadline)}
          </p>
        ) : null}
      </div>
    </article>
  );
}
