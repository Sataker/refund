'use client';

import { X } from 'lucide-react';
import { type CSSProperties, useId, useLayoutEffect, useRef, useState } from 'react';
import { LawSeal } from '@/components/brand/law-seal';
import { cn } from '@/lib/utils';
import { SEAL_STYLE } from './seal-style.tsx';
import { DEDUCTIBLE_TEXT, SEAL_LABEL, sealDetail } from './text.ts';
import type { SealFinding, TaxSeal as TaxSealData, TaxSealKind } from './types.ts';

// TaxSeal (IDENTITY-AND-UI §4.8, Screen 5b): icon + label, never color alone. Tap opens the linked finding's title,
// its own amount, the LawSeal and "Ver achado": a popover next to the chip on desktop, a bottom sheet on mobile.
// Both are one native modal <dialog> (focus trap, Esc, focus back to the chip) — no popover library on this route
// (ARCHITECTURE §11.1 budget).

const DESKTOP = '(min-width: 1024px)';
const POPOVER_WIDTH = 360;
const GUTTER = 16;

export interface TaxSealProps {
  /** Test-id key of the group line (`groupKeys`). */
  groupKey: string;
  seal: Pick<TaxSealData, 'kind' | 'ruleIds'> & { ref: { label: string; url: string } };
  findings: SealFinding[];
}

/** The chip's trailing text: one finding → its own amount or first sentence; several → "n achados". */
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
              className="type-small inline-flex min-h-11 w-fit items-center font-medium text-cobalt underline-offset-4 hover:underline lg:min-h-0"
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

export function TaxSeal({ groupKey, seal, findings }: TaxSealProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  /** null: closed; `place` null = bottom sheet (mobile), else the popover's fixed position (desktop). */
  const [shown, setShown] = useState<{ place: CSSProperties | null } | null>(null);
  const place = shown?.place ?? null;
  const headingId = useId();
  const style = SEAL_STYLE[seal.kind];
  const Icon = style.icon;
  const detail = chipDetail(seal.kind, findings);

  // Opened after the render that applied its position, so it never flashes at the default spot.
  useLayoutEffect(() => {
    const el = dialog.current;
    if (shown !== null && el !== null && !el.open) el.showModal();
  }, [shown]);

  const open = () => {
    const chip = trigger.current;
    if (chip === null) return;
    if (!window.matchMedia(DESKTOP).matches) {
      setShown({ place: null });
      return;
    }
    // Popover: under the chip (above it when the chip sits low), clamped to the viewport.
    const r = chip.getBoundingClientRect();
    const left = Math.max(GUTTER, Math.min(r.left, window.innerWidth - POPOVER_WIDTH - GUTTER));
    setShown({
      place:
        r.bottom > window.innerHeight * 0.6
          ? { left, right: 'auto', top: 'auto', bottom: window.innerHeight - r.top + 8 }
          : { left, right: 'auto', top: r.bottom + 8, bottom: 'auto' },
    });
  };
  const close = () => dialog.current?.close();

  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={open}
        data-testid={`fv-seal-${groupKey}-${seal.kind}`}
        data-kind={seal.kind}
        aria-haspopup="dialog"
        aria-label={`${SEAL_LABEL[seal.kind]}${detail === '' ? '' : `: ${detail}`}. Ver detalhes`}
        className={cn(
          'relative inline-flex min-h-6 max-w-full items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-left text-[12px] leading-5 text-foreground transition-colors duration-(--dur-fast) after:absolute after:inset-x-0 after:-inset-y-2.5 hover:border-strong-border',
          style.chip,
        )}
      >
        <Icon
          className={cn('size-3.5 shrink-0', style.iconClass)}
          strokeWidth={2}
          aria-hidden="true"
        />
        <span className="shrink-0 font-medium">{SEAL_LABEL[seal.kind]}</span>
        {detail === '' ? null : (
          <span className="num hidden min-w-0 max-w-[30rem] truncate text-muted-foreground lg:inline">
            · {detail}
          </span>
        )}
        <span aria-hidden="true" className="shrink-0 text-muted-foreground">
          ›
        </span>
      </button>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Esc closes the native modal dialog; the click only catches the backdrop */}
      <dialog
        ref={dialog}
        aria-labelledby={headingId}
        onClick={(e) => {
          if (e.target === dialog.current) close(); // a click on the backdrop
        }}
        onClose={() => setShown(null)}
        style={place ?? undefined}
        className={cn(
          'm-0 max-h-[80vh] overflow-y-auto border-border bg-popover p-0 text-popover-foreground shadow-lg',
          place === null
            ? 'fixed inset-x-0 top-auto bottom-0 w-full max-w-none rounded-t-2xl border-t backdrop:bg-black/40'
            : 'fixed w-[360px] max-w-[calc(100vw-32px)] rounded-lg border backdrop:bg-transparent',
        )}
      >
        <div
          className={cn(
            'flex flex-col',
            place === null ? 'px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))]' : 'p-4',
          )}
        >
          {place === null ? (
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-surface-3" aria-hidden="true" />
          ) : null}
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2
              id={headingId}
              className="type-small inline-flex items-center gap-1.5 font-medium text-foreground"
            >
              <Icon className={cn('size-4', style.iconClass)} aria-hidden="true" />
              {SEAL_LABEL[seal.kind]}
            </h2>
            <button
              type="button"
              onClick={close}
              aria-label="Fechar"
              className="-mr-2 inline-flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-2"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
          <SealBody kind={seal.kind} findings={findings} lawRef={seal.ref} />
        </div>
      </dialog>
    </>
  );
}
