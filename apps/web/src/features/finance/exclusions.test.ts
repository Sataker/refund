import {
  buildFinancialView,
  duplicateRemovals,
  type NormalizedTransaction,
} from '@refund/pipeline';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  exclude,
  exclusionSets,
  load,
  restore,
  sanitize,
  save,
  storageKey,
  variantKey,
} from './exclusions.ts';

function tx(
  id: string,
  holder: 'PF' | 'PJ',
  date: string,
  amountCents: number,
): NormalizedTransaction {
  return {
    id,
    accountId: holder === 'PF' ? 'acc-pf' : 'acc-pj',
    holder,
    date: date as NormalizedTransaction['date'],
    month: date.slice(0, 7) as NormalizedTransaction['month'],
    amountCents,
    direction: 'outflow',
    description: 'LOJA',
    method: 'PIX',
    counterparty: {
      document: { type: 'CNPJ', hmac: null, publicValue: 'RFLOJA01000100', mask: 'x' },
      name: 'LOJA LTDA',
      cnae: null,
    },
    sourceCategory: null,
    mcc: null,
    installment: null,
  };
}

describe('D31 variants: every combination of removals (demo-view.ts)', () => {
  it('two suspects in different holders → 4 views, each keyed by its sorted ids, totals consistent', () => {
    const txs = [
      tx('pj-1', 'PJ', '2026-10-10', 30_000),
      tx('pj-2', 'PJ', '2026-10-10', 30_000),
      tx('pf-1', 'PF', '2026-10-12', 5_000),
      tx('pf-2', 'PF', '2026-10-12', 5_000),
    ];
    const input = {
      referenceMonth: '2026-10' as const,
      regime: 'SIMPLES' as const,
      transactions: txs,
      classifications: txs.map((t) => ({
        transactionId: t.id,
        category: 'operating_expense' as const,
        confidence: 0.9,
        origin: 'rule' as const,
        reason: 'teste',
        status: 'applied' as const,
      })),
      findings: [],
    };
    const base = buildFinancialView(input);
    if (!base.ok) throw new Error('base');
    const suspects = [base.value.pj, base.value.pf]
      .flatMap((h) => h?.duplicates ?? [])
      .map(duplicateRemovals);
    expect(suspects).toEqual([['pj-2'], ['pf-2']]);
    const sets = exclusionSets(suspects);
    expect(sets.map(variantKey)).toEqual(['', 'pj-2', 'pf-2', 'pf-2,pj-2']);
    const totals = sets.map((ids) => {
      const v = buildFinancialView({ ...input, excludedTransactionIds: ids });
      if (!v.ok) throw new Error('variant');
      return [v.value.pj?.outflow12m, v.value.pf?.outflow12m, v.value.excluded.length];
    });
    expect(totals).toEqual([
      [60_000, 10_000, 0],
      [30_000, 10_000, 1],
      [60_000, 5_000, 1],
      [30_000, 5_000, 2],
    ]);
    // The client finds each combination by its key, whatever the order the owner clicked.
    expect(variantKey(exclude(exclude(new Set(), ['pf-2']), ['pj-2']))).toBe('pf-2,pj-2');
  });
});

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
