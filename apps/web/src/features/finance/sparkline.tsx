import { cn } from '@/lib/utils';

/**
 * 12-month sparkline (Screen 5b), inline SVG: one bar per month, height relative to the group's largest month.
 * The geometry is drawing only; the values it draws are the builder's `byMonth` cents.
 */
export function Sparkline({
  values,
  className,
  label,
}: {
  values: readonly number[];
  className?: string;
  /** Accessible summary; omit when the numbers are already in the text next to it. */
  label?: string;
}) {
  const max = Math.max(1, ...values);
  const w = 4;
  const gap = 2;
  const h = 20;
  const width = values.length * (w + gap) - gap;
  return (
    <svg
      viewBox={`0 0 ${width} ${h}`}
      width={width}
      height={h}
      className={cn('shrink-0 overflow-visible', className)}
      role="img"
      aria-hidden={label === undefined ? true : undefined}
    >
      <title>{label ?? 'Últimos 12 meses'}</title>
      {values.map((v, i) => {
        const bar = v === 0 ? 1 : Math.max(2, (v / max) * h);
        return (
          <rect
            // biome-ignore lint/suspicious/noArrayIndexKey: one bar per month, fixed order
            key={i}
            x={i * (w + gap)}
            y={h - bar}
            width={w}
            height={bar}
            rx={1}
            className={
              v === 0
                ? 'fill-surface-3'
                : i === values.length - 1
                  ? 'fill-foreground'
                  : 'fill-strong-border'
            }
          />
        );
      })}
    </svg>
  );
}
