import { formatBRLThousands } from '@/lib/format';

// The R01 optimizer curve (IDENTITY-AND-UI Screen 6, wow moment 2): the engine's `optimizerCurve` drawn as plain
// SVG (no chart library: it keeps the detail route inside the JS budget, ARCHITECTURE §11.1). X = monthly pró-labore,
// Y = total annual PF+PJ cost at steady state. Only positions are computed here; every value is the engine's point.
// The lines stretch with the box; tick labels and the dot are HTML, so text stays ≥ 11px and round at any width.

export interface CurvePoint {
  monthlyProLabore: number;
  annualTotalCost: number;
}

interface OptimizerCurveProps {
  points: readonly CurvePoint[];
  /** P0 today (dashed cobalt line). */
  current: number;
  /** P* (amber dot). */
  target: number;
  /** The recommended P* (default margin): anchors the x domain so it does not jump while the slider moves. */
  recommended?: number;
  /**
   * D48: the first optimizer candidate (the minimum wage). Points below it are the engine's display-only extension
   * (`optimizerDisplayCurve`) and are drawn dashed and faded: a pró-labore below the minimum wage is not an option.
   */
  candidatesFrom?: number;
}

/** Window around the recommended P*, as multiples of it (UX review G2 H3). */
export const DOMAIN_LOW = 0.5;
export const DOMAIN_HIGH = 1.25;

/**
 * The x window of the chart (UX review G2 H3): the engine's grid runs far past P*, which squeezed the Anexo V → III
 * step and the savings area into a sliver. The window is 0,5× to 1,25× the recommended P* (D48: the engine's display
 * curve now starts at half the minimum wage, so the left end puts the Anexo V → III step at about a third of the
 * width), always widened to keep "hoje" and the slider's P* inside, and never wider than the grid. Positions only; no value is computed.
 */
export function curveDomain(
  xs: readonly number[],
  recommended: number,
  keep: readonly number[],
): [number, number] {
  const [g0, g1] = [Math.min(...xs), Math.max(...xs)];
  if (!(recommended > 0)) return [g0, g1];
  const lo = Math.min(recommended * DOMAIN_LOW, ...keep);
  const hi = Math.max(recommended * DOMAIN_HIGH, ...keep);
  return [Math.max(g0, lo), Math.min(g1, hi)];
}

// Plot coordinates in percent of the plot box.
const W = 100;
const H = 100;

export function OptimizerCurve({
  points,
  current,
  target,
  recommended,
  candidatesFrom,
}: OptimizerCurveProps) {
  const all = [...points].sort((a, b) => a.monthlyProLabore - b.monthlyProLabore);
  if (all.length < 2) return null;
  const [x0, x1] = curveDomain(
    all.map((p) => p.monthlyProLabore),
    recommended ?? target,
    [current, target],
  );
  const inside = all.filter((p) => p.monthlyProLabore >= x0 && p.monthlyProLabore <= x1);
  const sorted = inside.length >= 2 ? inside : all;
  const ys = sorted.map((p) => p.annualTotalCost);
  const [yMin, yMax] = [Math.min(...ys), Math.max(...ys)];
  const y0 = yMin - (yMax - yMin) * 0.08;
  const y1 = yMax + (yMax - yMin) * 0.05;
  const sx = (v: number) => ((v - x0) / (x1 - x0 || 1)) * W;
  const sy = (v: number) => H - ((v - y0) / (y1 - y0 || 1)) * H;
  const path = (ps: readonly CurvePoint[]) =>
    ps
      .map(
        (p, i) =>
          `${i === 0 ? 'M' : 'L'}${sx(p.monthlyProLabore).toFixed(2)} ${sy(p.annualTotalCost).toFixed(2)}`,
      )
      .join(' ');
  const from = candidatesFrom ?? -Infinity;
  const line = path(sorted.filter((p) => p.monthlyProLabore >= from));
  const belowPts = sorted.filter((p) => p.monthlyProLabore <= from);
  const belowLine = belowPts.length >= 2 ? path(belowPts) : null;
  const [lo, hi] = current <= target ? [current, target] : [target, current];
  const between = sorted.filter((p) => p.monthlyProLabore >= lo && p.monthlyProLabore <= hi);
  const area =
    between.length >= 2
      ? `M${sx(lo).toFixed(2)} ${H} ${between
          .map((p) => `L${sx(p.monthlyProLabore).toFixed(2)} ${sy(p.annualTotalCost).toFixed(2)}`)
          .join(' ')} L${sx(hi).toFixed(2)} ${H} Z`
      : null;
  const at = sorted.find((p) => p.monthlyProLabore === target);
  const yTicks = [yMax, (yMin + yMax) / 2, yMin];
  const xTicks = [x0, x0 + (x1 - x0) / 2, x1];
  return (
    <figure
      className="flex flex-col gap-2"
      data-testid="optimizer-curve"
      data-target={target}
      data-x0={x0}
      data-x1={x1}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2">
        <div className="relative w-16" aria-hidden="true">
          {yTicks.map((t) => (
            <span
              key={t}
              className="num absolute right-0 -translate-y-1/2 text-[11px] leading-4 whitespace-nowrap text-muted-foreground"
              style={{ top: `${sy(t)}%` }}
            >
              {formatBRLThousands(Math.round(t))}
            </span>
          ))}
        </div>
        <div className="relative h-[200px] lg:h-[240px]">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full overflow-visible"
            role="img"
            aria-label="Custo total por ano (empresa e sócio) para cada pró-labore mensal"
          >
            <defs>
              <pattern
                id="curve-hatch"
                width="2"
                height="2"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="2"
                  stroke="var(--found-chart)"
                  strokeWidth="1"
                  strokeOpacity="0.35"
                />
              </pattern>
            </defs>
            {yTicks.map((t) => (
              <line
                key={t}
                x1={0}
                x2={W}
                y1={sy(t)}
                y2={sy(t)}
                stroke="var(--border)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {area ? <path d={area} fill="url(#curve-hatch)" /> : null}
            {belowLine ? (
              <path
                d={belowLine}
                fill="none"
                stroke="var(--chart-3)"
                strokeOpacity="0.45"
                strokeWidth="2"
                strokeDasharray="3 4"
                vectorEffect="non-scaling-stroke"
                data-testid="optimizer-curve/below-minimum"
              />
            ) : null}
            <path
              d={line}
              fill="none"
              stroke="var(--chart-3)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1={sx(current)}
              x2={sx(current)}
              y1={0}
              y2={H}
              stroke="var(--accent-c)"
              strokeWidth="1.5"
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {at ? (
            <span
              aria-hidden="true"
              className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-found-chart transition-[left,top] duration-(--dur-base) ease-(--ease-out-expo)"
              style={{ left: `${sx(at.monthlyProLabore)}%`, top: `${sy(at.annualTotalCost)}%` }}
            />
          ) : null}
        </div>
        <span />
        <div className="relative mt-1 h-4" aria-hidden="true">
          {xTicks.map((t, i) => (
            <span
              key={t}
              className={`num absolute text-[11px] leading-4 whitespace-nowrap text-muted-foreground ${
                i === 0 ? '' : i === xTicks.length - 1 ? '-translate-x-full' : '-translate-x-1/2'
              }`}
              style={{ left: `${sx(t)}%` }}
            >
              {formatBRLThousands(Math.round(t))}
            </span>
          ))}
        </div>
      </div>
      <figcaption className="type-caption flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-3 w-0 border-l-2 border-dashed border-cobalt"
          />
          hoje
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block size-2.5 rounded-full bg-found-chart" />
          pró-labore recomendado
        </span>
        <span>eixo: pró-labore por mês × custo por ano (DAS + INSS + IR), depois da mudança</span>
      </figcaption>
    </figure>
  );
}
