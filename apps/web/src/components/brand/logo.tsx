import { cn } from '@/lib/utils';

interface LogoProps {
  /** Shows "imposto com a conta aberta" next to the wordmark (§3.1 recommended descriptor). */
  descriptor?: boolean;
  className?: string;
}

/**
 * Concept C, "Grifo" (IDENTITY-AND-UI §3.5): "refund" in Geist SemiBold, tracking −3%, with the chiseled amber
 * band behind "re" (re- = back), rotated −2°. Built in CSS until the final SVG exists; swap the inner markup for
 * the SVG and keep the API.
 */
export function Logo({ descriptor = false, className }: LogoProps) {
  return (
    <span className={cn('inline-flex items-baseline gap-3', className)}>
      <span
        role="img"
        aria-label="Refund"
        className="font-sans font-semibold leading-none tracking-[-0.03em]"
      >
        <span className="hl hl-static hl-logo text-found-foreground">
          <span className="hl-sweep" aria-hidden="true">
            <span className="hl-band" />
          </span>
          re
        </span>
        fund
      </span>
      {descriptor ? (
        <span className="hidden text-[0.45em] font-normal leading-none text-muted-foreground md:inline">
          imposto com a conta aberta
        </span>
      ) : null}
    </span>
  );
}
