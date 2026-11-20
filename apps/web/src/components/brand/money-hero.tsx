import type { ReactNode } from 'react';
import { formatBRL, moneyParts, THIN_NBSP } from '@/lib/format';
import { cn } from '@/lib/utils';
import { cssVars } from './highlight';

const SIZE = {
  hero: 'type-money-hero',
  lg: 'type-money-lg',
  md: 'type-money-md',
} as const;

interface MoneyHeroProps {
  cents: number;
  /** TESTS convention: values are compared through `data-cents`; the test id names the screen. */
  testId?: string;
  size?: keyof typeof SIZE;
  /** Roll the digits and sweep the highlight on first paint. */
  animate?: boolean;
  /** Read before the amount by screen readers, e.g. "Você pode pagar a menos". */
  srLabel?: string;
  /** Confidence range or period below the number (§4.8). */
  subline?: ReactNode;
  /** Announce the final value (aria-live polite) — for screens where the number changes. */
  live?: boolean;
  className?: string;
}

const REEL = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const PLACE_DELAY_MS = 30; // §4.9: 30 ms per place, right to left

function Odometer({ text, firstPlace }: { text: string; firstPlace: number }) {
  // `place` counts digits from the right of the whole amount (cents included), so the cents start first.
  let place = firstPlace + [...text].filter((c) => c >= '0' && c <= '9').length;
  return (
    <>
      {[...text].map((ch, i) => {
        if (ch < '0' || ch > '9') {
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed separators of a fixed string.
            <span key={i} className="inline-block">
              {ch}
            </span>
          );
        }
        place -= 1;
        return (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: one reel per position of a fixed string.
            key={i}
            className="odo-digit"
          >
            <span
              className="odo-reel"
              style={cssVars({ '--d': Number(ch), '--delay': `${place * PLACE_DELAY_MS}ms` })}
            >
              {REEL.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </span>
          </span>
        );
      })}
    </>
  );
}

/**
 * The hero amount (IDENTITY-AND-UI §4.8 and §4.9 script 2): per-digit odometer + amber highlight sweep, smaller
 * "R$" and cents, tabular figures. Pure CSS: the final value is in the HTML (no layout shift, works without
 * JS), and `prefers-reduced-motion` turns the roll into a 200 ms fade.
 */
export function MoneyHero({
  cents,
  testId = 'money-hero',
  size = 'hero',
  animate = true,
  srLabel,
  subline,
  live = false,
  className,
}: MoneyHeroProps) {
  const parts = moneyParts(cents);
  return (
    <div data-testid={testId} data-cents={cents} className={cn('min-w-0', className)}>
      <p className="sr-only select-none" aria-live={live ? 'polite' : undefined}>
        {srLabel ? `${srLabel}: ` : ''}
        {formatBRL(cents)}
      </p>
      <p aria-hidden="true" className={cn(SIZE[size], 'num relative')}>
        {/*
         * Copy layer (E21): the odometer keeps ten reel digits per position in the DOM, so selecting it pasted
         * "0123456789…". The visible number is not selectable; this transparent twin, laid out like the static
         * number, is what a drag-select and copy pick up ("R$ 21.138,60"). Screen readers use the sr-only line.
         */}
        <span
          data-testid={`${testId}/copy`}
          className="absolute top-0 left-0 z-10 pr-[0.06em] pl-[0.02em] whitespace-nowrap text-transparent select-text selection:bg-cobalt/25 selection:text-transparent"
        >
          {/* Inline (not flex) so the copied text has no line breaks between R$, reais and cents. */}
          <span className="mr-[0.1em] align-top text-[0.45em] leading-none">
            {parts.negative ? '−' : ''}R$<span className="text-[0px]">{THIN_NBSP}</span>
          </span>
          {parts.reais}
          <span className="align-top text-[0.5em] leading-none">,{parts.cents}</span>
        </span>
        <span
          className={cn(
            'hl inline-flex items-start pr-[0.06em] pl-[0.02em] text-found-foreground select-none',
            !animate && 'hl-static',
          )}
          style={cssVars({ '--hl-delay': '120ms' })}
        >
          <span className="hl-sweep">
            <span className="hl-band" />
          </span>
          <span className="mt-[0.08em] mr-[0.1em] text-[0.45em] leading-none opacity-75">
            {parts.negative ? '−' : ''}R$
          </span>
          {animate ? <Odometer text={parts.reais} firstPlace={2} /> : parts.reais}
          <span className="mt-[0.08em] text-[0.5em] leading-none opacity-75">
            ,{animate ? <Odometer text={parts.cents} firstPlace={0} /> : parts.cents}
          </span>
        </span>
      </p>
      {subline ? <div className="type-small mt-3 text-muted-foreground">{subline}</div> : null}
    </div>
  );
}
