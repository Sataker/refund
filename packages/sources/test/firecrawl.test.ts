// Firecrawl monitor events: whitelist (ARCHITECTURE §6.2) and the /demo fixture (§5.1, §7.2).
import { describe, expect, it } from 'vitest';
import { FIXTURES } from '../fixtures/index.ts';
import {
  isMeaningfulChange,
  lawChangeFixture,
  MAX_DIFF_CHARS,
  type MonitorPage,
  sanitizeFirecrawlEvent,
} from '../src/index.ts';

const URL_LC123 = 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm';

const rawPage = (over: Record<string, unknown> = {}) => ({
  monitorId: '6f1c1a5e-0000-4000-8000-000000000001',
  checkId: '6f1c1a5e-0000-4000-8000-000000000002',
  url: URL_LC123,
  status: 'changed',
  previousScrapeId: '6f1c1a5e-0000-4000-8000-000000000003',
  currentScrapeId: '6f1c1a5e-0000-4000-8000-000000000004',
  error: null,
  isMeaningful: true,
  judgment: {
    meaningful: true,
    confidence: 'high',
    reason: 'limit changed',
    meaningfulChanges: [{ type: 'changed', before: 'a', after: 'b', reason: 'r' }],
  },
  diff: { text: '-old\n+new', json: { secret: { previous: 1, current: 2 } } },
  ...over,
});

describe('sanitizeFirecrawlEvent', () => {
  it('keeps only the whitelisted fields of monitor.page', () => {
    const r = sanitizeFirecrawlEvent({
      success: true,
      type: 'monitor.page',
      id: 'check',
      webhookId: 'delivery',
      metadata: { app: 'refund' },
      data: [rawPage()],
    });
    expect(r).toEqual({
      ok: true,
      value: {
        type: 'monitor.page',
        metadata: { app: 'refund' },
        pages: [
          {
            url: URL_LC123,
            status: 'changed',
            isMeaningful: true,
            judgment: { meaningful: true, confidence: 'high', reason: 'limit changed' },
            diffText: '-old\n+new',
          },
        ],
      },
    });
  });

  it('accepts a page without judging and caps the diff', () => {
    const r = sanitizeFirecrawlEvent({
      type: 'monitor.page',
      data: [rawPage({ isMeaningful: null, judgment: null, diff: { text: 'x'.repeat(70_000) } })],
    });
    if (!r.ok || r.value.type !== 'monitor.page') throw new Error('parse');
    expect(r.value.pages[0]?.isMeaningful).toBeNull();
    expect(r.value.pages[0]?.judgment).toBeNull();
    expect(r.value.pages[0]?.diffText).toHaveLength(MAX_DIFF_CHARS);
  });

  it('parses monitor.check.completed with the monitor id only', () => {
    const r = sanitizeFirecrawlEvent({
      type: 'monitor.check.completed',
      data: [
        {
          monitorId: 'm1',
          checkId: 'c1',
          status: 'completed',
          summary: { totalPages: 1, same: 1, changed: 0, new: 0, removed: 0, error: 0 },
        },
      ],
    });
    expect(r).toEqual({
      ok: true,
      value: {
        type: 'monitor.check.completed',
        metadata: {},
        checks: [{ monitorId: 'm1', status: 'completed' }],
      },
    });
  });

  it('refuses unknown types and malformed pages', () => {
    expect(sanitizeFirecrawlEvent({ type: 'crawl.page', data: [] }).ok).toBe(false);
    expect(sanitizeFirecrawlEvent(null).ok).toBe(false);
    expect(
      sanitizeFirecrawlEvent({ type: 'monitor.page', data: [rawPage({ url: 'not a url' })] }).ok,
    ).toBe(false);
  });
});

describe('isMeaningfulChange', () => {
  const page = (over: Partial<MonitorPage>): MonitorPage => ({
    url: URL_LC123,
    status: 'changed',
    isMeaningful: true,
    judgment: null,
    diffText: '-a\n+b',
    ...over,
  });
  it('changed with a diff and not judged irrelevant', () => {
    expect(isMeaningfulChange(page({}))).toBe(true);
    expect(isMeaningfulChange(page({ isMeaningful: null }))).toBe(true);
    expect(isMeaningfulChange(page({ isMeaningful: false }))).toBe(false);
    expect(isMeaningfulChange(page({ status: 'same' }))).toBe(false);
    expect(isMeaningfulChange(page({ diffText: null }))).toBe(false);
  });
});

describe('law-change fixture', () => {
  it('is labelled synthetic and loads through the whitelist', () => {
    const r = lawChangeFixture('lc123-2006-2026-10-21');
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.origin).toBe('synthetic');
    expect(r.value.page.url).toBe(URL_LC123);
    expect(r.value.page.diffText).toContain('R$ 140.000,00');
    expect(r.value.page.diffText).toContain('R$ 81.000,00');
  });

  it('an edited fixture fails the hash check; a missing key is FIXTURE_MISSING', () => {
    const original = FIXTURES.find(
      (f) => (f as { key: string }).key === 'lc123-2006-2026-10-21',
    ) as { data: { pages: MonitorPage[] } };
    const edited = structuredClone(original);
    (edited.data.pages[0] as MonitorPage).diffText = '+R$ 999.999,00';
    expect(lawChangeFixture('lc123-2006-2026-10-21', [edited]).ok).toBe(false);
    const missing = lawChangeFixture('nope');
    expect(missing.ok ? 'OK' : missing.error.code).toBe('FIXTURE_MISSING');
  });
});
