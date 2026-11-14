import { Scale } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface LawSealRef {
  /** "LC 123/2006, art. 18, § 5º-J" — from `LegalRef.label` / `@refund/law`, never typed by hand (rule 3). */
  label: string;
  /** Primary source (Planalto, DOU, Receita). */
  url: string;
}

/**
 * Law seal (IDENTITY-AND-UI §4.8): 12px mono chip with the cited provision. For now it opens the primary source
 * in a new tab; the sheet with the highlighted excerpt arrives with the finding detail (Screen 6).
 */
export function LawSeal({ lawRef, className }: { lawRef: LawSealRef; className?: string }) {
  return (
    <a
      href={lawRef.url}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="law-seal"
      aria-label={`${lawRef.label}: abrir o texto oficial em nova aba`}
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-sm border border-border bg-surface px-2 py-0.5 font-mono text-[12px] leading-5 text-foreground no-underline transition-colors duration-(--dur-fast) hover:border-strong-border',
        className,
      )}
    >
      <Scale
        className="size-3 shrink-0 text-muted-foreground"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <span className="truncate">§ {lawRef.label}</span>
    </a>
  );
}
