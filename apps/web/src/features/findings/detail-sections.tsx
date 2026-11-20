import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { type Excerpt, RefSheet } from './ref-sheet';

// The finding detail (Screen 6 + 6b), shared by /demo and /app so both read the same (E21 readability pass for
// 40–60+ owners): every block is a card with a real heading, body text at body-lg in ink, at most 65ch wide.

/** The card shell of every block on the detail page. */
export const DETAIL_CARD = 'rounded-xl border border-border bg-surface p-5 shadow-sm lg:p-6';

/** Running text on the detail page: 17–18px, ink, comfortable line length. */
export const DETAIL_TEXT = 'type-body-lg max-w-[65ch] text-foreground';

export function DetailCard({
  children,
  className,
  testId,
}: {
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <div className={cn(DETAIL_CARD, 'flex flex-col gap-4', className)} data-testid={testId}>
      {children}
    </div>
  );
}

export function DetailSection({
  id,
  title,
  icon,
  tone = 'default',
  testId,
  className,
  children,
}: {
  /** Id of the heading (the section is labelled by it). */
  id: string;
  title: ReactNode;
  icon?: ReactNode;
  /** `risk`: red left bar and a tinted fill ("Não faça"). */
  tone?: 'default' | 'risk';
  testId?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      data-testid={testId}
      className={cn(
        DETAIL_CARD,
        'flex flex-col gap-4',
        tone === 'risk' && 'border-l-4 border-l-risk bg-risk-fill',
        className,
      )}
    >
      <h2 id={id} className="type-h3 inline-flex items-center gap-2 text-foreground">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function BulletList({ items }: { items: readonly string[] }) {
  return (
    <ul className={cn(DETAIL_TEXT, 'flex list-disc flex-col gap-2 pl-6')}>
      {items.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  );
}

/** "A lei": the main norm open with its excerpt; the others wait under one line (UX review G2 L3). */
export function LawSection({ refs }: { refs: readonly Excerpt[] }) {
  const [main, ...others] = refs;
  if (!main) return null;
  return (
    <DetailSection id="lei-titulo" title="A lei" testId="law">
      <div className="flex flex-col gap-3">
        <RefSheet excerpt={main} open />
        {others.length > 0 ? (
          <details className="group" data-testid="more-refs">
            <summary className="type-small inline-flex min-h-11 cursor-pointer items-center font-medium text-cobalt">
              {others.length === 1 ? 'Outra norma usada' : `Outras ${others.length} normas usadas`}
            </summary>
            <div className="mt-2 flex flex-col gap-3">
              {others.map((e) => (
                <RefSheet key={e.id} excerpt={e} open={false} />
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </DetailSection>
  );
}

export function DoNotSection({ items }: { items: readonly string[] }) {
  if (items.length === 0) return null;
  return (
    <DetailSection
      id="naofaca-titulo"
      title="Não faça"
      tone="risk"
      testId="do-not"
      icon={<TriangleAlert className="size-5 text-risk" strokeWidth={1.75} aria-hidden="true" />}
    >
      <BulletList items={items} />
    </DetailSection>
  );
}

/** "Contrapartidas" and "Premissas": one card each, side by side on desktop. */
export function NotesSections({
  tradeoffs,
  assumptions = [],
}: {
  tradeoffs: readonly string[];
  assumptions?: readonly string[];
}) {
  if (tradeoffs.length === 0 && assumptions.length === 0) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
      {tradeoffs.length > 0 ? (
        <DetailSection id="contrapartidas-titulo" title="Contrapartidas" testId="tradeoffs">
          <BulletList items={tradeoffs} />
        </DetailSection>
      ) : null}
      {assumptions.length > 0 ? (
        <DetailSection id="premissas-titulo" title="Premissas" testId="assumptions">
          <BulletList items={assumptions} />
        </DetailSection>
      ) : null}
    </div>
  );
}
