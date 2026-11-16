'use client';

import { X } from 'lucide-react';
import { Dialog, Popover } from 'radix-ui';
import { useSyncExternalStore } from 'react';
import { LawSeal } from '@/components/brand/law-seal';
import { cn } from '@/lib/utils';
import { SEAL_STYLE } from './seal-style.tsx';
import { DEDUCTIBLE_TEXT, SEAL_LABEL, sealDetail } from './text.ts';
import type {
  FinancialGroupId,
  SealFinding,
  TaxSeal as TaxSealData,
  TaxSealKind,
} from './types.ts';

// TaxSeal (IDENTITY-AND-UI §4.8, Screen 5b): icon + label, never color alone. Tap opens a popover (desktop) or a
// bottom sheet (mobile) with the linked finding's title, its own amount, the LawSeal and "Ver achado".

const DESKTOP = '(min-width: 1024px)';
const subscribe = (onChange: () => void) => {
  const mq = window.matchMedia(DESKTOP);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
};
const useDesktop = () =>
  useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DESKTOP).matches,
    () => true,
  );

export interface TaxSealProps {
  groupId: FinancialGroupId;
  seal: Pick<TaxSealData, 'kind' | 'ruleIds'> & { ref: { label: string; url: string } };
  findings: SealFinding[];
  /** Compact: icon + label only (mobile cards, recurring rows). */
  compact?: boolean;
}

/** The chip's trailing text: one finding → its own amount or title; several → "n achados". */
function chipDetail(kind: TaxSealKind, findings: SealFinding[]): string {
  if (findings.length > 1) return `${findings.length} achados`;
  return sealDetail(kind, findings[0]);
}

function SealBody({
  kind,
  findings,
  lawRef,
}: {
  kind: TaxSealKind;
  findings: SealFinding[];
  lawRef: { label: string; url: string };
}) {
  if (kind === 'deductible') {
    return (
      <div className="flex flex-col gap-3">
        <p className="type-small text-foreground">{DEDUCTIBLE_TEXT}</p>
        <LawSeal lawRef={lawRef} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-4">
        {findings.map((f) => (
          <li key={f.ruleId} className="flex flex-col gap-1.5">
            <p className="type-small font-medium text-foreground">{f.title}</p>
            {kind === 'risk' ||
            kind === 'attention' ||
            (kind === 'money_to_receive' && f.range === null) ? null : (
              <p className="num type-small text-found-ink">{sealDetail(kind, f)}</p>
            )}
            <a
              href={f.href}
              data-testid={`fv-seal-link-${f.ruleId}`}
              className="type-small w-fit font-medium text-cobalt underline-offset-4 hover:underline"
            >
              Ver achado →
            </a>
          </li>
        ))}
      </ul>
      <LawSeal lawRef={lawRef} />
    </div>
  );
}

export function TaxSeal({ groupId, seal, findings, compact = false }: TaxSealProps) {
  const desktop = useDesktop();
  const style = SEAL_STYLE[seal.kind];
  const Icon = style.icon;
  const detail = chipDetail(seal.kind, findings);
  const trigger = (
    <button
      type="button"
      data-testid={`fv-seal-${groupId}-${seal.kind}`}
      data-kind={seal.kind}
      aria-label={`${SEAL_LABEL[seal.kind]}${detail === '' ? '' : `: ${detail}`}. Ver detalhes`}
      className={cn(
        'relative inline-flex max-w-full min-h-6 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-left text-[12px] leading-5 text-foreground transition-colors duration-(--dur-fast) hover:border-strong-border after:absolute after:-inset-y-2.5 after:inset-x-0',
        style.chip,
      )}
    >
      <Icon
        className={cn('size-3.5 shrink-0', style.iconClass)}
        strokeWidth={2}
        aria-hidden="true"
      />
      <span className="shrink-0 font-medium">{SEAL_LABEL[seal.kind]}</span>
      {compact || detail === '' ? null : (
        <span className="num hidden min-w-0 max-w-[30rem] truncate text-muted-foreground lg:inline">
          · {detail}
        </span>
      )}
      <span aria-hidden="true" className="shrink-0 text-muted-foreground">
        ›
      </span>
    </button>
  );
  const body = <SealBody kind={seal.kind} findings={findings} lawRef={seal.ref} />;
  const heading = (
    <span className="inline-flex items-center gap-1.5">
      <Icon className={cn('size-4', style.iconClass)} aria-hidden="true" />
      {SEAL_LABEL[seal.kind]}
    </span>
  );

  if (desktop) {
    return (
      <Popover.Root>
        <Popover.Trigger asChild>{trigger}</Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={8}
            collisionPadding={16}
            className="z-50 w-[360px] max-w-[calc(100vw-32px)] rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-lg outline-none"
          >
            <p className="type-caption mb-3 font-medium text-muted-foreground">{heading}</p>
            {body}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    );
  }
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-2xl border-t border-border bg-popover px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] text-popover-foreground shadow-lg outline-none">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-surface-3" aria-hidden="true" />
          <div className="mb-3 flex items-center justify-between gap-3">
            <Dialog.Title className="type-small font-medium text-foreground">
              {heading}
            </Dialog.Title>
            <Dialog.Close
              aria-label="Fechar"
              className="relative inline-flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-2"
            >
              <X className="size-4" aria-hidden="true" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            O achado do motor ligado a este selo e o artigo da lei.
          </Dialog.Description>
          {body}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
