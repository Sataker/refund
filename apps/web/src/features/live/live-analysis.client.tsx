'use client';

import { ArrowRight, Check, CircleAlert, RotateCcw, TriangleAlert } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { ConfidenceBadge } from '@/components/brand/confidence-badge';
import { FindingCard } from '@/components/brand/finding-card';
import { MoneyCounter } from '@/components/brand/money-counter.client';
import { Button } from '@/components/ui/button';
import {
  type AnalysisView,
  INITIAL_VIEW,
  progressPercent,
  reduceAnalysis,
} from '@/features/demo/analysis-state';
import { findingText, keepCurrency, sampleDescription, shortTitle } from '@/features/demo/display';
import { confirmCta, confirmProgress, estimatedLine } from '@/features/findings/progress';
import { formatBRL, formatYearMonth } from '@/lib/format';
import { cn } from '@/lib/utils';
import { type DataOrigin, exampleText, exampleTitle, isExampleBank } from './data-origin';
import { OriginBanner } from './origin-banner';

// Screen 4 in /app (IDENTITY-AND-UI §5 Screen 4; ARCHITECTURE §4.6): the same reducer as /demo over the persisted log.
// The tab remembers the last event it rendered (sessionStorage); after a reload the server sends those at once and the
// rest at the analysis pace, so the cards are never duplicated and nothing is recomputed (A4).

const EVENT_TYPES = [
  'start',
  'stage',
  'transaction_sample',
  'classification_summary',
  'question',
  'facts_summary',
  'finding',
  'alert',
  'total',
  'explanation',
  'end',
  'error',
] as const;

type Action = { event: Parameters<typeof reduceAnalysis>[1]; seq: number };

function reducer(v: AnalysisView, a: Action): AnalysisView {
  return reduceAnalysis(v, a.event, a.seq);
}

const seenKey = (id: string) => `refund:analise:${id}:seq`;

function readSeen(id: string): number {
  try {
    const n = Number(window.sessionStorage.getItem(seenKey(id)) ?? 0);
    return Number.isSafeInteger(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeSeen(id: string, seq: number): void {
  try {
    window.sessionStorage.setItem(seenKey(id), String(seq));
  } catch {
    // No storage: a reload replays at the analysis pace, still without duplicates.
  }
}

const STAGES: { key: keyof AnalysisView['stages']; label: string }[] = [
  { key: 'reading', label: 'Lendo as transações' },
  { key: 'separating', label: 'Separando empresa e pessoa' },
  { key: 'rules', label: 'Aplicando as regras' },
];

/** Fatal errors whose reason is the company itself (no retry helps): the way out is another CNPJ or the demo. */
const COMPANY_ERRORS = new Set(['REGIME_OUT_OF_SCOPE', 'CNAE_OUT_OF_SCOPE']);

export function LiveAnalysis({
  analysisId,
  companyName,
  answered,
  origin,
}: {
  analysisId: string;
  companyName: string;
  /** Card ids already answered for this company (the same count the dashboard shows; H2). */
  answered: readonly string[];
  origin: DataOrigin;
}) {
  const [view, dispatch] = useReducer(reducer, INITIAL_VIEW);
  const [lost, setLost] = useState(false);
  /** Card ids the run asked (D36: the end button counts them). */
  const [questions, setQuestions] = useState<readonly string[]>([]);
  const source = useRef<EventSource | null>(null);
  const done = useRef(false);
  const base = `/app/analises/${analysisId}`;

  const connect = useCallback(() => {
    source.current?.close();
    const from = readSeen(analysisId);
    const es = new EventSource(`/api/analises/${analysisId}/eventos?from=${from}`);
    source.current = es;
    for (const type of EVENT_TYPES) {
      es.addEventListener(type, (e) => {
        const seq = Number((e as MessageEvent).lastEventId) || 0;
        let event: Action['event'];
        try {
          event = JSON.parse((e as MessageEvent<string>).data);
        } catch {
          return;
        }
        dispatch({ event, seq });
        if (event.type === 'question') {
          const id = event.question.id;
          setQuestions((q) => (q.includes(id) ? q : [...q, id]));
        }
        if (seq > readSeen(analysisId)) writeSeen(analysisId, seq);
        if (
          type === 'end' ||
          (type === 'error' && !(event as { recoverable?: boolean }).recoverable)
        ) {
          done.current = true;
          es.close();
        }
      });
    }
    es.onerror = () => {
      if (done.current) return;
      // EventSource retries by itself with Last-Event-ID; the banner only says so.
      setLost(true);
    };
    es.onopen = () => setLost(false);
  }, [analysisId]);

  useEffect(() => {
    connect();
    return () => source.current?.close();
  }, [connect]);

  const fatal = view.errors.find((e) => !e.recoverable);
  // A fatal error is a final status too (H3): the spinner stops, the title says so, there is a way back.
  const failed = fatal !== undefined && view.status !== 'done';
  const finished = view.status === 'done';
  const savings = view.cards.filter((c) => c.kind === 'finding' && c.finding.type === 'savings');
  const recovery = view.cards.filter((c) => c.finding.type === 'recovery');
  const alerts = view.cards.filter((c) => c.kind === 'alert');
  const pct = progressPercent(view);
  // H2: confirmed (the big number), estimated (the line under it) and N open, from one place.
  const progress = confirmProgress(view.total, questions, answered);
  const confirmFirst = view.endStatus === 'awaiting_confirmation' && progress.open > 0;
  const second = finished ? estimatedLine(progress) : null;
  // Bug bash 20/11 C1: example statements never read as the company's own confirmed numbers.
  const example = isExampleBank(origin);
  const exampleHeading = exampleTitle(origin, companyName);
  // C2: a run that ends with nothing confirmed says so; the estimate (or the demo) leads.
  const zero =
    finished && view.target === 0
      ? progress.estimated > 0 || recovery.length > 0
        ? 'estimated'
        : 'nothing'
      : null;

  return (
    <div
      className="flex min-w-0 flex-col gap-6"
      data-testid="analysis"
      data-status={failed ? 'error' : view.status}
    >
      <OriginBanner origin={origin} companyName={companyName} />
      <h1 className="type-h3 break-words text-foreground" data-testid="analysis-heading">
        {failed
          ? `Não conseguimos analisar ${companyName}`
          : (exampleHeading ?? `${finished ? 'Análise de' : 'Analisando'} ${companyName}`)}
      </h1>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:gap-10">
        <section aria-label="Etapas" className="order-2 flex min-w-0 flex-col gap-4 lg:order-1">
          <ol className="flex flex-col gap-3">
            {STAGES.map((s) => {
              const st = view.stages[s.key];
              return (
                <li
                  key={s.key}
                  data-testid={`stage-${s.key}`}
                  data-status={st}
                  className={cn(
                    'type-small flex items-center gap-2',
                    st === 'todo' ? 'text-muted-foreground' : 'text-foreground',
                  )}
                >
                  {st === 'done' ? (
                    <Check className="size-4 text-success" aria-hidden="true" />
                  ) : failed && st === 'active' ? (
                    <CircleAlert className="size-4 text-risk" aria-hidden="true" />
                  ) : (
                    <span
                      aria-hidden="true"
                      className={cn(
                        'inline-block size-2.5 rounded-full',
                        st === 'active' && !failed ? 'bg-cobalt' : 'bg-surface-3',
                      )}
                    />
                  )}
                  {s.label}
                  {s.key === 'reading' && view.transactionsRead !== null
                    ? ` · ${view.transactionsRead} transações`
                    : ''}
                </li>
              );
            })}
          </ol>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-surface-2"
            role="progressbar"
            aria-label="Progresso da análise"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span
              className={cn('block h-full transition-all', failed ? 'bg-risk' : 'bg-foreground')}
              style={{ width: `${pct}%` }}
            />
          </div>
          {view.sample.length > 0 && example ? (
            <p
              className="type-caption inline-flex w-fit items-center rounded-sm bg-warning-soft px-1.5 py-0.5 font-medium text-foreground"
              data-testid="ticker-example-label"
            >
              Extrato de exemplo
            </p>
          ) : null}
          {view.sample.length > 0 ? (
            <ul
              className="type-caption flex min-w-0 flex-col gap-1 text-muted-foreground"
              aria-label="Algumas transações lidas"
              data-testid="analysis-ticker"
            >
              {view.sample.map((t) => (
                <li
                  key={`${t.date}-${t.description}-${t.amountCents}`}
                  className="flex min-w-0 justify-between gap-3"
                >
                  <span className="min-w-0 truncate">
                    {t.holder} · {sampleDescription(t.description, t.amountCents)}
                  </span>
                  <span className="num shrink-0">{formatBRL(t.amountCents)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section
          aria-label={finished ? 'Encontramos' : 'Encontrado até agora'}
          className="order-1 flex min-w-0 flex-col gap-4 lg:order-2"
        >
          <div className="rounded-xl border border-border bg-surface p-6">
            <p className="type-overline text-muted-foreground" data-testid="found-label">
              {example
                ? 'Exemplo · extrato de exemplo'
                : finished
                  ? 'Confirmado'
                  : failed
                    ? 'Confirmado até aqui'
                    : 'Confirmado até agora'}
            </p>
            {zero !== null ? (
              <div className="mt-2 flex flex-col gap-2" data-testid="zero-lead" data-kind={zero}>
                <p className="type-h3 text-foreground" data-testid="zero-headline">
                  {zero === 'nothing'
                    ? 'Com estes dados, não encontramos economia.'
                    : 'Ainda não há economia confirmada'}
                </p>
                {zero === 'estimated' && progress.estimated > 0 ? (
                  <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span
                      className="type-money-lg num text-foreground"
                      data-testid="analysis/estimated"
                      data-cents={progress.estimated}
                      data-open={progress.open}
                    >
                      {formatBRL(progress.estimated)}
                    </span>
                    <ConfidenceBadge level="estimated" />
                  </p>
                ) : null}
                {zero === 'nothing' ? (
                  <Link
                    href="/demo"
                    data-testid="nothing-found-demo"
                    className="type-small w-fit font-medium text-cobalt underline underline-offset-4"
                  >
                    Veja a demonstração com a Marina
                  </Link>
                ) : null}
                <p className="type-small num text-muted-foreground">
                  Confirmado até agora:{' '}
                  <span data-testid="analysis/money-hero" data-cents={0}>
                    {formatBRL(0)}
                  </span>
                </p>
              </div>
            ) : (
              <>
                {/* ENGINE-SPEC C.9: the big number is the confirmed savings only. */}
                <MoneyCounter
                  cents={view.target}
                  testId="analysis/money-hero"
                  settled={finished || failed}
                  srLabel="Confirmado nos próximos 12 meses"
                  className="mt-2"
                  subline={
                    example
                      ? 'nos próximos 12 meses, sobre o extrato de exemplo · seu contador valida'
                      : 'confirmado nos próximos 12 meses · seu contador valida'
                  }
                />
              </>
            )}
            {second && zero === null ? (
              <p
                className="type-small num mt-2 text-muted-foreground"
                data-testid="analysis/estimated"
                data-cents={progress.estimated}
                data-open={progress.open}
              >
                {second}
              </p>
            ) : null}
            {finished ? (
              // D36 (19/11): with open cards, Confirmar comes first (the cards are already ordered by effect, D23)
              // and the dashboard after; the big number above stays the run's own counter.
              <div className="mt-4 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                {confirmFirst ? (
                  <Link
                    href={`${base}/confirmar` as Route}
                    data-testid="open-confirm"
                    data-count={progress.open}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-5 py-2 text-center font-medium text-primary-foreground sm:w-auto"
                  >
                    <span className="min-w-0">{confirmCta(progress.open)}</span>
                    <ArrowRight className="size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                  </Link>
                ) : null}
                <Link
                  href={`${base}/painel` as Route}
                  data-testid="open-dashboard"
                  className={
                    confirmFirst
                      ? 'type-small inline-flex min-h-11 items-center font-medium text-cobalt underline-offset-4 hover:underline'
                      : 'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-5 font-medium text-primary-foreground sm:w-auto'
                  }
                >
                  Ver o painel
                  {confirmFirst ? null : (
                    <ArrowRight className="size-4" strokeWidth={1.5} aria-hidden="true" />
                  )}
                </Link>
              </div>
            ) : null}
          </div>

          {fatal ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-risk bg-risk-soft/40 p-4"
              data-testid="analysis-error"
            >
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-risk" aria-hidden="true" />
              <div className="flex min-w-0 flex-col gap-3">
                <p className="type-small text-foreground" data-code={fatal.code}>
                  {fatal.message}
                </p>
                <div className="flex flex-wrap gap-2">
                  {COMPANY_ERRORS.has(fatal.code) ? (
                    <>
                      <Link
                        href="/demo"
                        data-testid="error-demo"
                        className="type-small inline-flex min-h-10 items-center rounded-md bg-primary px-4 font-medium text-primary-foreground"
                      >
                        Ver a demo com a Marina
                      </Link>
                      <Link
                        href={'/app/comecar/cnpj' as Route}
                        data-testid="error-other-cnpj"
                        className="type-small inline-flex min-h-10 items-center rounded-md border border-border px-4 font-medium text-foreground"
                      >
                        Usar outro CNPJ
                      </Link>
                    </>
                  ) : null}
                  <Link
                    href={'/app' as Route}
                    data-testid="error-home"
                    className="type-small inline-flex min-h-10 items-center rounded-md border border-border px-4 font-medium text-foreground"
                  >
                    Voltar ao início
                  </Link>
                </div>
              </div>
            </div>
          ) : null}
          {lost && !finished && !failed ? (
            <div
              role="status"
              className="flex flex-col gap-3 rounded-lg border border-warning bg-warning-soft p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <p className="type-small text-foreground">
                A conexão caiu. O que já achamos continua aqui; retomamos de onde paramos.
              </p>
              <Button type="button" variant="outline" onClick={connect}>
                <RotateCcw className="size-4" strokeWidth={1.5} aria-hidden="true" />
                Tentar de novo
              </Button>
            </div>
          ) : null}

          <ol className="flex flex-col gap-3" aria-label="Achados" data-testid="analysis-cards">
            {savings.map(({ finding: f }) => (
              <li key={f.id} className="enter" data-testid="analysis-card">
                <FindingCard
                  testId={`finding-${f.ruleId}`}
                  title={shortTitle(f.ruleId, keepCurrency(f.title))}
                  cents={f.marginalValue12m}
                  lawRef={f.refs[0] ?? { label: 'Ver cálculo', url: `${base}/painel` }}
                  {...(f.annualRegimeValue !== undefined && f.regimeFrom !== undefined
                    ? {
                        footnote: (
                          <span className="num">
                            {formatBRL(f.annualRegimeValue)} por ano a partir de{' '}
                            {formatYearMonth(f.regimeFrom)}
                          </span>
                        ),
                      }
                    : {})}
                />
              </li>
            ))}
            {recovery.map(({ finding: f }) => (
              <li
                key={f.id}
                className="enter rounded-lg border border-border bg-surface p-5"
                data-testid="analysis-card"
              >
                <p className="type-small font-medium text-muted-foreground">
                  Para recuperar · não entra no total
                </p>
                {f.range ? (
                  <p
                    className="type-money-md num mt-2 text-foreground"
                    data-cents-min={f.range[0]}
                    data-cents-max={f.range[1]}
                  >
                    {formatBRL(f.range[0])} a {formatBRL(f.range[1])}
                  </p>
                ) : null}
              </li>
            ))}
            {alerts.map(({ finding: f }) => (
              <li
                key={f.id}
                className="enter flex items-start gap-2 rounded-lg border border-border bg-surface p-4"
                data-testid="analysis-card"
              >
                <TriangleAlert
                  className={cn(
                    'mt-0.5 size-4 shrink-0',
                    f.type === 'risk' ? 'text-risk' : 'text-warning',
                  )}
                  aria-hidden="true"
                />
                <span className="type-small text-foreground" data-testid="analysis-alert-text">
                  {f.type === 'risk' ? 'Risco' : 'Alerta'} · fora do total ·{' '}
                  {keepCurrency(exampleText(findingText(f), example))}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
