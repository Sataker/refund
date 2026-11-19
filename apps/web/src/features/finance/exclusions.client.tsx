'use client';

import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
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
}: {
  /** Keyed by `variantKey(excluded ids)`; '' is the view with nothing excluded. */
  variants: Record<string, ReactNode>;
  storage: string;
}) {
  const allowed = useMemo(
    () => new Set(Object.keys(variants).flatMap((k) => (k === '' ? [] : k.split(',')))),
    [variants],
  );
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const stored = load(storage, allowed);
    if (variants[variantKey(stored)] !== undefined) setExcluded(stored);
  }, [storage, allowed, variants]);
  const api = useMemo<ExclusionApi>(
    () => ({
      canExclude: (ids) => variants[variantKey(exclude(excluded, ids))] !== undefined,
      exclude: (ids) => {
        const next = exclude(excluded, ids);
        if (variants[variantKey(next)] === undefined) return;
        setExcluded(next);
        save(storage, next);
      },
      restore: (ids) => {
        const next = restore(excluded, ids);
        setExcluded(next);
        save(storage, next);
      },
    }),
    [excluded, variants, storage],
  );
  return <Ctx.Provider value={api}>{variants[variantKey(excluded)] ?? variants['']}</Ctx.Provider>;
}

/** "Remover repetido" on a duplicate suspect: removes every occurrence but the first. */
export function RemoveDuplicateButton({ ids, testId }: { ids: string[]; testId: string }) {
  const api = useContext(Ctx);
  if (api === null || ids.length === 0 || !api.canExclude(ids)) return null;
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={() => api.exclude(ids)}
      className="type-small inline-flex min-h-11 w-fit items-center rounded-md border border-border px-3 font-medium text-foreground hover:bg-surface-2 lg:min-h-9"
    >
      {ids.length === 1 ? 'Remover o lançamento repetido' : `Remover os ${ids.length} repetidos`}
    </button>
  );
}

/** "Desfazer" on an excluded payment: it comes back into every total. */
export function UndoExclusionButton({ id, label }: { id: string; label: string }) {
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
