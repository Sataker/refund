import { afterEach, describe, expect, it, vi } from 'vitest';
import { exclude, load, restore, sanitize, save, storageKey, variantKey } from './exclusions.ts';

describe('D31 exclusions (client state of /demo)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('the variant key ignores order and repeats; empty = the base view', () => {
    expect(variantKey([])).toBe('');
    expect(variantKey(['b', 'a', 'b'])).toBe('a,b');
  });

  it('exclude then restore returns the original set (undo)', () => {
    const base = new Set(['x']);
    const after = exclude(base, ['b', 'c']);
    expect(variantKey(after)).toBe('b,c,x');
    expect(variantKey(restore(after, ['b', 'c']))).toBe(variantKey(base));
    expect(base).toEqual(new Set(['x'])); // never mutated
  });

  it('stored ids are trusted only when the build offered them', () => {
    const allowed = new Set(['a', 'b']);
    expect(sanitize(['a', 'z', 3, null], allowed)).toEqual(new Set(['a']));
    expect(sanitize('a', allowed)).toEqual(new Set());
  });

  it('sessionStorage round-trip, and a throwing storage never breaks the page', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
        removeItem: (k: string) => store.delete(k),
      },
    });
    const key = storageKey('dev-exportador');
    save(key, new Set(['b', 'a']));
    expect(store.get(key)).toBe('["a","b"]');
    expect(load(key, new Set(['a', 'b']))).toEqual(new Set(['a', 'b']));
    save(key, new Set());
    expect(store.has(key)).toBe(false);

    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
        removeItem: () => {
          throw new Error('blocked');
        },
      },
    });
    expect(load(key, new Set(['a']))).toEqual(new Set());
    expect(() => save(key, new Set(['a']))).not.toThrow();
  });
});
