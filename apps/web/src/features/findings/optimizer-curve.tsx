import { formatBRLThousands } from '@/lib/format';

// The R01 optimizer curve (IDENTITY-AND-UI Screen 6, wow moment 2): the engine's `optimizerCurve` drawn as plain
// SVG (no chart library: it keeps the detail route inside the JS budget, ARCHITECTURE §11.1). X = monthly pró-labore,
// Y = total annual PF+PJ cost at steady state. Only positions are computed here; every value is the engine's point.

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
}

const W = 640;
const H = 240;
const PAD = { left: 52, right: 16, top: 16, bottom: 32 };

export function OptimizerCurve({ points, current, target }: OptimizerCurveProps) {
  const sorted = [...points].sort((a, b) => a.monthlyProLabore - b.monthlyProLabore);
  const first = sorted[0];
  const last = sorted.at(-1);
  if (!first || !last || sorted.length < 2) return null;
  const xs = sorted.map((p) => p.monthlyProLabore);
  const ys = sorted.map((p) => p.annualTotalCost);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [yMin, yMax] = [Math.min(...ys), Math.max(...ys)];
  const y0 = yMin - (yMax - yMin) * 0.08;
  const y1 = yMax + (yMax - yMin) * 0.05;
  const sx = (v: number) => PAD.left + ((v - x0) / (x1 - x0 || 1)) * (W - PAD.left - PAD.right);
  const sy = (v: number) =>
    H - PAD.bottom - ((v - y0) / (y1 - y0 || 1)) * (H - PAD.top - PAD.bottom);
  const line = sorted
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'}${sx(p.monthlyProLabore).toFixed(1)} ${sy(p.annualTotalCost).toFixed(1)}`,
    )
    .join(' ');
  const [lo, hi] = current <= target ? [current, target] : [target, current];
  const between = sorted.filter((p) => p.monthlyProLabore >= lo && p.monthlyProLabore <= hi);
  const area =
    between.length >= 2
      ? `M${sx(lo).toFixed(1)} ${(H - PAD.bottom).toFixed(1)} ${between
          .map((p) => `L${sx(p.monthlyProLabore).toFixed(1)} ${sy(p.annualTotalCost).toFixed(1)}`)
          .join(' ')} L${sx(hi).toFixed(1)} ${(H - PAD.bottom).toFixed(1)} Z`
      : null;
  const at = sorted.find((p) => p.monthlyProLabore === target);
  const yTicks = [yMin, (yMin + yMax) / 2, yMax];
  const xTicks = [x0, x0 + (x1 - x0) / 2, x1];
  return (
    <figure className="flex flex-col gap-2" data-testid="optimizer-curve" data-target={target}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-[220px] w-full lg:h-[260px]"
        role="img"
        aria-label="Custo total por ano (empresa e sócio) para cada pró-labore mensal"
        preserveAspectRatio="none"
      >
        <defs>
          <pattern
            id="curve-hatch"
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="6"
              stroke="var(--found-chart)"
              strokeWidth="2"
              strokeOpacity="0.35"
            />
          </pattern>
        </defs>
        {yTicks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={sy(t)}
              y2={sy(t)}
              stroke="var(--border)"
              strokeWidth="1"
            />
            <text
              x={PAD.left - 6}
              y={sy(t) + 4}
              textAnchor="end"
              fontSize="11"
              fill="var(--text-muted)"
            >
              {formatBRLThousands(Math.round(t))}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text
            key={t}
            x={sx(t)}
            y={H - 10}
            textAnchor="middle"
            fontSize="11"
            fill="var(--text-muted)"
          >
            {formatBRLThousands(Math.round(t))}
          </text>
        ))}
        {area ? <path d={area} fill="url(#curve-hatch)" /> : null}
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
          y1={PAD.top}
          y2={H - PAD.bottom}
          stroke="var(--accent-c)"
          strokeWidth="1.5"
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
        />
        {at ? (
          <circle
            cx={sx(at.monthlyProLabore)}
            cy={sy(at.annualTotalCost)}
            r="6"
            fill="var(--found-chart)"
            stroke="var(--surface)"
            strokeWidth="2"
            style={{ transition: 'cx 220ms var(--ease-out-expo), cy 220ms var(--ease-out-expo)' }}
          />
        ) : null}
      </svg>
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
        <span>eixo: pró-labore por mês × custo por ano (DAS + INSS + IR), em regime</span>
      </figcaption>
    </figure>
  );
}
