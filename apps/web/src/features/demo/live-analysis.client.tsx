'use client';

import { ArrowRight, Check, CircleAlert, RotateCcw, Timer, TriangleAlert } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { FindingCard } from '@/components/brand/finding-card';
import { LawSeal, type LawSealRef } from '@/components/brand/law-seal';
import { MoneyCounter } from '@/components/brand/money-counter.client';
import { Button } from '@/components/ui/button';
import { type DemoTrackState, fromQuery, loadTrack } from '@/demo/answers';
import { returnPath, updatePersonaState } from '@/demo/demo-session';
import { TrackFooter, TrackHeader } from '@/features/track/track-frame';
import { formatBRL, formatYearMonth, moneyParts } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  type AnalysisView,
  INITIAL_VIEW,
  progressPercent,
  reduceAnalysis,
  type StageStatus,
} from './analysis-state';
import { RestartDemo } from './demo-track.client';
import { findingText, keepCurrency, sampleDescription, shortTitle } from './display';
import { demoBase, demoProgress } from './progress';
import type { DemoPersonaView } from './types';

// Screen 4, the live analysis (IDENTITY-AND-UI §5 Screen 4 and §4.9 script 1). The pipeline really runs on
// the server (/api/demo/analise) and only the pace is scripted; this screen just plays the events: stages on
// the left, the counter and the cards on the right, and it ends exactly on the engine's total.

export interface StageRule {
  ruleId: string;
  /** Plain-language name for the list ("Fator R e pró-labore"). */
  name: string;
  /** First LegalRef of the rule's metadata (ENGINE-SPEC: never typed by hand). */
  lawRef: LawSealRef | null;
}

interface LiveAnalysisProps {
  persona: DemoPersonaView;
  rules: StageRule[];
  defaults: DemoTrackState;
}

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

const MONTH_NAMES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

/** YearMonth "2027-04" → "abril de 2027". */
function monthInWords(ym: string): string {
  const [y, m] = ym.split('-');
  return `${MONTH_NAMES[Number(m) - 1] ?? ''} de ${y}`;
}

/** "-8.925,00" for the statement column (no "R$", like a bank statement). */
function signedAmount(cents: number): string {
  const p = moneyParts(cents);
  return `${p.negative ? '−' : ''}${p.reais},${p.cents}`;
}

function seconds(ms: number): string {
  return (Math.round(ms / 100) / 10).toLocaleString('pt-BR', { minimumFractionDigits: 1 });
}

function pace(): string {
  const p = new URLSearchParams(window.location.search).get('pace');
  return p === 'instant' || p === 'fast' ? p : 'scripted';
}

type Action = { event: Parameters<typeof reduceAnalysis>[1]; seq: number } | { reset: true };

function reducer(v: AnalysisView, a: Action): AnalysisView {
  return 'reset' in a ? INITIAL_VIEW : reduceAnalysis(v, a.event, a.seq);
}

export function LiveAnalysis({ persona, rules, defaults }: LiveAnalysisProps) {
  const router = useRouter();
  const [view, dispatch] = useReducer(reducer, INITIAL_VIEW);
  const [track, setTrack] = useState<DemoTrackState>(defaults);
  // UX review G2 L7: a deep link that met the track gate is where the track ends.
  const [back, setBack] = useState<string | null>(null);
  useEffect(() => setBack(returnPath(persona.id)), [persona.id]);
  const [lost, setLost] = useState(false);
  const [firstMoneyMs, setFirstMoneyMs] = useState<number | null>(null);
  const openedAt = useRef(0);
  const source = useRef<EventSource | null>(null);
  const lastSeq = useRef(0);
  const done = useRef(false);

  const connect = useCallback(
    (resume: boolean) => {
      source.current?.close();
      const s = fromQuery(window.location.search, loadTrack(persona.id, defaults));
      setTrack(s);
      const params = new URLSearchParams({
        persona: persona.id,
        // §4.6 "Demo": a reconnection replays at the instant pace up to where it was (ids already seen are skipped).
        pace: resume ? 'instant' : pace(),
        accounts: s.pfSkipped ? 'pj' : 'all',
      });
      const es = new EventSource(`/api/demo/analise?${params}`);
      source.current = es;
      for (const type of EVENT_TYPES) {
        es.addEventListener(type, (e) => {
          const seq = Number((e as MessageEvent).lastEventId) || 0;
          if (seq !== 0 && seq <= lastSeq.current) return;
          lastSeq.current = Math.max(lastSeq.current, seq);
          let event: Parameters<typeof reduceAnalysis>[1];
          try {
            event = JSON.parse((e as MessageEvent<string>).data);
          } catch {
            return; // a malformed frame is skipped; the next ones still apply
          }
          dispatch({ event, seq });
          if (type === 'end') {
            done.current = true;
            es.close();
          }
        });
      }
      es.onerror = () => {
        if (done.current) return;
        es.close();
        setLost(true);
      };
      setLost(false);
    },
    [persona.id, defaults],
  );

  useEffect(() => {
    openedAt.current = performance.now();
    connect(false);
    return () => source.current?.close();
  }, [connect]);

  const finished = view.status === 'done';
  useEffect(() => {
    if (finished) updatePersonaState(persona.id, { trackDone: true });
  }, [finished, persona.id]);

  const onFirstMoney = useCallback(() => {
    const ms = performance.now() - openedAt.current;
    setFirstMoneyMs(ms);
    updatePersonaState(persona.id, { firstMoneyMs: Math.round(ms) });
  }, [persona.id]);

  const savings = view.cards.filter((c) => c.kind === 'finding' && c.finding.type === 'savings');
  const recovery = view.cards.filter((c) => c.finding.type === 'recovery');
  const alerts = view.cards.filter((c) => c.kind === 'alert');
  const r01 = savings.find((c) => c.finding.regimeFrom !== undefined)?.finding;
  const total = view.total;
  const empty = finished && (total?.savings12m ?? 0) === 0 && savings.length === 0;
  const pct = progressPercent(view);
  const rulesDone = rules.filter(
    (_rule, i) =>
      view.stages.rules === 'done' || rules.slice(i).some((x) => view.rulesSeen.includes(x.ruleId)),
  ).length;
  const dashboard = (back ?? `${demoBase(persona.id)}/painel`) as Route;
  const progress = demoProgress('analysis', track, persona);
  const transactions =
    persona.accounts.PJ.transactions + (track.pfSkipped ? 0 : persona.accounts.PF.transactions);

  return (
    <div
      className="flex min-h-dvh flex-col overflow-x-clip bg-background"
      data-testid="analysis"
      data-status={view.status}
    >
      <TrackHeader
        step="analysis"
        progress={progress}
        exit={{ href: '/demo', label: 'Sair' }}
        finished={finished}
      />
      <main
        id="conteudo"
        className="mx-auto w-full max-w-[1120px] flex-1 px-4 py-6 sm:px-6 lg:py-10"
      >
        <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h1 className="type-h3 text-foreground">
            {finished ? 'Análise de' : 'Analisando'} {persona.companyName}
            {track.pfSkipped ? '' : ` + ${persona.holderName} (PF)`}
          </h1>
          <p
            className="type-caption num inline-flex items-center gap-1.5 text-muted-foreground"
            data-testid="first-money-timer"
            data-ms={firstMoneyMs === null ? undefined : Math.round(firstMoneyMs)}
            aria-live="off"
          >
            <Timer className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
            {firstMoneyMs === null ? 'calculando' : `primeiro valor em ${seconds(firstMoneyMs)} s`}
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:gap-10">
          {/* Right column first on mobile: the number stays at the top (Screen 4, mobile). */}
          <section
            aria-label={finished ? 'Encontramos' : 'Encontrado até agora'}
            className="order-1 flex min-w-0 flex-col gap-4 lg:order-2"
          >
            <div
              className={cn(
                'z-10 -mx-4 border-b border-border bg-background px-4 pt-2 pb-4 sm:-mx-6 sm:px-6 lg:relative lg:mx-0 lg:rounded-xl lg:border lg:bg-surface lg:p-8 lg:shadow-sm',
                // Mobile: the number stays on top while it climbs, then lets the page scroll.
                finished ? 'relative' : 'sticky top-0',
              )}
            >
              <p className="type-overline text-muted-foreground" data-testid="found-label">
                {finished ? 'Encontramos' : 'Encontrado até agora'}
              </p>
              <div className="relative">
                <MoneyCounter
                  cents={view.target}
                  testId="analysis/money-hero"
                  settled={finished}
                  srLabel="Encontramos"
                  onFirstMoney={onFirstMoney}
                  className="mt-2"
                  subline={
                    finished && total ? (
                      <span className="enter" data-testid="analysis-basis">
                        Com as respostas da {persona.holderName} · seu contador valida
                      </span>
                    ) : (
                      'nos próximos 12 meses'
                    )
                  }
                />
                {finished && view.target > 0 ? <Confetti /> : null}
              </div>
              <StageLine
                view={view}
                rules={rules}
                rulesDone={rulesDone}
                transactions={transactions}
              />
              {finished && total ? (
                <Result
                  total={total}
                  regimeFrom={r01?.regimeFrom ?? null}
                  empty={empty}
                  dashboard={dashboard}
                />
              ) : null}
            </div>

            {view.errors.length > 0 ? <ErrorBanner errors={view.errors} /> : null}
            {lost && !finished ? (
              <div
                role="alert"
                className="flex flex-col gap-3 rounded-lg border border-warning bg-warning-soft p-4 text-foreground sm:flex-row sm:items-center sm:justify-between"
              >
                <p className="type-small">
                  A conexão caiu. O que já achamos continua aqui; retomamos de onde paramos.
                </p>
                <Button type="button" variant="outline" onClick={() => connect(true)}>
                  <RotateCcw className="size-4" strokeWidth={1.5} aria-hidden="true" />
                  Tentar de novo
                </Button>
              </div>
            ) : null}

            <ol className="flex flex-col gap-3" aria-label="Achados">
              {savings.map(({ finding: f }) => (
                <li key={f.id} className="enter">
                  <FindingCard
                    testId={`finding-${f.ruleId}`}
                    title={shortTitle(f.ruleId, keepCurrency(f.title))}
                    cents={f.marginalValue12m}
                    lawRef={f.refs[0] ?? { label: 'Ver cálculo', url: '#' }}
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
              {view.stages.rules === 'active' && !finished ? (
                <li aria-hidden="true">
                  <div className="shimmer h-28 rounded-lg border border-dashed border-border" />
                </li>
              ) : null}
            </ol>

            {recovery.map(({ finding: f }) => (
              <section
                key={f.id}
                className="enter rounded-lg border border-border bg-surface p-5"
                data-testid={`finding-${f.ruleId}`}
                aria-label="Para recuperar, fora do total"
              >
                <p className="type-small font-medium text-muted-foreground">
                  Para recuperar · estimativa · não entra no total
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
                <p className="type-small mt-1 text-muted-foreground">
                  pagos a mais nos últimos 5 anos. O contador confirma.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {f.refs[0] ? <LawSeal lawRef={f.refs[0]} /> : null}
                </div>
              </section>
            ))}

            {alerts.length > 0 ? (
              <section aria-label="Alertas, fora do total" className="flex flex-col gap-3">
                {alerts.map(({ finding: f }) => (
                  <article
                    key={f.id}
                    className={cn(
                      'enter rounded-lg border-l-4 border border-border bg-surface p-5',
                      f.type === 'risk' ? 'border-l-risk' : 'border-l-warning',
                    )}
                    data-testid={`alert-${f.ruleId}`}
                  >
                    <p className="type-small inline-flex items-center gap-1.5 font-medium text-muted-foreground">
                      <TriangleAlert
                        className={cn('size-4', f.type === 'risk' ? 'text-risk' : 'text-warning')}
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                      {f.type === 'risk' ? 'Risco' : 'Alerta'} · não entra no total
                    </p>
                    <p className="type-body-lg mt-2 text-foreground">
                      {keepCurrency(findingText(f))}
                    </p>
                    {f.refs[0] ? <LawSeal lawRef={f.refs[0]} className="mt-3" /> : null}
                  </article>
                ))}
              </section>
            ) : null}
          </section>

          <section aria-label="Etapas da análise" className="hidden min-w-0 lg:order-1 lg:block">
            <Stages
              view={view}
              rules={rules}
              rulesDone={rulesDone}
              transactions={transactions}
              pct={pct}
            />
          </section>
        </div>
      </main>
      <TrackFooter
        footerAction={
          <RestartDemo
            onRestart={() => router.push(`${demoBase(persona.id)}/comecar/cnpj` as Route)}
          />
        }
      />
    </div>
  );
}

function StageMark({ status }: { status: StageStatus }) {
  if (status === 'done')
    return (
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-success text-background">
        <Check className="check-draw size-3" strokeWidth={3} aria-hidden="true" />
      </span>
    );
  return (
    <span
      className={cn(
        'grid size-5 shrink-0 place-items-center rounded-full border-2',
        status === 'active' ? 'spin-ring border-foreground border-t-transparent' : 'border-border',
      )}
      aria-hidden="true"
    />
  );
}

function stageLines(view: AnalysisView, rules: StageRule[], transactions: number) {
  const s = view.stages;
  const count = (view.transactionsRead ?? transactions).toLocaleString('pt-BR');
  return [
    {
      id: 'reading' as const,
      label: s.reading === 'done' ? `${count} transações lidas` : `Lendo ${count} transações`,
    },
    {
      id: 'separating' as const,
      label:
        s.separating === 'done'
          ? 'Empresa e pessoa separadas'
          : 'Separando o que é da empresa e o que é seu',
    },
    {
      id: 'rules' as const,
      label:
        s.rules === 'done'
          ? `${rules.length} regras aplicadas`
          : `Aplicando ${rules.length} regras da lei`,
    },
  ];
}

/** Mobile: the stages become one line that changes ("Aplicando 6 regras · 4/6"), under the number. */
function StageLine({
  view,
  rules,
  rulesDone,
  transactions,
}: {
  view: AnalysisView;
  rules: StageRule[];
  rulesDone: number;
  transactions: number;
}) {
  const lines = stageLines(view, rules, transactions);
  const current = lines.find((l) => view.stages[l.id] === 'active') ?? lines[0];
  const done = view.status === 'done';
  return (
    <p
      className="type-small mt-3 flex items-center gap-2 text-foreground lg:hidden"
      data-testid="stage-line"
    >
      <StageMark status={done ? 'done' : current ? view.stages[current.id] : 'todo'} />
      {done
        ? 'Pronto'
        : current?.id === 'rules'
          ? `${current.label} · ${rulesDone}/${rules.length}`
          : current?.label}
    </p>
  );
}

function Stages({
  view,
  rules,
  rulesDone,
  transactions,
  pct,
}: {
  view: AnalysisView;
  rules: StageRule[];
  rulesDone: number;
  transactions: number;
  pct: number;
}) {
  const s = view.stages;
  const lines = stageLines(view, rules, transactions);
  return (
    <div className="lg:sticky lg:top-6">
      <ol className="flex flex-col gap-5">
        {lines.map((l) => (
          <li key={l.id} data-testid={`stage-${l.id}`} data-status={s[l.id]}>
            <p
              className={cn(
                'type-small flex items-center gap-2.5 font-medium',
                s[l.id] === 'todo' ? 'text-subtle' : 'text-foreground',
              )}
            >
              <StageMark status={s[l.id]} />
              {l.label}
            </p>
            {l.id === 'reading' && view.sample.length > 0 && s.reading !== 'todo' ? (
              <TransactionScroll view={view} />
            ) : null}
            {l.id === 'rules' && s.rules !== 'todo' ? (
              <ul className="mt-3 ml-7 flex flex-col gap-1.5">
                {rules.map((r, i) => {
                  const checked = i < rulesDone;
                  return (
                    <li
                      key={r.ruleId}
                      className="type-small flex items-start gap-2 text-muted-foreground"
                    >
                      {checked ? (
                        <Check
                          className="check-draw mt-[3px] size-3.5 shrink-0 text-success"
                          strokeWidth={2.5}
                          aria-hidden="true"
                        />
                      ) : (
                        <span
                          className="mt-[3px] size-3.5 shrink-0 rounded-full border border-border"
                          aria-hidden="true"
                        />
                      )}
                      <span className="min-w-0">
                        <span className={cn('block', checked && 'text-foreground')}>{r.name}</span>
                        {r.lawRef ? (
                          <span className="block font-mono text-[11px] leading-4 text-subtle">
                            § {r.lawRef.label}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </li>
        ))}
        {view.status === 'done' ? (
          <li className="type-small flex items-center gap-2.5 font-medium text-foreground">
            <StageMark status="done" />
            Pronto
          </li>
        ) : null}
      </ol>
      <div className="mt-6" aria-hidden="true">
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
          <div
            className="h-full origin-left rounded-full bg-foreground transition-transform duration-(--dur-slow) ease-(--ease-out-expo)"
            style={{ transform: `scaleX(${pct / 100})` }}
          />
        </div>
        <p className="type-caption num mt-2 text-muted-foreground">{pct}%</p>
      </div>
    </div>
  );
}

/** Stage 1: the sample lines scroll, masked at the edges, amounts in mono; stage 2 flips PF/PJ chips on. */
function TransactionScroll({ view }: { view: AnalysisView }) {
  const chips = view.stages.separating !== 'todo';
  const rolling = view.stages.reading === 'active';
  const lines = [...view.sample, ...view.sample];
  return (
    <div className="scroll-mask mt-3 ml-7 h-36 overflow-hidden" data-testid="transaction-sample">
      <ul className={cn('flex flex-col gap-1', rolling && 'tx-roll')}>
        {lines.map((t, i) => (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: the sample is shown twice for a seamless loop.
            key={i}
            aria-hidden={i >= view.sample.length}
            className="type-mono flex items-center gap-2 text-[12px] text-muted-foreground"
          >
            <span className="num w-11 shrink-0">
              {t.date.slice(8, 10)}/{t.date.slice(5, 7)}
            </span>
            <span className="min-w-0 flex-1 truncate">
              {sampleDescription(t.description, t.amountCents)}
            </span>
            <span
              className={cn('num shrink-0', t.amountCents > 0 ? 'text-success' : 'text-foreground')}
            >
              {signedAmount(t.amountCents)}
            </span>
            <span
              className={cn(
                'w-7 shrink-0 rounded-sm text-center text-[10px] font-semibold',
                chips ? 'chip-flip' : 'invisible',
                t.holder === 'PJ'
                  ? 'bg-foreground text-background'
                  : 'border border-strong-border text-foreground',
              )}
            >
              {t.holder}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ErrorBanner({ errors }: { errors: AnalysisView['errors'] }) {
  const last = errors.at(-1);
  if (!last) return null;
  return (
    <div
      role="alert"
      className="flex gap-3 rounded-lg border border-warning bg-warning-soft p-4"
      data-testid="analysis-error"
    >
      <CircleAlert
        className="mt-0.5 size-5 shrink-0 text-warning"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <p className="type-small text-foreground">
        {last.recoverable
          ? `${last.message} Mostramos o que já achamos e seguimos com as outras regras.`
          : last.message}
      </p>
    </div>
  );
}

function Result({
  total,
  regimeFrom,
  empty,
  dashboard,
}: {
  total: NonNullable<AnalysisView['total']>;
  regimeFrom: string | null;
  empty: boolean;
  dashboard: Route;
}) {
  const cta = (
    <Button asChild size="xl" className="demo-cue self-start" data-testid="see-dashboard">
      <Link href={dashboard}>
        Ver meu painel
        <ArrowRight className="size-4" strokeWidth={1.5} aria-hidden="true" />
      </Link>
    </Button>
  );
  if (empty)
    return (
      <section className="result-enter mt-5 flex flex-col gap-5" data-testid="analysis-empty">
        <p className="type-body-lg text-foreground">
          Não achamos nada para economizar agora. Isso é bom: sua empresa está bem ajustada. Vamos
          te avisar se a lei mudar.
        </p>
        {cta}
      </section>
    );
  return (
    <section
      className="result-enter mt-5 flex flex-col gap-4 border-t border-border pt-5"
      data-testid="analysis-result"
    >
      <p className="type-body-lg text-balance text-foreground">
        Você pode pagar{' '}
        <strong className="num font-semibold" data-cents={total.savings12m}>
          {formatBRL(total.savings12m)} a menos
        </strong>{' '}
        nos próximos 12 meses, dentro da lei.
        {total.annualRegimeSavings !== null && regimeFrom ? (
          <>
            {' '}
            E{' '}
            <strong className="num font-semibold" data-cents={total.annualRegimeSavings}>
              {formatBRL(total.annualRegimeSavings)}
            </strong>{' '}
            por ano a partir de {monthInWords(regimeFrom)}.
          </>
        ) : null}
      </p>
      {cta}
    </section>
  );
}

const CONFETTI = Array.from({ length: 28 }, (_, i) => {
  // Deterministic spread (no Math.random in render): ±35°, speeds 6–9, mixed rotations.
  const angle = ((i * 37) % 71) - 35;
  const speed = 6 + ((i * 13) % 31) / 10;
  const color = i % 20 < 12 ? 'var(--found)' : i % 20 < 17 ? 'var(--text)' : 'var(--accent-c)';
  return { angle, speed, color, rot: (i * 47) % 360, delay: (i % 7) * 18 };
});

/** Script 3: 28 "statement slips" fired once from below the number, limited to its card. */
function Confetti() {
  return (
    <div
      className="confetti pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden="true"
    >
      {CONFETTI.map((c, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed set of particles.
          key={i}
          style={{
            ['--x' as string]: `${Math.sin((c.angle * Math.PI) / 180) * c.speed * 12}px`,
            ['--y' as string]: `${-Math.cos((c.angle * Math.PI) / 180) * c.speed * 12}px`,
            ['--r' as string]: `${c.rot}deg`,
            ['--c' as string]: c.color,
            animationDelay: `${c.delay}ms`,
          }}
        />
      ))}
    </div>
  );
}
