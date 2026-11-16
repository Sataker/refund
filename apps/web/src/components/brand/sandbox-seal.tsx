import { cn } from '@/lib/utils';

const DEMO_LABEL = 'Dados sintéticos · Open Finance sandbox';
/**
 * Live `/app` (compliance review E11, C8): the company card shows a real company's public data, so
 * "dados sintéticos" would be false there; the accounts are still only the Pluggy sandbox.
 */
const LIVE_LABEL = 'Open Finance sandbox · dados públicos da Receita';

/**
 * Permanent seal (IDENTITY-AND-UI §4.8, §6.1 item 6; regulation rule 6.9): every number in the demo comes from
 * synthetic personas and Open Finance runs in the sandbox.
 */
export function SandboxSeal({ className, live = false }: { className?: string; live?: boolean }) {
  return (
    <span
      data-testid="sandbox-seal"
      className={cn(
        'type-caption inline-flex items-center whitespace-nowrap gap-2 rounded-full border border-border bg-surface px-3 py-1 text-muted-foreground shadow-xs',
        className,
      )}
    >
      <span className="seal-dot size-1.5 rounded-full bg-cobalt" aria-hidden="true" />
      {live ? LIVE_LABEL : DEMO_LABEL}
    </span>
  );
}
