import { formatBRL, formatBRLThousands, formatYearMonth } from '@/lib/format';
import { shortMonth } from './text.ts';

// MonthBars (Screen 5b): outflows per month, stacked by group, as inline SVG (no chart library, no client JS;
// ARCHITECTURE §11.1 budget). The 5 largest groups get a chart color; the others share the neutral "Outros" tone.
// Every number on it is the builder's: the bar height is the month's `outflow`, each segment a group's `byMonth`.
// The same data is in an sr-only table (the chart's text alternative).

export interface MonthBarsSeries {
  key: string;
  label: string;
  /** null: one of the "Outros" (neutral color). */
  color: string | null;
  cents: number[];
}

export interface MonthBarsProps {
  months: string[];
  /** The holder's outflow per month (HolderView.monthly), the height of each bar. */
  totals: number[];
  series: MonthBarsSeries[];
  summary: string;
}

const W = 600;
const H = 160;
const OTHERS = 'var(--surface-3)';

export function MonthBars({ months, totals, series, summary }: MonthBarsProps) {
  const max = Math.max(1, ...totals);
  const slot = W / months.length;
  const bar = slot * 0.62;
  const named = series.filter((s) => s.color !== null);
  return (
    <figure className="flex flex-col gap-2">
      <div className="flex gap-2" data-testid="fv-month-bars">
        <div
          className="num type-caption flex w-[72px] shrink-0 flex-col justify-between pb-5 text-right whitespace-nowrap text-muted-foreground"
          aria-hidden="true"
        >
          <span>{formatBRLThousands(max)}</span>
          <span>R$ 0</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="h-[120px] w-full lg:h-[160px]"
            aria-hidden="true"
          >
            <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} className="stroke-border" />
            {months.map((m, i) => {
              let top = H;
              return (
                <g key={m}>
                  {series.map((s) => {
                    const v = s.cents[i] ?? 0;
                    if (v === 0) return null;
                    const h = (v / max) * H;
                    top -= h;
                    return (
                      <rect
                        key={s.key}
                        x={i * slot + (slot - bar) / 2}
                        y={top}
                        width={bar}
                        height={h}
                        fill={s.color ?? OTHERS}
                      />
                    );
                  })}
                </g>
              );
            })}
          </svg>
          <div className="num type-caption flex text-muted-foreground" aria-hidden="true">
            {months.map((m, i) => (
              <span
                key={m}
                className={
                  i === 0 || i === months.length - 1 || i % 3 === 0
                    ? 'min-w-0 flex-1 text-center whitespace-nowrap'
                    : 'min-w-0 flex-1 text-center whitespace-nowrap max-lg:invisible'
                }
              >
                {shortMonth(m)}
              </span>
            ))}
          </div>
        </div>
      </div>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1">
        <span className="sr-only">{summary}</span>
        {named.map((s) => (
          <span
            key={s.key}
            className="type-caption inline-flex items-center gap-1.5 text-muted-foreground"
            aria-hidden="true"
          >
            <span className="size-2.5 rounded-[3px]" style={{ background: s.color ?? undefined }} />
            {s.label}
          </span>
        ))}
        {series.length > named.length ? (
          <span
            className="type-caption inline-flex items-center gap-1.5 text-muted-foreground"
            aria-hidden="true"
          >
            <span className="size-2.5 rounded-[3px] bg-surface-3" />
            Outros
          </span>
        ) : null}
      </figcaption>
      {/* A table ignores width: 1px, so the sr-only box wraps it (no horizontal scroll on phones). */}
      <div className="sr-only">
        <table data-testid="fv-month-table">
          <caption>{summary}</caption>
          <thead>
            <tr>
              <th scope="col">Mês</th>
              <th scope="col">Saiu</th>
              {named.map((s) => (
                <th key={s.key} scope="col">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {months.map((m, i) => (
              <tr key={m}>
                <th scope="row">{formatYearMonth(m)}</th>
                <td data-cents={totals[i]}>{formatBRL(totals[i] ?? 0)}</td>
                {named.map((s) => (
                  <td key={s.key}>{formatBRL(s.cents[i] ?? 0)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
