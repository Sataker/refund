import type { Sanitization } from '../types.ts';

// Side channel from the whitelist to the recorder: the sanitized object carries no metadata field (its
// type has none), so what was discarded is kept here, keyed by the object itself.
const registry = new WeakMap<object, Sanitization>();

export function markSanitized<T extends object>(value: T, info: Sanitization): T {
  registry.set(value, info);
  return value;
}

export function sanitizationOf(value: unknown): Sanitization | undefined {
  return value !== null && typeof value === 'object' ? registry.get(value) : undefined;
}

/** Merges the sanitization of several objects (e.g. the pages of a transaction listing). */
export function mergeSanitization(
  infos: (Sanitization | undefined)[],
  fallback: string,
): Sanitization {
  const present = infos.filter((i): i is Sanitization => i !== undefined);
  return {
    whitelist: present[0]?.whitelist ?? fallback,
    discardedFields: [...new Set(present.flatMap((i) => i.discardedFields))].sort(),
    replacedDocuments: present.reduce((n, i) => n + i.replacedDocuments, 0),
  };
}
