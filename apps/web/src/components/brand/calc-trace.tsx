import type { Step, Trace } from '@refund/engine';
import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatBRL, formatRatePercent } from '@/lib/format';
import { cn } from '@/lib/utils';
import { LawSeal } from './law-seal';

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
  return <span>{String(value.value)}</span>;
}

function inputText(input: Step['inputs'][string]): string {
  switch (input.unit) {
    case 'cents':
      return typeof input.value === 'number' ? formatBRL(input.value) : String(input.value);
    case 'rate':
      return formatRatePercent(String(input.value));
    case 'months':
      return `${input.value} meses`;
    default:
      return String(input.value);
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
}: CalcTraceProps) {
  return (
    <details open={open} className={cn('group', className)} data-testid="calc-trace">
      <summary className="type-small inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-md font-medium text-cobalt [&::-webkit-details-marker]:hidden">
        <span className="group-open:hidden">Ver cálculo</span>
        <span className="hidden group-open:inline">Esconder cálculo</span>
        <ChevronDown
          className="size-4 transition-transform duration-(--dur-base) ease-(--ease-out-expo) group-open:rotate-180"
          strokeWidth={1.5}
          aria-hidden="true"
        />
      </summary>
      <ol className="relative mt-5 space-y-5 before:absolute before:top-2 before:bottom-2 before:left-[11px] before:w-px before:bg-border">
        {trace.map((step, i) => (
          <li key={step.id} className="relative grid grid-cols-[24px_1fr] gap-x-4">
            <span
              className="type-caption num relative z-10 flex size-6 items-center justify-center rounded-full border border-strong-border bg-surface text-muted-foreground"
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <div className="min-w-0 space-y-1.5">
              <p className="type-small font-medium text-foreground">{step.label}</p>
              <p className="type-mono break-words text-muted-foreground">{step.formula}</p>
              {Object.keys(step.inputs).length > 0 ? (
                <dl className="type-mono grid grid-cols-[auto_1fr] gap-x-3 text-muted-foreground">
                  {Object.entries(step.inputs).map(([name, input]) => (
                    <div key={name} className="contents">
                      <dt>{name}</dt>
                      <dd className="num text-foreground">{inputText(input)}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {sources?.[step.id]?.length ? (
                <SourceList
                  rows={sources[step.id] ?? []}
                  value={<StepValue value={step.result} testId={`${testIdPrefix}/${step.id}`} />}
                  testId={`${testIdPrefix}-sources/${step.id}`}
                />
              ) : (
                <p className="type-mono font-medium text-foreground">
                  = <StepValue value={step.result} testId={`${testIdPrefix}/${step.id}`} />
                </p>
              )}
              {step.ref ? <LawSeal lawRef={step.ref} /> : null}
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
}: {
  rows: readonly TraceSourceRow[];
  value: ReactNode;
  testId: string;
}) {
  return (
    <details className="group/src" data-testid={testId}>
      <summary className="type-mono inline-flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-2 rounded-md font-medium text-foreground [&::-webkit-details-marker]:hidden">
        <span>
          = <span className="underline decoration-dotted underline-offset-4">{value}</span>
        </span>
        <span className="type-caption font-sans text-cobalt">
          <span className="group-open/src:hidden">ver {rows.length} transações</span>
          <span className="hidden group-open/src:inline">esconder transações</span>
        </span>
      </summary>
      <div className="mt-2 max-h-72 overflow-auto rounded-md border border-border">
        <table className="type-mono w-full text-left" data-testid="source-transactions">
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
      </div>
    </details>
  );
}
