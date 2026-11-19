// D31 (b) in /demo: the owner's duplicate exclusions as client state. No database in /demo, so the state lives in
// React (and sessionStorage, best effort). The views themselves are built at build time by the pipeline for every
// combination (`variantKey`); this module only picks one. /app will persist the same transaction ids (E14).

/** The precomputed view for a set of excluded transactions: sorted ids, comma-joined ('' = nothing excluded). */
export function variantKey(excluded: Iterable<string>): string {
  return [...new Set(excluded)].sort().join(',');
}

export function exclude(current: ReadonlySet<string>, ids: readonly string[]): Set<string> {
  const next = new Set(current);
  for (const id of ids) next.add(id);
  return next;
}

export function restore(current: ReadonlySet<string>, ids: readonly string[]): Set<string> {
  const next = new Set(current);
  for (const id of ids) next.delete(id);
  return next;
}

/** Only ids the build offered (a stale or tampered sessionStorage value is dropped, never trusted). */
export function sanitize(raw: unknown, allowed: ReadonlySet<string>): Set<string> {
  if (!Array.isArray(raw)) return new Set();
  return new Set(raw.filter((id): id is string => typeof id === 'string' && allowed.has(id)));
}

export const storageKey = (persona: string) => `refund:financas:excluidos:${persona}`;

export function load(key: string, allowed: ReadonlySet<string>): Set<string> {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw === null ? new Set() : sanitize(JSON.parse(raw), allowed);
  } catch {
    return new Set(); // private mode, blocked storage or a broken value: start clean
  }
}

export function save(key: string, excluded: ReadonlySet<string>): void {
  try {
    if (excluded.size === 0) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, JSON.stringify([...excluded].sort()));
  } catch {
    // Storage unavailable: the exclusion still holds for this page.
  }
}
