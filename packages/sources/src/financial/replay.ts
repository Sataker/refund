import { z } from 'zod';
import { FIXTURES } from '../../fixtures/index.ts';
import { findFixture } from '../fixtures/envelope.ts';
import { fail, ok } from '../result.ts';
import type {
  CivilDate,
  FinancialProvider,
  FixtureSource,
  ProviderContext,
  ProviderError,
  Result,
  SourceAccount,
  SourceIdentity,
  SourceItem,
  SourceTransaction,
} from '../types.ts';
import {
  parseWith,
  sourceAccountSchema,
  sourceIdentitySchema,
  sourceItemSchema,
  sourceTransactionSchema,
} from './schema.ts';

// Recorded Pluggy sandbox (`fixtures/pluggy-sandbox/<scenario>/`, ARCHITECTURE §5.1): `pluggy.item`,
// `pluggy.accounts` and `pluggy.identity` keyed by item id, `pluggy.transactions` keyed by account id.

function load<T>(
  fixtures: readonly unknown[],
  source: FixtureSource,
  key: string,
  schema: z.ZodType,
): Result<T, ProviderError> {
  const found = findFixture(fixtures, source, key);
  if (!found.ok) return found;
  const value = parseWith<T>(schema, found.value.data);
  return value === null
    ? fail('UNEXPECTED_RESPONSE', 'replay', 'Fixture do Open Finance fora do formato.', {
        recoverable: false,
      })
    : ok(value);
}

export class ReplayFinancial implements FinancialProvider {
  readonly name = 'replay' as const;
  private readonly fixtures: readonly unknown[];
  private readonly pageSize: number;

  constructor(options: { fixtures?: readonly unknown[]; pageSize?: number } = {}) {
    this.fixtures = options.fixtures ?? FIXTURES;
    this.pageSize = Math.max(1, options.pageSize ?? 500);
  }

  async getItem(itemId: string, _ctx: ProviderContext): Promise<Result<SourceItem, ProviderError>> {
    return load<SourceItem>(this.fixtures, 'pluggy.item', itemId, sourceItemSchema);
  }

  async listAccounts(
    itemId: string,
    _ctx: ProviderContext,
  ): Promise<Result<SourceAccount[], ProviderError>> {
    return load<SourceAccount[]>(
      this.fixtures,
      'pluggy.accounts',
      itemId,
      z.array(sourceAccountSchema),
    );
  }

  async *listTransactions(
    accountSourceId: string,
    period: { from: CivilDate; to: CivilDate },
    _ctx: ProviderContext,
  ): AsyncIterable<Result<SourceTransaction[], ProviderError>> {
    const all = load<SourceTransaction[]>(
      this.fixtures,
      'pluggy.transactions',
      accountSourceId,
      z.array(sourceTransactionSchema),
    );
    if (!all.ok) {
      yield all;
      return;
    }
    const inPeriod = all.value.filter((t) => t.date >= period.from && t.date <= period.to);
    for (let i = 0; i < inPeriod.length; i += this.pageSize) {
      yield ok(inPeriod.slice(i, i + this.pageSize));
    }
  }

  async getIdentity(
    itemId: string,
    _ctx: ProviderContext,
  ): Promise<Result<SourceIdentity | null, ProviderError>> {
    const r = load<SourceIdentity>(this.fixtures, 'pluggy.identity', itemId, sourceIdentitySchema);
    // A sandbox connector without Identity is not an error (E.2 falls back to rule 3 and cards).
    // The item itself must be recorded, otherwise the missing fixture is reported as such.
    if (!r.ok && r.error.code === 'FIXTURE_MISSING') {
      const item = findFixture(this.fixtures, 'pluggy.item', itemId);
      return item.ok ? ok(null) : item;
    }
    return r;
  }
}
