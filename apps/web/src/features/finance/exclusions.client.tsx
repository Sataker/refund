'use client';

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { exclude, load, restore, save, variantKey } from './exclusions.ts';

// D31 (b): which precomputed view is on screen. The variants (one per combination of exclusions the build offered)
// are server-rendered; this component only mounts the one that matches the owner's choices.

interface ExclusionApi {
  /** Excluded ids that have a precomputed view, so the button can be offered. */
  canExclude: (ids: readonly string[]) => boolean;
  exclude: (ids: readonly string[]) => void;
  restore: (ids: readonly string[]) => void;
}

const Ctx = createContext<ExclusionApi | null>(null);

export function ExclusionSwitch({
  variants,
  storage,
  initial,
  persist,
}: {
  /** Keyed by `variantKey(excluded ids)`; '' is the view with nothing excluded. */
  variants: Record<string, ReactNode>;
  storage: string;
  /** /app: the stored exclusions (server state wins over sessionStorage). */
  initial?: readonly string[];
  /** /app: stores the new set on the server (server action). */
  persist?: (excluded: string[]) => Promise<unknown>;
}) {
  const allowed = useMemo(
    () => new Set(Object.keys(variants).flatMap((k) => (k === '' ? [] : k.split(',')))),
    [variants],
  );
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(() => new Set(initial ?? []));
  const [announcement, setAnnouncement] = useState('');
  /** Where focus goes once the new view is on screen (the old buttons are gone by then). */
  const focusNext = useRef<
    { kind: 'removed' } | { kind: 'restored'; ids: readonly string[] } | null
  >(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs after each new view is committed (keyed on excluded)
  useEffect(() => {
    const next = focusNext.current;
    if (next === null) return;
    focusNext.current = null;
    const target =
      next.kind === 'removed'
        ? document.getElementById('fv-excluded-heading')
        : (next.ids
            .map((id) => document.querySelector<HTMLElement>(`[data-testid="fv-remove-${id}"]`))
            .find((el) => el !== null) ??
          document.getElementById('fv-excluded-heading') ??
          document.getElementById('fv-duplicates-heading'));
    target?.focus();
  }, [excluded]);
  useEffect(() => {
    if (initial !== undefined) return;
    const stored = load(storage, allowed);
    if (variants[variantKey(stored)] !== undefined) setExcluded(stored);
  }, [storage, allowed, variants, initial]);
  const api = useMemo<ExclusionApi>(
    () => ({
      canExclude: (ids) => variants[variantKey(exclude(excluded, ids))] !== undefined,
      exclude: (ids) => {
        const next = exclude(excluded, ids);
        if (variants[variantKey(next)] === undefined) return;
        focusNext.current = { kind: 'removed' };
        setAnnouncement('Lançamento removido. Os totais desta tela foram recalculados.');
        setExcluded(next);
        keep(next, storage, persist);
      },
      restore: (ids) => {
        const next = restore(excluded, ids);
        focusNext.current = { kind: 'restored', ids };
        setAnnouncement('Lançamento de volta nos totais desta tela.');
        setExcluded(next);
        keep(next, storage, persist);
      },
    }),
    [excluded, variants, storage, persist],
  );
  return (
    <Ctx.Provider value={api}>
      {variants[variantKey(excluded)] ?? variants['']}
      <p role="status" className="sr-only" data-testid="fv-exclusion-status">
        {announcement}
      </p>
    </Ctx.Provider>
  );
}

/** /app stores the set on the server (server action); /demo in sessionStorage. */
function keep(
  next: ReadonlySet<string>,
  storage: string,
  persist: ((excluded: string[]) => Promise<unknown>) | undefined,
): void {
  if (persist) void persist([...next].sort()).catch(() => undefined);
  else save(storage, next);
}

/** "Remover repetido" on a duplicate suspect: removes every occurrence but the first. */
export function RemoveDuplicateButton({
  ids,
  testId,
  fallback,
}: {
  ids: string[];
  testId: string;
  /** Shown when no prebuilt view covers this removal (past the /demo cap): the old "Confirmar →" link. */
  fallback: ReactNode;
}) {
  const api = useContext(Ctx);
  if (api === null || ids.length === 0 || !api.canExclude(ids)) return fallback;
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={() => api.exclude(ids)}
      className="type-small inline-flex min-h-11 w-fit items-center rounded-md border border-border px-3 font-medium text-foreground hover:bg-surface-2 lg:min-h-9"
    >
      {ids.length === 1
        ? 'Remover o lançamento repetido'
        : `Remover os ${ids.length} lançamentos repetidos`}
    </button>
  );
}

/** "Desfazer" on an excluded payment: it comes back into every total. */
export function UndoExclusionButton({ id, label }: { id: string; label: string }) {
  // `label`: "{rótulo}, {valor}, {data}" (the caller formats it).
  const api = useContext(Ctx);
  if (api === null) return null;
  return (
    <button
      type="button"
      data-testid={`fv-undo-${id}`}
      aria-label={`Desfazer a remoção de ${label}`}
      onClick={() => api.restore([id])}
      className="type-small inline-flex min-h-11 items-center font-medium text-cobalt underline-offset-4 hover:underline lg:min-h-0"
    >
      Desfazer
    </button>
  );
}
