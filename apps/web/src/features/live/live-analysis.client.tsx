'use client';

import { ArrowRight, Check, CircleAlert, RotateCcw, TriangleAlert } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { FindingCard } from '@/components/brand/finding-card';
import { MoneyCounter } from '@/components/brand/money-counter.client';
import { Button } from '@/components/ui/button';
import {
  type AnalysisView,
  INITIAL_VIEW,
  progressPercent,
  reduceAnalysis,
} from '@/features/demo/analysis-state';
import { keepCurrency, shortTitle } from '@/features/demo/display';
import { formatBRL, formatYearMonth } from '@/lib/format';
import { cn } from '@/lib/utils';

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

/** D36: "Responda N perguntas para confirmar até R$ X" (N and X from the run). */
export function confirmLabel(n: number, cents: number): string {
  const what = n === 1 ? 'Responda 1 pergunta' : `Responda ${n} perguntas`;
  return cents > 0 ? `${what} para confirmar até ${formatBRL(cents)}` : `${what} para confirmar`;
}

const STAGES: { key: keyof AnalysisView['stages']; label: string }[] = [
  { key: 'reading', label: 'Lendo as transações' },
  { key: 'separating', label: 'Separando empresa e pessoa' },
  { key: 'rules', label: 'Aplicando as regras' },
];

export function LiveAnalysis({
  analysisId,
  companyName,
}: {
  analysisId: string;
  companyName: string;
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

  const finished = view.status === 'done';
  const fatal = view.errors.find((e) => !e.recoverable);
  const savings = view.cards.filter((c) => c.kind === 'finding' && c.finding.type === 'savings');
  const recovery = view.cards.filter((c) => c.finding.type === 'recovery');
  const alerts = view.cards.filter((c) => c.kind === 'alert');
  const pct = progressPercent(view);
  const confirmFirst = view.endStatus === 'awaiting_confirmation' && questions.length > 0;
  // "até R$ X": what is still not confirmed in the engine's total (estimated + depends on regulation).
  const pendingCents =
    (view.total?.byConfidence.estimated ?? 0) +
    (view.total?.byConfidence.depends_on_regulation ?? 0);

  return (
    <div className="flex flex-col gap-6" data-testid="analysis" data-status={view.status}>
      <h1 className="type-h3 text-foreground">
        {finished ? 'Análise de' : 'Analisando'} {companyName}
      </h1>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:gap-10">
        <section aria-label="Etapas" className="order-2 flex flex-col gap-4 lg:order-1">
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
                  ) : (
                    <span
                      aria-hidden="true"
                      className={cn(
                        'inline-block size-2.5 rounded-full',
                        st === 'active' ? 'bg-cobalt' : 'bg-surface-3',
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
              className="block h-full bg-foreground transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          {view.sample.length > 0 ? (
            <ul
              className="type-caption flex flex-col gap-1 text-muted-foreground"
              aria-label="Algumas transações lidas"
            >
              {view.sample.map((t) => (
                <li
                  key={`${t.date}-${t.description}-${t.amountCents}`}
                  className="flex justify-between gap-3"
                >
                  <span className="truncate">
                    {t.holder} · {t.description}
                  </span>
                  <span className="num">{formatBRL(t.amountCents)}</span>
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
              {finished ? 'Encontramos' : 'Encontrado até agora'}
            </p>
            <MoneyCounter
              cents={view.target}
              testId="analysis/money-hero"
              settled={finished}
              srLabel="Encontramos"
              className="mt-2"
              subline="nos próximos 12 meses · seu contador valida"
            />
            {finished ? (
              // D36 (19/11): with open cards, Confirmar comes first (the cards are already ordered by effect, D23)
              // and the dashboard after; the big number above stays the run's own counter.
              <div className="mt-4 flex flex-wrap items-center gap-3">
                {confirmFirst ? (
                  <Link
                    href={`${base}/confirmar` as Route}
                    data-testid="open-confirm"
                    data-count={questions.length}
                    data-cents={pendingCents}
                    className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-5 font-medium text-primary-foreground"
                  >
                    {confirmLabel(questions.length, pendingCents)}
                    <ArrowRight className="size-4" strokeWidth={1.5} aria-hidden="true" />
                  </Link>
                ) : null}
                <Link
                  href={`${base}/painel` as Route}
                  data-testid="open-dashboard"
                  className={
                    confirmFirst
                      ? 'type-small inline-flex min-h-11 items-center font-medium text-cobalt underline-offset-4 hover:underline'
                      : 'inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-5 font-medium text-primary-foreground'
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
              <p className="type-small text-foreground">{fatal.message}</p>
            </div>
          ) : null}
          {lost && !finished && !fatal ? (
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
                <span className="type-small text-foreground">
                  {f.type === 'risk' ? 'Risco' : 'Alerta'} · fora do total · {keepCurrency(f.title)}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
