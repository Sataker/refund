import { FIXTURES } from '../../fixtures/index.ts';
import { findFixture } from '../fixtures/envelope.ts';
import { fail, ok } from '../result.ts';
import type {
  Cnpj,
  CnpjProvider,
  ProviderContext,
  ProviderError,
  PublicCompany,
  Result,
} from '../types.ts';
import { parsePublicCompany } from './schema.ts';

export interface ReplayCnpjOptions {
  /** Envelopes from the generated index (`fixtures/index.ts`); injectable in tests. */
  fixtures?: readonly unknown[];
  /** Persona companies (`@refund/personas` data, injected by the caller: sources cannot import personas). */
  companies?: readonly PublicCompany[];
}

/** Replay (ARCHITECTURE §5.3): persona companies first, then recorded fixtures. No I/O. */
export class ReplayCnpj implements CnpjProvider {
  private readonly fixtures: readonly unknown[];
  private readonly companies: ReadonlyMap<string, PublicCompany>;

  constructor(options: ReplayCnpjOptions = {}) {
    this.fixtures = options.fixtures ?? FIXTURES;
    this.companies = new Map((options.companies ?? []).map((c) => [c.cnpj, c]));
  }

  async lookup(cnpj: Cnpj, _ctx: ProviderContext): Promise<Result<PublicCompany, ProviderError>> {
    const persona = this.companies.get(cnpj);
    if (persona) return ok(persona);
    for (const source of ['brasilapi.cnpj', 'cnpjws.cnpj'] as const) {
      const found = findFixture(this.fixtures, source, cnpj);
      if (!found.ok && found.error.code === 'FIXTURE_MISSING') continue;
      if (!found.ok) return found;
      const company = parsePublicCompany(found.value.data);
      if (!company) {
        return fail('UNEXPECTED_RESPONSE', 'replay', 'Fixture de CNPJ fora do formato.', {
          recoverable: false,
        });
      }
      return ok(company);
    }
    return fail('FIXTURE_MISSING', 'replay', 'Dados de exemplo indisponíveis para este CNPJ.', {
      recoverable: false,
    });
  }
}
