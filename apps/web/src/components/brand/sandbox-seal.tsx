import { cn } from '@/lib/utils';

export const DEMO_LABEL = 'Dados sintéticos · Open Finance sandbox';
/**
 * Live `/app` (compliance review E11, C8): the company card shows a real company's public data, so
 * "dados sintéticos" would be false there; the accounts are still only the Pluggy sandbox.
 */
export const LIVE_LABEL = 'Open Finance sandbox · dados públicos da Receita';

/**
 * Permanent seal (IDENTITY-AND-UI §4.8, §6.1 item 6; regulation rule 6.9): every number in the demo comes from
 * synthetic personas and Open Finance runs in the sandbox.
 */
/** The seal's text: /demo shows synthetic data; /app and /r show a real company's public data. */
export const sealLabel = (live: boolean): string => (live ? LIVE_LABEL : DEMO_LABEL);

/** Compact labels for the mobile track header, where the full seal does not fit (IDENTITY-AND-UI §5). */
const DEMO_SHORT = 'Dados sintéticos';
const LIVE_SHORT = 'Open Finance sandbox';

export function SandboxSeal({
  className,
  live = false,
  compact = false,
  label,
}: {
  className?: string;
  live?: boolean;
  compact?: boolean;
  /** A live analysis's own seal (features/live/data-origin.ts); overrides both the full and the compact label. */
  label?: string;
}) {
  return (
    <span
      data-testid="sandbox-seal"
      className={cn(
        'type-caption inline-flex items-center whitespace-nowrap gap-2 rounded-full border border-border bg-surface px-3 py-1 text-muted-foreground shadow-xs',
        className,
      )}
    >
      <span className="seal-dot size-1.5 rounded-full bg-cobalt" aria-hidden="true" />
      {label ?? (compact ? (live ? LIVE_SHORT : DEMO_SHORT) : live ? LIVE_LABEL : DEMO_LABEL)}
    </span>
  );
}
