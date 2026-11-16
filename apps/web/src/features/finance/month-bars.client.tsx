'use client';

import dynamic from 'next/dynamic';
import type { MonthBarsProps } from './month-bars-chart.client.tsx';

export type { MonthBarsProps, MonthBarsSeries } from './month-bars-chart.client.tsx';

const Chart = dynamic(() => import('./month-bars-chart.client.tsx'), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse rounded-md bg-surface-2" />,
});

/** "Saídas por mês": Recharts loaded on the client only (like OptimizerCurve); the legend and the table are HTML. */
export function MonthBars(props: MonthBarsProps & { summary: string }) {
  const { summary, ...chart } = props;
  return (
    <figure className="flex flex-col gap-3" aria-label={summary}>
      <div className="h-[140px] w-full lg:h-[180px]" data-testid="fv-month-bars">
        <Chart {...chart} />
      </div>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1">
        {chart.series
          .filter((s) => s.color !== null)
          .map((s) => (
            <span
              key={s.key}
              className="type-caption inline-flex items-center gap-1.5 text-muted-foreground"
            >
              <span
                className="size-2.5 rounded-[3px]"
                style={{ background: s.color ?? undefined }}
                aria-hidden="true"
              />
              {s.label}
            </span>
          ))}
        {chart.series.some((s) => s.color === null) ? (
          <span className="type-caption inline-flex items-center gap-1.5 text-muted-foreground">
            <span className="size-2.5 rounded-[3px] bg-surface-3" aria-hidden="true" />
            Outros
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
}
