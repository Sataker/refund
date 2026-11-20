import { fail, ok } from '../result.ts';
import type {
  CachedEntry,
  Cnpj,
  CnpjProvider,
  CnpjSource,
  ExternalCachePort,
  ProviderContext,
  ProviderError,
  PublicCompany,
  Result,
} from '../types.ts';
import { CnpjProviderGuard } from './guard.ts';
import type { LiveCnpjProvider } from './live.ts';
import { parsePublicCompany } from './schema.ts';

export interface ChainedCnpjOptions {
  /** Live providers in order (E21): BrasilAPI → OpenCNPJ → CNPJá → minhareceita → CNPJ.ws → ReceitaWS. */
  live: readonly LiveCnpjProvider[];
  /** `external_cache`: read first (a fresh entry answers at once), written on a live hit, and read even
   * expired when every live provider fails. */
  cache?: ExternalCachePort;
  /** Last resort for persona CNPJs, and the only provider in `replay` mode. */
  replay?: CnpjProvider;
  /** Breaker and pacing state. Share one instance across requests (module scope) so it learns. */
  guard?: CnpjProviderGuard;
  /** Sources whose 404 means "the CNPJ does not exist" and ends the chain. Default: BrasilAPI. */
  authoritative?: readonly CnpjSource[];
  /** Sources to leave out (dev-only switch to simulate an outage). */
  skip?: readonly string[];
  /** Wall-clock budget for the whole live walk; each call gets what is left (default 12 s). */
  budgetMs?: number;
}

/** Answers that say the CNPJ is not in the Receita base, coming from independent mirrors. */
const NOT_FOUND_QUORUM = 2;

function fresh(entry: CachedEntry, nowMs: number): boolean {
  const expires = Date.parse(entry.expiresAt);
  return Number.isFinite(expires) && expires > nowMs;
}

/** An opt-in without its start date: the answer cannot settle a disagreement on the regime. */
function undatedOptIn(c: PublicCompany): boolean {
  return (c.simples.optedIn && c.simples.since === null) || (c.mei.optedIn && c.mei.since === null);
}

/**
 * Simples/MEI disagreement rule (E21): when two sources disagree on the Simples or MEI flag, the one
 * that gives the dates of THAT regime wins, because a dated answer comes from the Receita's Simples file
 * itself, while a bare flag may be a stale copy. Both answers are judged by the same rule, on the field
 * that disagrees (Simples first when both do; E21 review, item 2). The winner's whole company is used
 * (never a field mix), so the EI/MEI mask and the size stay consistent with its own flags.
 */
export function preferDatedSimples(first: PublicCompany, second: PublicCompany): PublicCompany {
  const dated = (o: PublicCompany['simples']) => o.since !== null || o.excludedAt !== null;
  const field: 'simples' | 'mei' | null =
    first.simples.optedIn !== second.simples.optedIn
      ? 'simples'
      : first.mei.optedIn !== second.mei.optedIn
        ? 'mei'
        : null;
  if (field === null) return first;
  return !dated(first[field]) && dated(second[field]) ? second : first;
}

/**
 * Fallback chain (ARCHITECTURE §4.3, §12; six sources since E21): fresh `external_cache` → BrasilAPI →
 * OpenCNPJ → CNPJá → minhareceita → CNPJ.ws → ReceitaWS → expired cache (the UI shows "dados de até N
 * dias" from `fetchedAt`) → replay (persona CNPJ) → `NOT_FOUND` or `UNAVAILABLE`.
 *
 * Moving on: a 429, 5xx, timeout, refused request or answer outside the whitelist shape sends the
 * lookup to the next source. A 404 from an authoritative source (BrasilAPI) ends it as "not found";
 * a 404 from a mirror only counts toward the quorum (a mirror may lag behind the Receita). Never throws:
 * the cache port is foreign code, so its failures are swallowed. Logs carry the source and code only.
 */
export class ChainedCnpj implements CnpjProvider {
  private readonly options: ChainedCnpjOptions;
  private readonly guard: CnpjProviderGuard;
  constructor(options: ChainedCnpjOptions) {
    this.options = options;
    this.guard = options.guard ?? new CnpjProviderGuard();
  }

  async lookup(cnpj: Cnpj, ctx: ProviderContext): Promise<Result<PublicCompany, ProviderError>> {
    const { cache, replay } = this.options;
    if (ctx.mode === 'replay') {
      return replay
        ? replay.lookup(cnpj, ctx)
        : fail('FIXTURE_MISSING', 'replay', 'Dados de exemplo indisponíveis.', {
            recoverable: false,
          });
    }

    let cached: PublicCompany | null = null;
    try {
      const entry = await cache?.get('cnpj', cnpj);
      cached = entry ? parsePublicCompany(entry.payload) : null;
      if (entry && cached && fresh(entry, this.guard.now())) {
        ctx.log?.('provider.answered', { source: 'external_cache', fresh: true });
        return ok(cached);
      }
    } catch {
      ctx.log?.('provider.failure', { source: 'external_cache', code: 'READ_FAILED' });
    }

    const walk = await this.walk(cnpj, ctx);
    if (walk.company) {
      try {
        await cache?.set?.('cnpj', cnpj, walk.company, walk.company.fetchedAt);
      } catch {
        ctx.log?.('provider.failure', { source: 'external_cache', code: 'WRITE_FAILED' });
      }
      return ok(walk.company);
    }

    const { errors, authoritativeNotFound, skipped } = walk;
    if (cached && !authoritativeNotFound) {
      ctx.log?.('provider.answered', { source: 'external_cache', fresh: false });
      return ok(cached);
    }
    if (replay) {
      const r = await replay.lookup(cnpj, ctx);
      if (r.ok) return r;
    }

    const notFound = errors.filter((e) => e.code === 'NOT_FOUND');
    if (
      authoritativeNotFound ||
      notFound.length >= NOT_FOUND_QUORUM ||
      // "Every source that answered said 404" only counts when no source was left out: a lone mirror's
      // 404 with the others skipped (breaker, pacing, budget) is not enough (E21 review, item 3).
      (skipped === 0 && errors.length > 0 && notFound.length === errors.length)
    ) {
      return fail(
        'NOT_FOUND',
        notFound[0]?.source ?? 'brasilapi',
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

  private async walk(
    cnpj: Cnpj,
    ctx: ProviderContext,
  ): Promise<{
    company: PublicCompany | null;
    errors: ProviderError[];
    authoritativeNotFound: boolean;
    /** Sources left out without being asked (switch, budget, breaker, pacing). */
    skipped: number;
  }> {
    const { live, skip = [], authoritative = ['brasilapi'], budgetMs = 12_000 } = this.options;
    const errors: ProviderError[] = [];
    const deadline = this.guard.now() + budgetMs;
    let company: PublicCompany | null = null;
    let skipped = 0;

    for (const provider of live) {
      const { source } = provider;
      if (skip.includes(source)) {
        ctx.log?.('provider.skipped', { source, reason: 'disabled' });
        skipped++;
        continue;
      }
      const remaining = deadline - this.guard.now();
      if (remaining <= 0) {
        ctx.log?.('provider.skipped', { source, reason: 'budget' });
        skipped++;
        continue;
      }
      const admitted = this.guard.admit(source, provider.minIntervalMs);
      if (!admitted.ok) {
        ctx.log?.('provider.skipped', { source, reason: admitted.reason });
        skipped++;
        continue;
      }

      const budget = AbortSignal.timeout(remaining);
      const signal = ctx.signal ? AbortSignal.any([ctx.signal, budget]) : budget;
      const started = this.guard.now();
      const r = await provider.lookup(cnpj, { ...ctx, signal });
      const ms = this.guard.now() - started;

      if (r.ok) {
        this.guard.success(source);
        if (company === null) {
          company = r.value;
          ctx.log?.('provider.answered', { source, ms });
          // A bare opt-in flag: ask the next source once and keep the dated answer on disagreement.
          if (undatedOptIn(company)) continue;
          break;
        }
        const chosen = preferDatedSimples(company, r.value);
        if (chosen !== company) {
          ctx.log?.('provider.simples_disagreement', { kept: source, dropped: company.source });
        }
        company = chosen;
        break;
      }

      // An abort caused by our own budget (or the caller) says nothing about the source's health.
      if (!signal.aborted) this.guard.failure(source, r.error);
      ctx.log?.('provider.failure', { source, code: r.error.code, ms });
      if (company !== null) break;
      errors.push(r.error);
      if (r.error.code === 'NOT_FOUND' && authoritative.includes(source)) {
        return { company: null, errors, authoritativeNotFound: true, skipped };
      }
      ctx.log?.('provider.fallback', { from: source });
    }
    return { company, errors, authoritativeNotFound: false, skipped };
  }
}
