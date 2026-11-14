import { fail, ok } from '../result.ts';
import type {
  CivilDate,
  FinancialProvider,
  ProviderContext,
  ProviderError,
  Result,
  SourceAccount,
  SourceIdentity,
  SourceItem,
  SourceTransaction,
} from '../types.ts';

/**
 * Structural shape of a persona dataset (`@refund/personas`' `PersonaData` satisfies it). Declared here
 * because `@refund/personas` depends on `@refund/sources`: importing it back would be a cycle
 * (ARCHITECTURE §3.3, rule 8), so the caller injects the data.
 */
export interface PersonaDataset {
  items: readonly {
    holder: 'PF' | 'PJ';
    item: SourceItem;
    identity: SourceIdentity;
    accounts: readonly { account: SourceAccount; transactions: readonly SourceTransaction[] }[];
  }[];
}

export const DEFAULT_PAGE_SIZE = 500;

function notFound(what: string): { ok: false; error: ProviderError } {
  return fail('NOT_FOUND', 'persona', `${what} não existe nos dados de exemplo.`, {
    recoverable: false,
  });
}

/** Synthetic persona data in Pluggy's sanitized format (ARCHITECTURE §4.3). No I/O. */
export class PersonaFinancial implements FinancialProvider {
  readonly name = 'persona' as const;
  private readonly pageSize: number;
  private readonly data: PersonaDataset;

  constructor(data: PersonaDataset, options: { pageSize?: number } = {}) {
    this.data = data;
    this.pageSize = Math.max(1, options.pageSize ?? DEFAULT_PAGE_SIZE);
  }

  private find(itemId: string) {
    return this.data.items.find((i) => i.item.sourceId === itemId);
  }

  async getItem(itemId: string, _ctx: ProviderContext): Promise<Result<SourceItem, ProviderError>> {
    const found = this.find(itemId);
    return found ? ok(found.item) : notFound('Conexão');
  }

  async listAccounts(
    itemId: string,
    _ctx: ProviderContext,
  ): Promise<Result<SourceAccount[], ProviderError>> {
    const found = this.find(itemId);
    return found ? ok(found.accounts.map((a) => a.account)) : notFound('Conexão');
  }

  async *listTransactions(
    accountSourceId: string,
    period: { from: CivilDate; to: CivilDate },
    _ctx: ProviderContext,
  ): AsyncIterable<Result<SourceTransaction[], ProviderError>> {
    const account = this.data.items
      .flatMap((i) => i.accounts)
      .find((a) => a.account.sourceId === accountSourceId);
    if (!account) {
      yield notFound('Conta');
      return;
    }
    const inPeriod = account.transactions.filter(
      (t) => t.date >= period.from && t.date <= period.to,
    );
    for (let i = 0; i < inPeriod.length; i += this.pageSize) {
      yield ok(inPeriod.slice(i, i + this.pageSize));
    }
  }

  async getIdentity(
    itemId: string,
    _ctx: ProviderContext,
  ): Promise<Result<SourceIdentity | null, ProviderError>> {
    const found = this.find(itemId);
    return found ? ok(found.identity) : notFound('Conexão');
  }
}
