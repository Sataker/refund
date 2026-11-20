import { FlaskConical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { bankBannerText, type DataOrigin } from './data-origin';

// The persistent "these are not your statements" banner of a live analysis (C2). Rendered on every screen of the
// analysis (Screen 4, the shell, /r/[token]); nothing to close: it stays as long as the data is sample or sandbox.

export function OriginBanner({
  origin,
  companyName,
  className,
}: {
  origin: DataOrigin;
  companyName: string;
  className?: string;
}) {
  const text = bankBannerText(origin, companyName);
  if (!text) return null;
  return (
    <p
      role="note"
      data-testid="data-origin-banner"
      data-bank={origin.bank}
      className={cn(
        'type-small flex items-start gap-2 rounded-md border border-warning bg-warning-soft px-3 py-2 font-medium text-foreground',
        className,
      )}
    >
      <FlaskConical className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
      <span className="min-w-0">{text}</span>
    </p>
  );
}
