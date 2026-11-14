import { createHash } from 'node:crypto';
import { z } from 'zod';
import { fail, ok } from '../result.ts';
import type {
  FixtureEnvelope,
  FixtureSource,
  ProviderError,
  Result,
  Sanitization,
} from '../types.ts';

// Common fixture envelope (ARCHITECTURE §5.2).

/** JSON with keys sorted at every depth: the canonical form hashed into `dataSha256`. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

export function dataSha256(data: unknown): string {
  return createHash('sha256').update(stableStringify(data)).digest('hex');
}

export function createEnvelope<T>(input: {
  source: FixtureSource;
  key: string;
  origin: 'live' | 'synthetic';
  recordedAt: string;
  recordedBy: string;
  sanitization: Sanitization;
  data: T;
}): FixtureEnvelope<T> {
  return {
    $format: 'refund.fixture/v1',
    source: input.source,
    key: input.key,
    origin: input.origin,
    recordedAt: input.recordedAt,
    recordedBy: input.recordedBy,
    sanitization: input.sanitization,
    dataSha256: dataSha256(input.data),
    data: input.data,
  };
}

const envelopeSchema = z.strictObject({
  $format: z.literal('refund.fixture/v1'),
  source: z.enum([
    'brasilapi.cnpj',
    'cnpjws.cnpj',
    'sgs.series',
    'pluggy.item',
    'pluggy.accounts',
    'pluggy.transactions',
    'pluggy.identity',
    'firecrawl.monitor.page',
  ]),
  key: z.string().min(1),
  origin: z.enum(['live', 'synthetic']),
  recordedAt: z.string(),
  recordedBy: z.string(),
  sanitization: z.strictObject({
    whitelist: z.string(),
    discardedFields: z.array(z.string()),
    replacedDocuments: z.number().int().nonnegative(),
  }),
  dataSha256: z.string().regex(/^[0-9a-f]{64}$/),
  data: z.unknown(),
});

/** Shape + integrity: a fixture edited by hand without `pnpm fixtures:rehash` fails here. */
export function verifyEnvelope(value: unknown): Result<FixtureEnvelope, ProviderError> {
  const parsed = envelopeSchema.safeParse(value);
  if (!parsed.success) {
    return fail('UNEXPECTED_RESPONSE', 'replay', 'Fixture fora do formato refund.fixture/v1.', {
      recoverable: false,
    });
  }
  const envelope = parsed.data as FixtureEnvelope;
  if (dataSha256(envelope.data) !== envelope.dataSha256) {
    return fail('UNEXPECTED_RESPONSE', 'replay', 'Fixture alterada sem recalcular o hash.', {
      recoverable: false,
    });
  }
  return ok(envelope);
}

/** Envelopes of one source whose `key` matches, already verified. */
export function findFixture(
  fixtures: readonly unknown[],
  source: FixtureSource,
  key: string,
): Result<FixtureEnvelope, ProviderError> {
  for (const f of fixtures) {
    if (f === null || typeof f !== 'object') continue;
    const candidate = f as { source?: unknown; key?: unknown };
    if (candidate.source !== source || candidate.key !== key) continue;
    return verifyEnvelope(f);
  }
  return fail('FIXTURE_MISSING', 'replay', 'Dados de exemplo indisponíveis para esta consulta.', {
    recoverable: false,
  });
}
