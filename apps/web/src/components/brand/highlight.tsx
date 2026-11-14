import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** CSS custom properties as a typed style object. */
export function cssVars(vars: Record<`--${string}`, string | number>): CSSProperties {
  return vars as CSSProperties;
}

interface HighlightProps {
  children: ReactNode;
  /**
   * `band`: the chiseled band of the brand, for amounts (one line, may sweep).
   * `text`: a highlighter pass over running text (wraps across lines, e.g. the law excerpt).
   */
  variant?: 'band' | 'text';
  /** Sweep left → right on first paint (§4.9 script 2). Only for `band`. */
  animate?: boolean;
  delayMs?: number;
  className?: string;
}

/**
 * The auditor's highlight (IDENTITY-AND-UI §2.1): amber behind a found amount or the cited excerpt of the law.
 * Reserved for found money, the law it rests on and the logo (§4.1 item 1). Text on it is always ink.
 */
export function Highlight({
  children,
  variant = 'band',
  animate = true,
  delayMs = 0,
  className,
}: HighlightProps) {
  if (variant === 'text') {
    return <mark className={cn('hl-text', className)}>{children}</mark>;
  }
  return (
    <span
      className={cn('hl text-found-foreground', !animate && 'hl-static', className)}
      style={cssVars({ '--hl-delay': `${delayMs}ms` })}
    >
      <span className="hl-sweep" aria-hidden="true">
        <span className="hl-band" />
      </span>
      {children}
    </span>
  );
}
