import type { LucideIcon } from 'lucide-react';
import { ArrowDown, BadgeCheck, RotateCcw, ShieldAlert, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SEAL_LABEL } from './text.ts';
import type { TaxSealKind } from './types.ts';

/** Screen 5b token table: one icon and tint per kind; no green (§2.4); readable without color (icon + label). */
export const SEAL_STYLE: Record<
  TaxSealKind,
  { icon: LucideIcon; chip: string; iconClass: string }
> = {
  money_to_receive: {
    icon: RotateCcw,
    chip: 'border-chart-5/45 bg-chart-5/10',
    iconClass: 'text-chart-5',
  },
  lower_tax: {
    icon: ArrowDown,
    chip: 'border-found/60 bg-found-soft',
    iconClass: 'text-found-ink',
  },
  deductible: { icon: BadgeCheck, chip: 'border-border bg-surface-2', iconClass: 'text-cobalt' },
  generates_credit: {
    icon: BadgeCheck,
    chip: 'border-border bg-surface-2',
    iconClass: 'text-subtle',
  },
  attention: {
    icon: TriangleAlert,
    chip: 'border-warning/40 bg-warning-soft',
    iconClass: 'text-warning',
  },
  risk: { icon: ShieldAlert, chip: 'border-risk/40 bg-risk-soft', iconClass: 'text-risk' },
};

/** Non-interactive mark (icon + label) for secondary rows; the clickable seal lives on the group. */
export function SealMark({ kind, className }: { kind: TaxSealKind; className?: string }) {
  const { icon: Icon, iconClass } = SEAL_STYLE[kind];
  return (
    <span
      className={cn('type-caption inline-flex items-center gap-1 text-muted-foreground', className)}
    >
      <Icon className={cn('size-3.5', iconClass)} aria-hidden="true" />
      {SEAL_LABEL[kind]}
    </span>
  );
}
