import { z } from 'zod';
import { FIXTURES } from '../../fixtures/index.ts';
import { verifyEnvelope } from '../fixtures/envelope.ts';
import { fail, ok } from '../result.ts';
import type {
  CivilDate,
  ExternalCachePort,
  ProviderContext,
  ProviderError,
  Result,
  SeriesProvider,
} from '../types.ts';
import type { SeriesPoint, SgsCode } from './sgs.ts';

type Period = { from: CivilDate; to: CivilDate };

const pointsSchema = z.array(
  z.strictObject({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    value: z.string().regex(/^-?\d+(\.\d+)?$/),
  }),
);

/** Fixture key `<code>-<from>-<to>` (ARCHITECTURE §5.1). */
export function seriesKey(code: SgsCode, period: Period): string {
  return `${code}-${period.from}-${period.to}`;
}

const KEY = /^(\d+)-(\d{4}-\d{2}-\d{2})-(\d{4}-\d{2}-\d{2})$/;

export function parseSeriesPoints(value: unknown): SeriesPoint[] | null {
  const r = pointsSchema.safeParse(value);
  return r.success ? (r.data as SeriesPoint[]) : null;
}

/**
 * Replay (ARCHITECTURE §5.3): the exact key, or any fixture of the same code whose period covers the
 * requested one (points filtered to the period). No I/O.
 */
export class ReplaySeries implements SeriesProvider {
  private readonly fixtures: readonly unknown[];
  constructor(options: { fixtures?: readonly unknown[] } = {}) {
    this.fixtures = options.fixtures ?? FIXTURES;
  }

  async series(
    code: SgsCode,
    period: Period,
    _ctx: ProviderContext,
  ): Promise<Result<SeriesPoint[], ProviderError>> {
    for (const f of this.fixtures) {
      const c = f as { source?: unknown; key?: unknown } | null;
      if (c?.source !== 'sgs.series' || typeof c.key !== 'string') continue;
      const m = KEY.exec(c.key);
      if (!m || Number(m[1]) !== code) continue;
      if ((m[2] ?? '') > period.from || (m[3] ?? '') < period.to) continue;
      const envelope = verifyEnvelope(f);
      if (!envelope.ok) return envelope;
      const points = parseSeriesPoints(envelope.value.data);
      if (!points) {
        return fail('UNEXPECTED_RESPONSE', 'replay', 'Fixture de série fora do formato.', {
          recoverable: false,
        });
      }
      return ok(points.filter((p) => p.date >= period.from && p.date <= period.to));
    }
    return fail('FIXTURE_MISSING', 'replay', 'Dados de exemplo indisponíveis para esta série.', {
      recoverable: false,
    });
  }
}

/** SGS (3 s) → `external_cache` → fixture (ARCHITECTURE §4.3). Never throws. */
export interface ChainedSeriesOptions {
  live: SeriesProvider;
  cache?: ExternalCachePort;
  replay?: SeriesProvider;
  now?: () => Date;
}

export class ChainedSeries implements SeriesProvider {
  private readonly options: ChainedSeriesOptions;
  constructor(options: ChainedSeriesOptions) {
    this.options = options;
  }

  async series(
    code: SgsCode,
    period: Period,
    ctx: ProviderContext,
  ): Promise<Result<SeriesPoint[], ProviderError>> {
    const { live, cache, replay } = this.options;
    if (ctx.mode === 'replay') {
      return replay
        ? replay.series(code, period, ctx)
        : fail('FIXTURE_MISSING', 'replay', 'Dados de exemplo indisponíveis.', {
            recoverable: false,
          });
    }
    const key = seriesKey(code, period);
    const r = await live.series(code, period, ctx);
    if (r.ok) {
      try {
        const fetchedAt = (this.options.now?.() ?? new Date()).toISOString();
        await cache?.set?.('sgs', key, r.value, fetchedAt);
      } catch {
        ctx.log?.('provider.failure', { source: 'external_cache', code: 'WRITE_FAILED' });
      }
      return r;
    }
    ctx.log?.('provider.failure', { source: r.error.source, code: r.error.code });
    ctx.log?.('provider.fallback', { from: r.error.source });
    try {
      const cached = await cache?.get('sgs', key);
      const points = cached ? parseSeriesPoints(cached.payload) : null;
      if (points) return ok(points);
    } catch {
      ctx.log?.('provider.failure', { source: 'external_cache', code: 'READ_FAILED' });
    }
    if (replay) {
      const fromFixture = await replay.series(code, period, ctx);
      if (fromFixture.ok) return fromFixture;
    }
    return r;
  }
}
