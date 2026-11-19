import { FIXTURES } from '../../fixtures/index.ts';
import { findFixture } from '../fixtures/envelope.ts';
import { fail, ok } from '../result.ts';
import type { Result } from '../types.ts';
import { type MonitorPage, sanitizeFirecrawlEvent } from './firecrawl.ts';

// "Law changed" in /demo (ARCHITECTURE §7.2): the monitor.page fixture, verified (hash) and whitelisted again.

export interface LawChangeFixture {
  key: string;
  /** 'synthetic' until a delivery from the production webhook replaces it (EXECUTION §9, E16). */
  origin: 'live' | 'synthetic';
  recordedAt: string;
  page: MonitorPage;
}

export function lawChangeFixture(
  key: string,
  fixtures: readonly unknown[] = FIXTURES,
): Result<LawChangeFixture> {
  const found = findFixture(fixtures, 'firecrawl.monitor.page', key);
  if (!found.ok) return found;
  const data = found.value.data as { pages?: unknown };
  const event = sanitizeFirecrawlEvent({
    type: 'monitor.page',
    data: (Array.isArray(data.pages) ? data.pages : []).map((p: MonitorPage) => ({
      url: p.url,
      status: p.status,
      isMeaningful: p.isMeaningful,
      judgment: p.judgment,
      diff: { text: p.diffText },
    })),
  });
  if (!event.ok || event.value.type !== 'monitor.page' || event.value.pages[0] === undefined) {
    return fail('UNEXPECTED_RESPONSE', 'replay', 'Fixture do monitor fora do formato.', {
      recoverable: false,
    });
  }
  return ok({
    key,
    origin: found.value.origin,
    recordedAt: found.value.recordedAt,
    page: event.value.pages[0],
  });
}
