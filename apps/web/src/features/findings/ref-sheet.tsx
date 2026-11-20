import { ExternalLink, Scale } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCivilDate } from './text';

/** A cited provision with its verbatim text from @refund/law (CLAUDE.md rule 3: never typed by hand). */
export interface Excerpt {
  id: string;
  label: string;
  url: string;
  text: string;
  capturedAt: string;
}

/**
 * The "§" that opens the official source (IDENTITY-AND-UI Screen 6: "sheet with the official excerpt, highlighted in
 * amber, link to the source, date of the capture"). A <details>: works without JS, inside server pages and in print.
 */
export function RefSheet({
  excerpt,
  open = false,
  className,
}: {
  excerpt: Excerpt;
  open?: boolean;
  className?: string;
}) {
  return (
    <details
      open={open}
      className={cn('group/ref max-w-full', className)}
      data-testid="ref-sheet"
      data-ref={excerpt.id}
    >
      {/* E21: 14px sans, wraps instead of truncating, 44px tall, strong edge (it is a control). */}
      <summary className="type-small inline-flex min-h-11 max-w-full cursor-pointer list-none items-center gap-2 rounded-md border border-strong-border bg-surface px-3 py-1.5 text-left text-foreground transition-colors duration-(--dur-fast) hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
        <Scale
          className="size-4 shrink-0 text-muted-foreground"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <span className="min-w-0 break-words">§ {excerpt.label}</span>
      </summary>
      <div className="mt-2 flex flex-col gap-3 rounded-md border border-border bg-surface p-4">
        {excerpt.text === '' ? null : (
          <p className="max-w-[65ch] text-base whitespace-pre-line text-foreground">
            <mark className="rounded-[2px] bg-found-soft px-0.5 text-foreground">
              {excerpt.text}
            </mark>
          </p>
        )}
        <p className="type-small flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
          <a
            href={excerpt.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1 font-medium text-cobalt underline-offset-4 hover:underline"
          >
            Abrir a fonte oficial
            <ExternalLink className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
            <span className="sr-only">(abre em nova aba)</span>
          </a>
          <span>texto conferido em {formatCivilDate(excerpt.capturedAt)}</span>
        </p>
      </div>
    </details>
  );
}
