import { cn } from '@/lib/utils';

/** Fixed label (IDENTITY-AND-UI §2.3 "Fixed label", §4.8). Always visible next to any R$. */
export const DISCLAIMER_TEXT = 'Estimativa informativa. Valide com seu contador antes de agir.';

export function Disclaimer({
  size = 'small',
  className,
}: {
  size?: 'small' | 'caption';
  className?: string;
}) {
  return (
    <p
      data-testid="disclaimer"
      className={cn(
        size === 'small' ? 'type-small' : 'type-caption',
        'text-muted-foreground',
        className,
      )}
    >
      {DISCLAIMER_TEXT}
    </p>
  );
}
