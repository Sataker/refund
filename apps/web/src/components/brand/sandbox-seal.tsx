import { cn } from '@/lib/utils';

/**
 * Permanent seal (IDENTITY-AND-UI §4.8, §6.1 item 6; regulation rule 6.9): every number in the demo comes from
 * synthetic personas and Open Finance runs in the sandbox.
 */
export function SandboxSeal({ className }: { className?: string }) {
  return (
    <span
      data-testid="sandbox-seal"
      className={cn(
        'type-caption inline-flex items-center whitespace-nowrap gap-2 rounded-full border border-border bg-surface px-3 py-1 text-muted-foreground shadow-xs',
        className,
      )}
    >
      <span className="seal-dot size-1.5 rounded-full bg-cobalt" aria-hidden="true" />
      Dados sintéticos · Open Finance sandbox
    </span>
  );
}
