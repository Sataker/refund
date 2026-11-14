import type { Step, Trace } from '@refund/engine';
import { ChevronDown } from 'lucide-react';
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

interface CalcTraceProps {
  /** The engine's trace, rendered as is (the UI never computes, CLAUDE.md rule 1). */
  trace: Trace;
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
              <p className="type-mono font-medium text-foreground">
                = <StepValue value={step.result} testId={`${testIdPrefix}/${step.id}`} />
              </p>
              {step.ref ? <LawSeal lawRef={step.ref} /> : null}
            </div>
          </li>
        ))}
      </ol>
    </details>
  );
}
