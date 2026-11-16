'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { moneyParts, speakBRL } from '@/lib/format';
import { cn } from '@/lib/utils';
import { cssVars } from './highlight';

// The R$ counter of the live analysis (IDENTITY-AND-UI §4.9 script 2): one counter per jump, interpolated
// with out-expo through requestAnimationFrame, pt-BR on every frame, tabular figures so the digits never
// jump; the amber band sweeps behind the number at each jump and stays on the last one. The interpolation
// is integer cents only and always lands exactly on `cents`. Shared by /demo (E12) and /app (E14).

const COUNT_MS = 1400; // §4.9: "Counter 0 → 28.316 (1.400ms out-expo)"; nothing above 1,4 s per jump

const outExpo = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

interface MoneyCounterProps {
  /** Target in cents; `data-cents` always carries it (TESTS: values are compared through data-cents). */
  cents: number;
  testId: string;
  /** The total settled: the number does its 1.00 → 1.02 → 1.00 and the final value is announced. */
  settled?: boolean;
  /** Read before the amount by screen readers when settled. */
  srLabel?: string;
  /** Called once, on the first frame that shows more than R$ 0. */
  onFirstMoney?: () => void;
  subline?: ReactNode;
  className?: string;
}

export function MoneyCounter({
  cents,
  testId,
  settled = false,
  srLabel,
  onFirstMoney,
  subline,
  className,
}: MoneyCounterProps) {
  const [shown, setShown] = useState(0);
  const [jump, setJump] = useState(0);
  const from = useRef(0);
  const firstMoney = useRef(onFirstMoney);
  firstMoney.current = onFirstMoney;
  const reported = useRef(false);

  useEffect(() => {
    const start = from.current;
    if (cents === start) return;
    setJump((j) => j + 1);
    const report = (value: number) => {
      if (!reported.current && value > 0) {
        reported.current = true;
        firstMoney.current?.();
      }
    };
    if (reducedMotion()) {
      from.current = cents;
      setShown(cents);
      report(cents);
      return;
    }
    let frame = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / COUNT_MS);
      // Integer interpolation: the last frame is exactly `cents`, never a float near it.
      const value = t >= 1 ? cents : start + Math.round((cents - start) * outExpo(t));
      from.current = value;
      setShown(value);
      report(value);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      from.current = cents; // a newer target interrupts: continue from where the eye is
    };
  }, [cents]);

  const parts = moneyParts(shown);
  const zero = cents === 0;
  return (
    <div
      data-testid={testId}
      data-cents={cents}
      data-shown={shown}
      data-settled={settled && shown === cents ? 'true' : 'false'}
      className={cn('min-w-0', className)}
    >
      <p className="sr-only" aria-live="polite">
        {settled ? `${srLabel ? `${srLabel}: ` : ''}${speakBRL(cents)}` : ''}
      </p>
      <p
        aria-hidden="true"
        className={cn('type-money-hero num', settled && 'money-settle')}
        style={cssVars({ '--hl-delay': '0ms' })}
      >
        <span
          className={cn(
            'hl inline-flex items-start pr-[0.06em] pl-[0.02em]',
            zero ? 'text-subtle' : 'text-found-foreground',
          )}
        >
          {zero ? null : (
            <span key={jump} className="hl-sweep">
              <span className="hl-band" />
            </span>
          )}
          <span className="mt-[0.08em] mr-[0.1em] text-[0.45em] leading-none opacity-75">R$</span>
          {parts.reais}
          <span className="mt-[0.08em] text-[0.5em] leading-none opacity-75">,{parts.cents}</span>
        </span>
      </p>
      {subline ? <div className="type-small mt-3 text-muted-foreground">{subline}</div> : null}
    </div>
  );
}
