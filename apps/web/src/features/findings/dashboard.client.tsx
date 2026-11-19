'use client';

import { CalendarClock, ChevronRight, RotateCcw, Send, TriangleAlert, Undo2 } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { type ReactNode, useState } from 'react';
import { FindingCard } from '@/components/brand/finding-card';
import { LawSeal } from '@/components/brand/law-seal';
import { MoneyHero } from '@/components/brand/money-hero';
import { Button } from '@/components/ui/button';
import { keepCurrency } from '@/features/demo/display';
import { formatBRL, formatYearMonth } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { ConfirmCard } from './confirm';
import {
  type DashboardFinding,
  type DashboardModel,
  formatCivilDate,
  type Holder,
  urgencyText,
} from './model';
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

export function Dashboard({
  persona,
  title,
  holderName,
  base,
  cards,
  financeCard,
}: DashboardProps) {
  const visitor = useVisitorAnswers(persona, cards, base);
  const m = visitor.model;
  const [filter, setFilter] = useState<Filter>('all');
  const show = (f: DashboardFinding) => filter === 'all' || f.holder === filter;
  const href = (ruleId: string) => `/demo/${persona}/achados/${ruleId}` as Route;
  const savings = m.savings.filter(show);
  const recovery = m.recovery.filter(show);
  const alerts = m.alerts.filter(show);

  return (
    <div className="flex flex-col gap-8" data-testid="dashboard" data-custom={visitor.custom}>
      <header className="flex flex-col gap-1.5">
        <p className="type-small text-muted-foreground">Painel · {title}</p>
        <h1 className="font-serif text-[36px] leading-[40px] font-normal tracking-[-0.01em] text-foreground lg:text-[44px] lg:leading-[48px]">
          Você pode pagar a menos
        </h1>
      </header>

      {visitor.custom ? (
        <CustomBanner persona={persona} status={visitor.status} onRetry={visitor.retry} />
      ) : null}
      {visitor.open > 0 ? (
        <Link
          href={`/demo/${persona}/confirmar` as Route}
          data-testid="pending-banner"
          className="type-small flex items-center justify-between gap-3 rounded-lg border border-warning bg-warning-soft px-4 py-3 text-foreground"
        >
          {visitor.open === 1
            ? '1 resposta ficou em aberto. Responda para virar "confirmado".'
            : `${visitor.open} respostas ficaram em aberto. Responda para virar "confirmado".`}
          <ChevronRight className="size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
        </Link>
      ) : null}

      <section
        aria-label="Total"
        className={cn(
          'flex flex-col gap-4 transition-opacity duration-(--dur-base)',
          visitor.status === 'loading' && 'opacity-60',
        )}
      >
        <MoneyHero
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
        <ul className="flex snap-x gap-3 overflow-x-auto pb-1 lg:grid lg:grid-cols-3 lg:overflow-visible">
          <MiniCard label="PJ · na empresa" testId="dashboard/pj">
            <span className="type-money-md num text-foreground" data-cents={m.byHolder.PJ}>
              {formatBRL(m.byHolder.PJ)}
            </span>
            <span className="type-small text-muted-foreground"> em 12 meses</span>
          </MiniCard>
          <MiniCard label="PF · na sua pessoa" testId="dashboard/pf">
            <span className="type-money-md num text-foreground" data-cents={m.byHolder.PF}>
              {formatBRL(m.byHolder.PF)}
            </span>
            <span className="type-small text-muted-foreground"> em 12 meses</span>
          </MiniCard>
          {m.recoveryRange ? (
            <MiniCard label="Recuperar (5 anos) · estimativa" testId="dashboard/recovery" chart>
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
                          {f.regimeFrom
                            ? ` a partir de ${formatYearMonth(f.regimeFrom)}`
                            : ' em regime'}
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
                <p className="type-small font-medium text-muted-foreground">
                  ↺ Para recuperar · estimativa · não entra no total
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
              <p className="type-small text-muted-foreground">
                {keepCurrency(f.engineTitle)}
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
                {f.cents > 0 ? (
                  <>
                    {' · custo de caixa '}
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
              <p className="text-base text-foreground">{keepCurrency(f.engineTitle)}</p>
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
        {financeCard}
        {visitor.custom ? (
          <p className="type-caption text-muted-foreground" data-testid="finance-default-note">
            Finanças mostram as respostas padrão da {holderName}.
          </p>
        ) : null}
      </section>

      <div className="fixed inset-x-0 bottom-14 z-30 border-t border-border bg-background/95 px-4 py-2 backdrop-blur sm:hidden print:hidden">
        <Link
          href={`/demo/${persona}/relatorio` as Route}
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

/** Where the total comes from: one segment per counted finding, its width = its share (flex-grow by cents). */
function Composition({ savings }: { savings: DashboardFinding[] }) {
  const parts = savings.filter((f) => f.countsInTotal && f.cents > 0);
  if (parts.length === 0) return null;
  return (
    <div className="flex flex-col gap-2" data-testid="composition">
      <div
        className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-surface-2"
        aria-hidden="true"
      >
        {parts.map((f, i) => (
          <span
            key={f.ruleId}
            className={cn(
              'h-full',
              f.confidence === 'confirmed'
                ? i % 2 === 0
                  ? 'bg-found-chart'
                  : 'bg-chart-3'
                : 'hatch',
            )}
            style={{ flexGrow: f.cents, flexBasis: 0 }}
          />
        ))}
      </div>
      <ul className="type-caption flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
        {parts.map((f, i) => (
          <li key={f.ruleId} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={cn(
                'inline-block size-2.5 rounded-[3px]',
                i % 2 === 0 ? 'bg-found-chart' : 'bg-chart-3',
              )}
            />
            {f.title}: <span className="num text-foreground">{formatBRL(f.cents)}</span>
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
