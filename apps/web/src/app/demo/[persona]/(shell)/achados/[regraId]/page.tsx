import type { Finding } from '@refund/engine';
import { ArrowLeft, TriangleAlert } from 'lucide-react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CalcTrace, type TraceSourceRow } from '@/components/brand/calc-trace';
import { ConfidenceBadge } from '@/components/brand/confidence-badge';
import { MoneyHero } from '@/components/brand/money-hero';
import { DEMO_PERSONAS } from '@/demo/catalog.ts';
import {
  type DemoSnapshot,
  demoSnapshot,
  lawExcerpt,
  refIdsOf,
  requireSnapshot,
} from '@/demo/snapshot.ts';
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
import { MarkForAccountant, PlanActions } from '@/features/findings/finding-actions.client';
import { MARGIN_STEPS, marginOf, proLaborePoint, traceSources } from '@/features/findings/model';
import { planAsText } from '@/features/findings/plan-text';
import type { Excerpt } from '@/features/findings/ref-sheet';
import { SimulatorLoader } from '@/features/findings/simulator-loader.client';
import { marginStepValues } from '@/features/findings/simulator-steps';
import { alertCostLabel, formatCivilDate, steadyStateSuffix } from '@/features/findings/text';
import { VisitorNotice } from '@/features/findings/visitor-notice.client';
import { formatBRL, formatYearMonth } from '@/lib/format';
import { cn } from '@/lib/utils';

// Screen 6 + 6b on /demo (ARCHITECTURE §13 `/demo/[persona]/achados/[regraId]`): static per finding of the persona's
// run. The trace, the article, the action plan and the numbers are the engine's and @refund/law's; in the demo
// everything is unlocked (§8.3, visitor = `business`).

export const dynamicParams = false;

export async function generateStaticParams(): Promise<{ persona: string; regraId: string }[]> {
  const out: { persona: string; regraId: string }[] = [];
  for (const p of DEMO_PERSONAS) {
    const s = await demoSnapshot(p.id);
    if (s.ok)
      for (const f of s.value.result.findings) out.push({ persona: p.id, regraId: f.ruleId });
  }
  return out;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ persona: string; regraId: string }>;
}): Promise<Metadata> {
  const { persona, regraId } = await params;
  const s = await demoSnapshot(persona);
  const f = s.ok ? s.value.result.findings.find((x) => x.ruleId === regraId) : undefined;
  return {
    title: f ? `${displayTitle(f.ruleId, f.title)} · demo · Refund` : 'Achado · demo · Refund',
    robots: { index: false },
  };
}

function excerptsOf(f: Finding): Record<string, Excerpt> {
  const out: Record<string, Excerpt> = {};
  for (const id of refIdsOf(f)) {
    const e = lawExcerpt(id);
    if (e) out[id] = e;
  }
  return out;
}

function sourcesOf(f: Finding, snap: DemoSnapshot): Record<string, TraceSourceRow[]> {
  const out: Record<string, TraceSourceRow[]> = {};
  for (const [stepId, ids] of Object.entries(traceSources(f.trace, snap.facts))) {
    out[stepId] = ids
      .map((id) => snap.rows[id])
      .filter((r) => r !== undefined)
      .map((r) => ({ id: r.id, date: r.date, label: r.label, amountCents: r.amountCents }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
  return out;
}

function Amount({
  f,
  regimeAnchor,
  analysisDate,
}: {
  f: Finding;
  regimeAnchor: string | null;
  analysisDate: string;
}) {
  if (f.type === 'savings')
    return (
      <MoneyHero
        cents={f.marginalValue12m}
        size="lg"
        testId="detail/money"
        srLabel="Economia nos próximos 12 meses"
        subline={
          <span className="flex flex-col gap-0.5">
            <span>nos próximos 12 meses</span>
            {f.annualRegimeValue !== undefined ? (
              <span className="num" data-testid="detail/regime" data-cents={f.annualRegimeValue}>
                e {formatBRL(f.annualRegimeValue)} por ano
                {steadyStateSuffix(f.regimeFrom, regimeAnchor, formatYearMonth)}
              </span>
            ) : null}
          </span>
        }
      />
    );
  if (f.type === 'recovery' && f.range)
    return (
      <div className="flex flex-col gap-1">
        <p
          className="type-money-lg num text-foreground"
          data-testid="detail/range"
          data-cents-min={f.range[0]}
          data-cents-max={f.range[1]}
        >
          {formatBRL(f.range[0])} a {formatBRL(f.range[1])}
        </p>
        <p className="type-small text-muted-foreground">
          estimativa · pagos a mais nos últimos 5 anos, na data da análise (
          {formatCivilDate(analysisDate)}) · não entra no total
        </p>
      </div>
    );
  if (f.marginalValue12m > 0)
    return (
      <div className="flex flex-col gap-1">
        <p
          className="type-money-lg num text-foreground"
          data-testid="detail/cost"
          data-cents={f.marginalValue12m}
        >
          {formatBRL(f.marginalValue12m)}
        </p>
        <p className="type-small text-muted-foreground">
          {alertCostLabel(f.title)} · fora do total
        </p>
      </div>
    );
  return null;
}

export default async function DemoFindingPage({
  params,
}: {
  params: Promise<{ persona: string; regraId: string }>;
}) {
  const { persona, regraId } = await params;
  const snap = await requireSnapshot(persona);
  const f = snap?.result.findings.find((x) => x.ruleId === regraId);
  if (!snap || !f) notFound();
  const excerpts = excerptsOf(f);
  const sources = sourcesOf(f, snap);
  const title = displayTitle(f.ruleId, f.title);
  const point = f.ruleId === 'R01' ? proLaborePoint(snap.result) : null;
  const explanation = snap.explanations[f.ruleId];
  const mainRefs = f.refs.map((r) => excerpts[r.id]).filter((e): e is Excerpt => e !== undefined);

  return (
    <article className="flex flex-col gap-6 lg:gap-8" data-testid={`detail-${f.ruleId}`}>
      <VisitorNotice
        persona={persona}
        holderName={snap.view.holderName}
        cards={snap.cards}
        base={snap.dashboard}
        ruleId={f.ruleId}
      >
        <header className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href={`/demo/${persona}/painel#achados` as Route}
              className="inline-flex min-h-11 items-center gap-1.5 text-base font-medium text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-5" strokeWidth={1.5} aria-hidden="true" />
              Achados
            </Link>
            {f.type === 'savings' || f.type === 'recovery' ? (
              <ConfidenceBadge level={f.confidence} size="md" />
            ) : (
              <span className="type-small inline-flex items-center gap-1.5 font-medium text-muted-foreground">
                <TriangleAlert
                  className={cn('size-4', f.type === 'risk' ? 'text-risk' : 'text-warning')}
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                {f.type === 'risk' ? 'Risco' : 'Alerta'} · fora do total
                <ConfidenceBadge level={f.confidence} size="md" />
              </span>
            )}
          </div>
          <DetailCard testId="detail-summary" className="gap-5">
            <h1 className="font-serif text-[32px] leading-[36px] font-normal tracking-[-0.01em] text-foreground lg:text-[44px] lg:leading-[48px]">
              {title}
            </h1>
            <Amount
              f={f}
              regimeAnchor={snap.dashboard.regimeFrom}
              analysisDate={snap.facts.analysisDate}
            />
            {title !== f.title ? (
              <p className={cn(DETAIL_TEXT, 'font-medium')}>{keepCurrency(findingText(f))}</p>
            ) : null}
            {f.type === 'risk' && !explanation ? (
              <p className="text-base font-medium text-risk" data-testid="risk-line">
                {RISK_LINE}
              </p>
            ) : null}
            {explanation ? (
              <p className={DETAIL_TEXT} data-testid="detail/explanation">
                {keepCurrency(explanation)}
              </p>
            ) : null}
          </DetailCard>
        </header>

        {/* UX review H1: on R01 the simulator comes right under the summary, then the plan, then the calculation. */}
        {point && snap.result.optimizerCurve && MARGIN_STEPS.includes(marginOf(snap.facts)) ? (
          <SimulatorLoader
            facts={snap.facts}
            defaultMargin={marginOf(snap.facts)}
            base={point}
            baseCurve={snap.result.optimizerDisplayCurve ?? snap.result.optimizerCurve}
            {...(snap.result.optimizerCurve[0]
              ? { candidatesFrom: snap.result.optimizerCurve[0].monthlyProLabore }
              : {})}
            steps={marginStepValues(snap.facts)}
          />
        ) : null}

        <ActionPlan
          finding={f}
          excerpts={excerpts}
          analysisDate={snap.facts.analysisDate}
          {...(f.type === 'savings' ? { collapseAfter: 3 } : {})}
          actions={
            f.actionPlan.length > 0 ? (
              <PlanActions
                persona={persona}
                ruleId={f.ruleId}
                text={planAsText(title, f.actionPlan, (id) => excerpts[id]?.label)}
              />
            ) : null
          }
        />

        <DetailSection id="calculo-titulo" title="O cálculo">
          <CalcTrace
            trace={f.trace}
            sources={sources}
            comfortable
            {...(f.type === 'risk' ? { noMoneyText: 'sem valor de economia' } : {})}
          />
        </DetailSection>

        <LawSection refs={mainRefs} />
        <DoNotSection items={f.doNot} />
        <NotesSections tradeoffs={f.tradeoffs} assumptions={f.assumptionsUsed} />

        <div className="flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          <MarkForAccountant persona={persona} ruleId={f.ruleId} />
          {f.deadline ? (
            <p className="text-base text-muted-foreground">
              Prazo mais próximo: {formatWhen(f.deadline)}
            </p>
          ) : null}
        </div>
      </VisitorNotice>
    </article>
  );
}
