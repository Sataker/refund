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
import { displayTitle, findingText, keepCurrency, RISK_LINE } from '@/features/demo/display';
import { ActionPlan, formatWhen } from '@/features/findings/action-plan';
import {
  DETAIL_TEXT,
  DetailCard,
  DetailSection,
  DoNotSection,
  LawSection,
  NotesSections,
} from '@/features/findings/detail-sections';
import type { Excerpt } from '@/features/findings/ref-sheet';
import { steadyStateSuffix } from '@/features/findings/text';
import { MarkFindingButton } from '@/features/live/buttons.client';
import { exampleFor, exampleText, isExampleBank } from '@/features/live/data-origin';
import { unlockHref } from '@/features/plans/roi';
import { RoiOffer } from '@/features/plans/roi-offer';
import { LiveUnavailable } from '@/features/track/live-unavailable';
import { formatBRL, formatYearMonth } from '@/lib/format';
import { cn } from '@/lib/utils';
import { shellPage } from '@/server/analysis/page.ts';
import { serializedFinding } from '@/server/analysis/read.ts';
import { roiOfferTerms } from '@/server/plans/offer.ts';

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
  const example = isExampleBank(live.origin);
  const alertish = f.type === 'alert' || f.type === 'risk';
  const mainRefs = f.refs.map((r) => excerpts[r.id]).filter((e): e is Excerpt => e !== undefined);
  const planFinding = {
    ruleId: f.ruleId,
    type: f.type,
    actionPlan: dto.actionPlan,
    howToReceive: dto.howToReceive,
    ...(dto.recoveryItems === undefined ? {} : { recoveryItems: dto.recoveryItems }),
  };

  return (
    <article className="flex flex-col gap-6 lg:gap-8" data-testid={`detail-${f.ruleId}`}>
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/app/analises/${id}/painel#achados` as Route}
            className="inline-flex min-h-11 items-center gap-1.5 text-base font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-5" strokeWidth={1.5} aria-hidden="true" />
            Achados
          </Link>
          {f.type === 'savings' || f.type === 'recovery' ? (
            <ConfidenceBadge level={f.confidence} example={example} size="md" />
          ) : (
            <span className="type-small inline-flex items-center gap-1.5 font-medium text-muted-foreground">
              <TriangleAlert
                className={cn('size-4', f.type === 'risk' ? 'text-risk' : 'text-warning')}
                strokeWidth={1.5}
                aria-hidden="true"
              />
              {f.type === 'risk' ? 'Risco' : 'Alerta'} · fora do total
            </span>
          )}
        </div>
        <DetailCard testId="detail-summary" className="gap-5">
          <h1 className="font-serif text-[32px] leading-[36px] font-normal tracking-[-0.01em] text-foreground lg:text-[44px] lg:leading-[48px]">
            {title === f.title && alertish
              ? exampleText(title, exampleFor(f.ruleId, example))
              : title}
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
                      {steadyStateSuffix(f.regimeFrom, null, formatYearMonth)}
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
            <p className={cn(DETAIL_TEXT, 'font-medium')}>
              {keepCurrency(exampleText(findingText(f), exampleFor(f.ruleId, example) && alertish))}
            </p>
          ) : null}
          {f.type === 'risk' && dto.explanation === f.title ? (
            <p className="text-base font-medium text-risk" data-testid="risk-line">
              {RISK_LINE}
            </p>
          ) : null}
          {dto.explanation !== f.title ? (
            <p className={DETAIL_TEXT} data-testid="detail/explanation">
              {keepCurrency(dto.explanation)}
            </p>
          ) : null}
        </DetailCard>
      </header>

      <ActionPlan
        finding={planFinding}
        excerpts={excerpts}
        analysisDate={live.analysisDate}
        {...(f.type === 'savings' ? { collapseAfter: 3 } : {})}
      />
      {dto.recoveryItemsTotal !== undefined && dto.recoveryItemsTotal > 1 ? (
        <p className="text-base text-muted-foreground" data-testid="recovery-summary">
          Mostramos o período com o prazo mais curto. Os outros {dto.recoveryItemsTotal - 1}, DAS a
          DAS com os lembretes de prazo, ficam no plano Empresa.
        </p>
      ) : null}

      <DetailSection id="calculo-titulo" title="O cálculo">
        {dto.trace === null ? (
          <div className="flex flex-col gap-3" data-testid="trace-locked">
            <p className="inline-flex items-center gap-1.5 text-base font-medium text-foreground">
              <Lock className="size-4" strokeWidth={1.5} aria-hidden="true" />
              Cálculo completo no plano Empresa
            </p>
            <p className={cn(DETAIL_TEXT, 'text-muted-foreground')}>
              O valor acima é o mesmo em qualquer plano. No Grátis, o passo a passo da conta
              (entradas, fórmula e artigo) abre só no maior achado. Seu contador vê tudo pelo link
              do relatório.
            </p>
            {/* D58: the same offer as the estimate and the dashboard, over the confirmed total. A locked trace means
                the free plan (any paid plan opens them all), so no plan lookup is needed here. */}
            <RoiOffer
              variant="confirmed"
              savingsCents={live.dashboard.total}
              terms={roiOfferTerms()}
              href={unlockHref(`/app/analises/${id}/achados/${achadoId}`)}
              example={example}
              startsLater={live.dashboard.savings.some((s) => s.regimeFrom !== null)}
              secondary={
                <Link
                  href={
                    `/app/plano?voltar=${encodeURIComponent(`/app/analises/${id}/achados/${achadoId}`)}` as Route
                  }
                  data-testid="trace-locked-upgrade"
                  className="inline-flex min-h-14 w-fit items-center text-base font-medium text-cobalt underline-offset-4 hover:underline"
                >
                  Ver todos os planos →
                </Link>
              }
            />
          </div>
        ) : (
          <CalcTrace
            trace={dto.trace}
            comfortable
            {...(f.type === 'risk' ? { noMoneyText: 'sem valor de economia' } : {})}
          />
        )}
      </DetailSection>

      <LawSection refs={mainRefs} />
      <DoNotSection items={f.doNot} />
      <NotesSections tradeoffs={f.tradeoffs} />

      <div className="flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
        <MarkFindingButton
          mark={setFindingMark.bind(null, row.id)}
          initial={row.status === 'marked'}
        />
        {f.deadline ? (
          <p className="text-base text-muted-foreground">
            Prazo mais próximo: {formatWhen(f.deadline)}
          </p>
        ) : null}
      </div>
    </article>
  );
}
