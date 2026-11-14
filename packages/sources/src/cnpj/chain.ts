import { fail, ok } from '../result.ts';
import type {
  Cnpj,
  CnpjProvider,
  ExternalCachePort,
  ProviderContext,
  ProviderError,
  PublicCompany,
  Result,
} from '../types.ts';
import { parsePublicCompany } from './schema.ts';

export interface ChainedCnpjOptions {
  /** Live providers in order: BrasilAPI → CNPJ.ws (ARCHITECTURE §4.3). */
  live: readonly CnpjProvider[];
  /** `external_cache`: written on a live hit, read (even expired) when every live provider fails. */
  cache?: ExternalCachePort;
  /** Last resort for persona CNPJs, and the only provider in `replay` mode. */
  replay?: CnpjProvider;
}

/**
 * Fallback chain (ARCHITECTURE §4.3, §12): BrasilAPI → CNPJ.ws → expired cache (the UI shows "dados de
 * até N dias" from `fetchedAt`) → replay (persona CNPJ) → `NOT_FOUND` when every live source said so,
 * otherwise `UNAVAILABLE`. Never throws: the cache port is foreign code, so its failures are swallowed.
 */
export class ChainedCnpj implements CnpjProvider {
  private readonly options: ChainedCnpjOptions;
  constructor(options: ChainedCnpjOptions) {
    this.options = options;
  }

  async lookup(cnpj: Cnpj, ctx: ProviderContext): Promise<Result<PublicCompany, ProviderError>> {
    const { live, cache, replay } = this.options;
    if (ctx.mode === 'replay') {
      return replay
        ? replay.lookup(cnpj, ctx)
        : fail('FIXTURE_MISSING', 'replay', 'Dados de exemplo indisponíveis.', {
            recoverable: false,
          });
    }

    const errors: ProviderError[] = [];
    for (const provider of live) {
      const r = await provider.lookup(cnpj, ctx);
      if (r.ok) {
        try {
          await cache?.set?.('cnpj', cnpj, r.value, r.value.fetchedAt);
        } catch {
          ctx.log?.('provider.failure', { source: 'external_cache', code: 'WRITE_FAILED' });
        }
        return r;
      }
      errors.push(r.error);
      ctx.log?.('provider.failure', { source: r.error.source, code: r.error.code });
      ctx.log?.('provider.fallback', { from: r.error.source });
    }

    try {
      const cached = await cache?.get('cnpj', cnpj);
      const company = cached ? parsePublicCompany(cached.payload) : null;
      if (company) return ok(company);
    } catch {
      ctx.log?.('provider.failure', { source: 'external_cache', code: 'READ_FAILED' });
    }

    if (replay) {
      const r = await replay.lookup(cnpj, ctx);
      if (r.ok) return r;
    }

    if (errors.length > 0 && errors.every((e) => e.code === 'NOT_FOUND')) {
      return fail(
        'NOT_FOUND',
        errors[0]?.source ?? 'brasilapi',
        'CNPJ não encontrado na Receita.',
        {
          recoverable: false,
        },
      );
    }
    const retryInMs = Math.max(0, ...errors.map((e) => e.retryInMs ?? 0));
    return fail(
      'UNAVAILABLE',
      errors[0]?.source ?? 'brasilapi',
      'Dados públicos indisponíveis agora; tente em instantes.',
      retryInMs > 0 ? { retryInMs } : {},
    );
  }
}
