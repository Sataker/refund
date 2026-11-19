'use client';

import { CalendarClock, ChevronRight, RotateCcw, Send, TriangleAlert, Undo2 } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { type ReactNode, useState } from 'react';
import { ConfidenceBadge, confidenceLabel } from '@/components/brand/confidence-badge';
import { FindingCard } from '@/components/brand/finding-card';
import { LawSeal } from '@/components/brand/law-seal';
import { MoneyHero } from '@/components/brand/money-hero';
import { Button } from '@/components/ui/button';
import { keepCurrency, RISK_LINE } from '@/features/demo/display';
import { formatBRL, formatYearMonth } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { ConfirmCard } from './confirm';
import type { DashboardFinding, DashboardModel, Holder } from './model';
import {
  alertCostLabel,
  formatCivilDate,
  personalPaymentsText,
  steadyStateSuffix,
  urgencyText,
} from './text';
import { useVisitorAnswers } from './visitor.client';

// Screen 5, the dashboard (IDENTITY-AND-UI §5; ENGINE-SPEC C.9). The big number is ONLY the confirmed savings of the
// next 12 months; the steady state is a secondary line; recovery is its own block and never summed; alerts and risks
// sit apart. Every amount is the engine's (`DashboardModel`); the browser only picks the model of the visitor's answers.

type Filter = 'all' | Holder;

interface DashboardProps {
  persona: string;
  title: string;
  holderName: string;
  base: DashboardModel;
  cards: ConfirmCard[];
  /** Screen 5b entry card (server-rendered, from the persona's default answers). */
  financeCard: ReactNode;
}

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'PJ', label: 'PJ' },
  { id: 'PF', label: 'PF' },
];

/** /demo: the persona's model, swapped for the visitor's own Screen 7 answers when they differ. */
export function Dashboard({
  persona,
  title,
  holderName,
  base,
  cards,
  financeCard,
}: DashboardProps) {
  const visitor = useVisitorAnswers(persona, cards, base);
  const hrefs = Object.fromEntries(
    [...visitor.model.savings, ...visitor.model.recovery, ...visitor.model.alerts].map((f) => [
      f.ruleId,
      `/demo/${persona}/achados/${f.ruleId}`,
    ]),
  );
  return (
    <DashboardView
      title={title}
      model={visitor.model}
      hrefs={hrefs}
      links={{ confirm: `/demo/${persona}/confirmar`, report: `/demo/${persona}/relatorio` }}
      open={visitor.open}
      loading={visitor.status === 'loading'}
      custom={visitor.custom}
      banner={
        visitor.custom ? (
          <CustomBanner persona={persona} status={visitor.status} onRetry={visitor.retry} />
        ) : null
      }
      finance={
        <>
          {financeCard}
          {visitor.custom ? (
            <p className="type-caption text-muted-foreground" data-testid="finance-default-note">
              Finanças mostram as respostas padrão da {holderName}.
            </p>
          ) : null}
        </>
      }
    />
  );
}

interface DashboardViewProps {
  title: string;
  model: DashboardModel;
  /** ruleId → the finding's detail page (/demo by rule id, /app by finding id). */
  hrefs: Record<string, string>;
  links: { confirm: string; report: string };
  /** Cards still open ("Não sei"). */
  open: number;
  loading?: boolean;
  custom?: boolean;
  banner?: ReactNode;
  finance: ReactNode;
  /** Shown under the title (e.g. "Nova análise" in /app). */
  actions?: ReactNode;
}

/** Screen 5 itself, shared by /demo and /app: every amount comes in `model` (the engine's). */
export function DashboardView({
  title,
  model: m,
  hrefs,
  links,
  open,
  loading = false,
  custom = false,
  banner,
  finance,
  actions,
}: DashboardViewProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const show = (f: DashboardFinding) => filter === 'all' || f.holder === filter;
  const href = (ruleId: string) => (hrefs[ruleId] ?? links.confirm) as Route;
  const savings = m.savings.filter(show);
  const recovery = m.recovery.filter(show);
  const alerts = m.alerts.filter(show);

  return (
    <div className="flex flex-col gap-8" data-testid="dashboard" data-custom={custom}>
      <header className="flex flex-col gap-1.5">
        <p className="type-small text-muted-foreground">Painel · {title}</p>
        <h1 className="font-serif text-[36px] leading-[40px] font-normal tracking-[-0.01em] text-foreground lg:text-[44px] lg:leading-[48px]">
          Você pode pagar a menos, dentro da lei
        </h1>
        {actions}
      </header>

      {banner}
      {open > 0 ? (
        <Link
          href={links.confirm as Route}
          data-testid="pending-banner"
          className="type-small flex items-center justify-between gap-3 rounded-lg border border-warning bg-warning-soft px-4 py-3 text-foreground"
        >
          {open === 1
            ? '1 resposta ficou em aberto. Responda para virar "confirmado".'
            : `${open} respostas ficaram em aberto. Responda para virar "confirmado".`}
          <ChevronRight className="size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
        </Link>
      ) : null}

      <section
        aria-label="Total"
        className={cn(
          'flex flex-col gap-4 transition-opacity duration-(--dur-base)',
          loading && 'opacity-60',
        )}
      >
        <MoneyHero
          className="pl-3"
          key={m.total}
          cents={m.total}
          testId="dashboard/money-hero"
          srLabel="Você pode pagar a menos nos próximos 12 meses"
          live
          subline={
            <span className="flex flex-col gap-1">
              <span>
                nos próximos 12 meses · só o que está{' '}
                <span className="font-medium text-foreground">confirmado</span>
              </span>
              {m.annual !== null && m.annual > 0 ? (
                <span data-testid="dashboard/regime-total" data-cents={m.annual} className="num">
                  e {formatBRL(m.annual)} por ano
                  {m.regimeFrom ? ` a partir de ${formatYearMonth(m.regimeFrom)}` : ''}
                </span>
              ) : m.annualPending ? (
                <span data-testid="dashboard/regime-pending">
                  Valor por ano aparece quando tudo estiver confirmado.
                </span>
              ) : null}
              {m.estimated > 0 ? (
                <span data-testid="dashboard/estimated" data-cents={m.estimated} className="num">
                  + até {formatBRL(m.estimated)} ainda estimado (fora do número grande)
                </span>
              ) : null}
            </span>
          }
        />
        <Composition savings={m.savings} />
      </section>

      <section aria-label="Resumo por pessoa" className="-mx-4 px-4 lg:mx-0 lg:px-0">
        <section
          className="snap-x overflow-x-auto pb-1 lg:overflow-visible"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be reachable by keyboard (axe scrollable-region-focusable)
          tabIndex={0}
          aria-label="Resumo: empresa, pessoa física e recuperação"
        >
          <ul className="flex gap-3 lg:grid lg:grid-cols-3">
            <MiniCard label="PJ · na empresa" testId="dashboard/pj">
              <span className="type-money-md num text-foreground" data-cents={m.byHolder.PJ}>
                {formatBRL(m.byHolder.PJ)}
              </span>
              <span className="type-small text-muted-foreground"> em 12 meses</span>
              {m.savings.some((f) => f.ruleId === 'R01' && f.holder === 'PJ' && f.countsInTotal) ? (
                <span className="type-caption block text-muted-foreground" data-testid="pj-note">
                  Já desconta o INSS maior do seu pró-labore
                </span>
              ) : null}
            </MiniCard>
            <MiniCard label="PF · na sua pessoa" testId="dashboard/pf">
              {m.byHolder.PF === 0 ? (
                <>
                  <span className="block text-base font-medium text-foreground" data-cents={0}>
                    Nada a ajustar na pessoa física
                  </span>
                  <span className="type-caption block text-muted-foreground">
                    pelas regras que checamos.
                  </span>
                </>
              ) : (
                <>
                  <span className="type-money-md num text-foreground" data-cents={m.byHolder.PF}>
                    {formatBRL(m.byHolder.PF)}
                  </span>
                  <span className="type-small text-muted-foreground"> em 12 meses</span>
                </>
              )}
            </MiniCard>
            {m.recoveryRange ? (
              <MiniCard
                label={`Recuperar (5 anos)${m.recovery[0] ? ` · ${confidenceLabel(m.recovery[0].confidence)}` : ''}`}
                testId="dashboard/recovery"
                chart
              >
                <span className="type-small num text-foreground">
                  <span data-testid="dashboard/recovery-min" data-cents={m.recoveryRange[0]}>
                    {formatBRL(m.recoveryRange[0])}
                  </span>{' '}
                  a{' '}
                  <span data-testid="dashboard/recovery-max" data-cents={m.recoveryRange[1]}>
                    {formatBRL(m.recoveryRange[1])}
                  </span>
                </span>
                <span className="type-caption block text-muted-foreground">não entra no total</span>
              </MiniCard>
            ) : null}
          </ul>
        </section>
      </section>

      <section aria-labelledby="achados-titulo" className="flex flex-col gap-4" id="achados">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="achados-titulo" className="type-h4 text-foreground">
            Achados
          </h2>
          <div className="flex items-center gap-3">
            <fieldset
              aria-label="Filtrar por pessoa"
              className="inline-flex rounded-md border border-border bg-surface p-0.5"
            >
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={filter === f.id}
                  data-testid={`filter-${f.id.toLowerCase()}`}
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    'type-small min-h-9 min-w-12 rounded-[5px] px-3 font-medium transition-colors duration-(--dur-fast)',
                    filter === f.id
                      ? 'bg-foreground text-background'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {f.label}
                </button>
              ))}
            </fieldset>
            <span className="type-caption hidden text-muted-foreground sm:inline">
              Ordenado por maior R$
            </span>
          </div>
        </div>

        {savings.length === 0 ? (
          <p
            className="type-small rounded-lg border border-border bg-surface p-5 text-muted-foreground"
            data-testid="dashboard-empty"
          >
            {filter === 'PF'
              ? 'Nenhum achado com valor na pessoa física com estes dados.'
              : 'Nenhuma economia confirmada com estas respostas. Veja Confirmar para revisar.'}
          </p>
        ) : (
          <ol className="flex flex-col gap-3" data-testid="savings-list">
            {savings.map((f) => (
              <li key={f.ruleId} data-rule={f.ruleId}>
                <FindingCard
                  testId={`finding-${f.ruleId}`}
                  title={f.title}
                  cents={f.cents}
                  confidence={f.confidence}
                  lawRef={f.ref ?? { label: 'Ver cálculo', url: href(f.ruleId) }}
                  footnote={
                    <span className="flex flex-col gap-0.5">
                      {f.annualRegimeValue !== null ? (
                        <span className="num">
                          {formatBRL(f.annualRegimeValue)} por ano
                          {steadyStateSuffix(f.regimeFrom, m.regimeFrom, formatYearMonth)}
                        </span>
                      ) : null}
                      {f.firstEffect ? (
                        <span>
                          Primeiro efeito: DAS do período de {formatYearMonth(f.firstEffect)}
                        </span>
                      ) : null}
                    </span>
                  }
                  action={
                    <Link
                      href={href(f.ruleId)}
                      data-testid={`open-${f.ruleId}`}
                      className="underline-offset-4 hover:underline"
                    >
                      Ver cálculo e como aplicar
                    </Link>
                  }
                />
              </li>
            ))}
          </ol>
        )}
      </section>

      {recovery.length > 0 ? (
        <section aria-label="Para recuperar, fora do total" className="flex flex-col gap-3">
          {recovery.map((f) => (
            <article
              key={f.ruleId}
              data-testid={`recovery-${f.ruleId}`}
              className="flex flex-col gap-3 rounded-lg border border-border border-l-4 border-l-chart-5 bg-surface p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="type-small inline-flex flex-wrap items-center gap-x-2 font-medium text-muted-foreground">
                  ↺ Para recuperar · não entra no total
                  <ConfidenceBadge level={f.confidence} />
                </p>
                {m.urgency ? (
                  <span
                    data-testid="deadline-seal"
                    className="type-caption inline-flex items-center gap-1 rounded-sm bg-warning-soft px-1.5 py-0.5 text-warning"
                  >
                    <CalendarClock className="size-3" strokeWidth={1.5} aria-hidden="true" />
                    prazo acabando · {urgencyText(m.urgency)}
                  </span>
                ) : null}
              </div>
              {f.range ? (
                <p className="type-money-md num text-foreground">
                  {formatBRL(f.range[0])} a {formatBRL(f.range[1])}
                </p>
              ) : null}
              <p className="type-small text-muted-foreground" data-testid="recovery-sentence">
                Pagos a mais nos últimos 5 anos (
                {f.confidence === 'estimated' ? 'estimativa' : confidenceLabel(f.confidence)}; o
                contador confirma).
                {m.urgency
                  ? ` Prazo contado na data da análise (${formatCivilDate(m.analysisDate)}).`
                  : ''}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                {f.ref ? <LawSeal lawRef={f.ref} /> : null}
                <Link
                  href={href(f.ruleId)}
                  data-testid={`open-${f.ruleId}`}
                  className="type-small inline-flex min-h-10 items-center gap-1 font-medium text-cobalt underline-offset-4 hover:underline"
                >
                  Como receber
                  <ChevronRight className="size-4" strokeWidth={1.5} aria-hidden="true" />
                </Link>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {alerts.length > 0 ? (
        <section
          aria-labelledby="riscos-titulo"
          className="flex flex-col gap-3"
          data-testid="alerts"
        >
          <h2 id="riscos-titulo" className="type-h4 text-foreground">
            Riscos e alertas · fora do total
          </h2>
          {alerts.map((f) => (
            <article
              key={f.ruleId}
              data-testid={`alert-${f.ruleId}`}
              className={cn(
                'flex flex-col gap-2 rounded-lg border border-border border-l-4 bg-surface p-5',
                f.type === 'risk' ? 'border-l-risk' : 'border-l-warning',
              )}
            >
              <p className="type-small inline-flex items-center gap-1.5 font-medium text-muted-foreground">
                <TriangleAlert
                  className={cn('size-4', f.type === 'risk' ? 'text-risk' : 'text-warning')}
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                {f.type === 'risk' ? 'Risco' : 'Alerta'}
                <ConfidenceBadge level={f.confidence} />
                {f.cents > 0 ? (
                  <>
                    {` · ${alertCostLabel(f.engineTitle)}: `}
                    <span
                      className="num text-foreground"
                      data-testid={`dashboard/alert-${f.ruleId}-cost`}
                      data-cents={f.cents}
                    >
                      {formatBRL(f.cents)}
                    </span>
                  </>
                ) : null}
              </p>
              <p className="text-base font-medium text-foreground">{keepCurrency(f.title)}</p>
              {f.title !== f.engineTitle ? (
                <p className="type-small text-muted-foreground">{keepCurrency(f.engineTitle)}</p>
              ) : null}
              {f.personalSpend ? (
                <p className="type-small num text-foreground" data-testid="personal-spend">
                  {personalPaymentsText(f.personalSpend.count)} ·{' '}
                  <span data-cents={f.personalSpend.total}>{formatBRL(f.personalSpend.total)}</span>{' '}
                  em 12 meses
                </p>
              ) : null}
              {f.type === 'risk' ? (
                <p className="type-small font-medium text-risk" data-testid="risk-line">
                  {RISK_LINE}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-3">
                {f.ref ? <LawSeal lawRef={f.ref} /> : null}
                <Link
                  href={href(f.ruleId)}
                  className="type-small inline-flex min-h-10 items-center gap-1 font-medium text-cobalt underline-offset-4 hover:underline"
                >
                  O que fazer
                  <ChevronRight className="size-4" strokeWidth={1.5} aria-hidden="true" />
                </Link>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      <section aria-label="Finanças" className="flex flex-col gap-2">
        {finance}
      </section>

      <div className="fixed inset-x-0 bottom-14 z-30 border-t border-border bg-background/95 px-4 py-2 backdrop-blur sm:hidden print:hidden">
        <Link
          href={links.report as Route}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-primary font-medium text-primary-foreground"
        >
          <Send className="size-4" strokeWidth={1.5} aria-hidden="true" />
          Mandar para meu contador
        </Link>
      </div>
    </div>
  );
}

function MiniCard({
  label,
  testId,
  chart = false,
  children,
}: {
  label: string;
  testId: string;
  chart?: boolean;
  children: ReactNode;
}) {
  return (
    <li
      data-testid={testId}
      className={cn(
        'flex min-w-[240px] snap-start flex-col gap-1.5 rounded-lg border border-border bg-surface p-4 lg:min-w-0',
        chart && 'border-t-4 border-t-chart-5',
      )}
    >
      <span className="type-small text-muted-foreground">{label}</span>
      <span>{children}</span>
    </li>
  );
}

/**
 * Where the total comes from: one segment per confirmed finding in the total, its width = its share (flex-grow by
 * cents). Estimated savings sit apart, hatched, and are not part of the number (engine review M1).
 */
function Composition({ savings }: { savings: DashboardFinding[] }) {
  const parts = savings.filter(
    (f) => f.countsInTotal && f.cents > 0 && f.confidence === 'confirmed',
  );
  const estimated = savings.filter((f) => f.cents > 0 && f.confidence !== 'confirmed');
  if (parts.length === 0 && estimated.length === 0) return null;
  const color = (i: number) => (i % 2 === 0 ? 'bg-found-chart' : 'bg-chart-3');
  return (
    <div className="flex flex-col gap-2" data-testid="composition">
      {parts.length > 0 ? (
        <div
          className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-surface-2"
          aria-hidden="true"
        >
          {parts.map((f, i) => (
            <span
              key={f.ruleId}
              className={cn('h-full', color(i))}
              style={{ flexGrow: f.cents, flexBasis: 0 }}
            />
          ))}
        </div>
      ) : null}
      <ul className="type-caption flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
        {parts.map((f, i) => (
          <li key={f.ruleId} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={cn('inline-block size-2.5 rounded-[3px]', color(i))}
            />
            {f.title}: <span className="num text-foreground">{formatBRL(f.cents)}</span>
          </li>
        ))}
        {estimated.map((f) => (
          <li
            key={f.ruleId}
            className="inline-flex items-center gap-1.5"
            data-testid={`composition-estimated-${f.ruleId}`}
          >
            <span
              aria-hidden="true"
              className="hatch inline-block size-2.5 rounded-[3px] border border-current text-conf-estimated"
            />
            {f.title}: <span className="num text-foreground">{formatBRL(f.cents)}</span> (estimado,
            fora do número)
          </li>
        ))}
      </ul>
    </div>
  );
}

function CustomBanner({
  persona,
  status,
  onRetry,
}: {
  persona: string;
  status: 'idle' | 'loading' | 'error';
  onRetry: () => void;
}) {
  return (
    <div
      role="status"
      data-testid="custom-answers"
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="type-small text-foreground">
        {status === 'error'
          ? 'Não conseguimos recalcular com as suas respostas. Os números abaixo são os da persona.'
          : status === 'loading'
            ? 'Recalculando com as suas respostas…'
            : 'Números recalculados com as suas respostas em Confirmar.'}
      </p>
      <span className="flex items-center gap-3">
        {status === 'error' ? (
          <Button type="button" variant="outline" onClick={onRetry}>
            <RotateCcw className="size-4" strokeWidth={1.5} aria-hidden="true" />
            Tentar de novo
          </Button>
        ) : null}
        <Link
          href={`/demo/${persona}/confirmar` as Route}
          className="type-small inline-flex items-center gap-1 font-medium text-cobalt underline-offset-4 hover:underline"
        >
          <Undo2 className="size-4" strokeWidth={1.5} aria-hidden="true" />
          Revisar respostas
        </Link>
      </span>
    </div>
  );
}
