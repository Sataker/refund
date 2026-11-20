import type { Step, Trace } from '@refund/engine';
import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatBRL, formatRatePercent } from '@/lib/format';
import { cn } from '@/lib/utils';
import { LawSeal } from './law-seal';
import { traceInputLabel, traceRateValue, traceTextValue } from './trace-labels';

type Value = Step['result'];

function StepValue({ value, testId }: { value: Value; testId?: string }) {
  if (value.unit === 'cents' && typeof value.value === 'number') {
    return (
      <span data-testid={testId} data-cents={value.value} className="num">
        {formatBRL(value.value)}
      </span>
    );
  }
  if (value.unit === 'rate')
    return <span className="num">{formatRatePercent(String(value.value))}</span>;
  return <span>{traceTextValue('', String(value.value))}</span>;
}

export function inputText(key: string, input: Step['inputs'][string]): string {
  switch (input.unit) {
    case 'cents':
      return typeof input.value === 'number' ? formatBRL(input.value) : String(input.value);
    case 'rate':
      return traceRateValue(key, String(input.value));
    case 'months':
      return `${input.value} meses`;
    default:
      return traceTextValue(key, String(input.value));
  }
}

/** One source transaction behind a trace number (already masked by the whitelist, CLAUDE.md rule 4). */
export interface TraceSourceRow {
  id: string;
  /** CivilDate "2026-07-10". */
  date: string;
  label: string;
  amountCents: number;
}

interface CalcTraceProps {
  /** The engine's trace, rendered as is (the UI never computes, CLAUDE.md rule 1). */
  trace: Trace;
  /**
   * stepId → the transactions behind that step's number (the facts' provenance). When present, the number opens
   * the list (IDENTITY-AND-UI Screen 6: "clickable numbers open a table of the source transactions").
   */
  sources?: Readonly<Record<string, readonly TraceSourceRow[]>>;
  /** Open by default (e.g. on the landing's "a conta é o produto" block). */
  open?: boolean;
  /** Prefix for the result test ids: `${testIdPrefix}/${step.id}`. */
  testIdPrefix?: string;
  className?: string;
  /**
   * A risk has no money: a step whose result is R$ 0,00 reads "sem valor de economia" instead of "= R$ 0,00"
   * (UX review G2 L2). The data-cents stays on the element for the tests.
   */
  noMoneyText?: string;
  /** Finding detail (E21 readability): 14px floor, bigger toggle and law seals. */
  comfortable?: boolean;
}

/**
 * Calculation trace (IDENTITY-AND-UI §4.8): numbered steps (inputs → formula → article → result), mono font,
 * 1px vertical guide line. Layer 2 of the tone of voice: here it may be technical (§2.3 rule 4).
 */
export function CalcTrace({
  trace,
  open = false,
  testIdPrefix = 'trace',
  sources,
  className,
  noMoneyText,
  comfortable = false,
}: CalcTraceProps) {
  const small = comfortable ? 'text-base' : 'type-small';
  const mono = comfortable ? 'font-mono text-[14px] leading-6' : 'type-mono';
  return (
    <details open={open} className={cn('group', className)} data-testid="calc-trace">
      <summary
        className={cn(
          small,
          'inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-md font-medium text-cobalt [&::-webkit-details-marker]:hidden',
          comfortable && 'border border-strong-border px-4 hover:bg-surface-2',
        )}
      >
        <span className="group-open:hidden">Ver cálculo</span>
        <span className="hidden group-open:inline">Esconder cálculo</span>
        <ChevronDown
          className="size-4 transition-transform duration-(--dur-base) ease-(--ease-out-expo) group-open:rotate-180"
          strokeWidth={1.5}
          aria-hidden="true"
        />
      </summary>
      <ol
        className={cn(
          'relative mt-5 space-y-5 before:absolute before:top-2 before:bottom-2 before:w-px before:bg-border',
          comfortable ? 'before:left-[15px]' : 'before:left-[11px]',
        )}
      >
        {trace.map((step, i) => (
          <li
            key={step.id}
            className={cn(
              'relative grid gap-x-4',
              comfortable ? 'grid-cols-[32px_1fr]' : 'grid-cols-[24px_1fr]',
            )}
          >
            <span
              className={cn(
                'num relative z-10 flex items-center justify-center rounded-full border border-strong-border bg-surface',
                comfortable
                  ? 'type-small size-8 font-semibold text-foreground'
                  : 'type-caption size-6 text-muted-foreground',
              )}
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <div className="min-w-0 space-y-1.5">
              <p
                className={cn(
                  'font-medium text-foreground',
                  comfortable ? 'type-body-lg' : 'type-small',
                )}
              >
                {step.label}
              </p>
              <p className={cn(mono, 'break-words text-muted-foreground')}>{step.formula}</p>
              {Object.keys(step.inputs).some((k) => traceInputLabel(k) !== null) ? (
                <dl
                  className={cn(
                    small,
                    'grid gap-x-3 text-muted-foreground',
                    // Detail: label above value on narrow screens (200% zoom), side by side from 420px.
                    comfortable
                      ? 'grid-cols-1 min-[420px]:grid-cols-[auto_1fr] [&_dd]:mb-1.5 min-[420px]:[&_dd]:mb-0'
                      : 'grid-cols-[auto_1fr]',
                  )}
                >
                  {Object.entries(step.inputs).flatMap(([name, input]) => {
                    const label = traceInputLabel(name);
                    return label === null
                      ? []
                      : [
                          <div key={name} className="contents">
                            <dt>{label}</dt>
                            <dd className="num break-words text-foreground">
                              {inputText(name, input)}
                            </dd>
                          </div>,
                        ];
                  })}
                </dl>
              ) : null}
              {sources?.[step.id]?.length ? (
                <SourceList
                  rows={sources[step.id] ?? []}
                  value={<StepValue value={step.result} testId={`${testIdPrefix}/${step.id}`} />}
                  testId={`${testIdPrefix}-sources/${step.id}`}
                  comfortable={comfortable}
                />
              ) : noMoneyText && step.result.unit === 'cents' && step.result.value === 0 ? (
                <p
                  className={cn(small, 'font-medium text-muted-foreground')}
                  data-testid={`${testIdPrefix}/${step.id}`}
                  data-cents={0}
                >
                  {noMoneyText}
                </p>
              ) : (
                <p className={cn(mono, 'font-medium text-foreground')}>
                  = <StepValue value={step.result} testId={`${testIdPrefix}/${step.id}`} />
                </p>
              )}
              {step.ref ? <LawSeal lawRef={step.ref} size={comfortable ? 'md' : 'sm'} /> : null}
            </div>
          </li>
        ))}
      </ol>
    </details>
  );
}

function formatDate(date: string): string {
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}

/** The step result as a toggle: open it to see the transactions the engine read (no JS: <details>). */
function SourceList({
  rows,
  value,
  testId,
  comfortable = false,
}: {
  rows: readonly TraceSourceRow[];
  value: ReactNode;
  testId: string;
  comfortable?: boolean;
}) {
  const mono = comfortable ? 'font-mono text-[14px] leading-6' : 'type-mono';
  return (
    <details className="group/src" data-testid={testId}>
      <summary
        className={cn(
          mono,
          'inline-flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-2 rounded-md font-medium text-foreground [&::-webkit-details-marker]:hidden',
        )}
      >
        <span>
          = <span className="underline decoration-dotted underline-offset-4">{value}</span>
        </span>
        <span className={cn(comfortable ? 'type-small' : 'type-caption', 'font-sans text-cobalt')}>
          <span className="group-open/src:hidden">ver {rows.length} transações</span>
          <span className="hidden group-open/src:inline">esconder transações</span>
        </span>
      </summary>
      <section
        className="mt-2 max-h-72 overflow-auto rounded-md border border-border"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be reachable by keyboard (axe scrollable-region-focusable)
        tabIndex={0}
        aria-label="Transações de origem"
      >
        <table className={cn(mono, 'w-full text-left')} data-testid="source-transactions">
          <caption className="sr-only">Transações de origem deste número</caption>
          <thead className="sticky top-0 bg-surface-2 text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-1.5 font-normal">
                Data
              </th>
              <th scope="col" className="px-3 py-1.5 font-normal">
                Lançamento
              </th>
              <th scope="col" className="px-3 py-1.5 text-right font-normal">
                Valor
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border" data-testid="source-row">
                <td className="num px-3 py-1.5 whitespace-nowrap text-muted-foreground">
                  {formatDate(r.date)}
                </td>
                <td className="px-3 py-1.5 break-words text-foreground">{r.label}</td>
                <td
                  className="num px-3 py-1.5 text-right whitespace-nowrap text-foreground"
                  data-cents={r.amountCents}
                >
                  {formatBRL(r.amountCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </details>
  );
}
