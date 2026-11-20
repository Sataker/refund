import { describe, expect, it } from 'vitest';
import { lastSelicUpTo } from '../../src/server/analysis/input.ts';

// Live runs read the Selic from the recorded SGS series; the newest recording usually ends before today.
describe('lastSelicUpTo', () => {
  it('returns the last recorded point when the series ends before today', async () => {
    const last = await lastSelicUpTo('2027-01-05');
    expect(last).toBeDefined();
    expect((last?.date ?? '') <= '2027-01-05').toBe(true);
    expect((last?.date ?? '') >= '2026-11-12').toBe(true);
  });

  it('returns a point on or before the date when a recording covers it', async () => {
    const last = await lastSelicUpTo('2026-11-12');
    expect(last).toBeDefined();
    expect((last?.date ?? '') <= '2026-11-12').toBe(true);
  });

  it('gives up after 60 days back (no invented Selic)', async () => {
    const empty = { series: async () => ({ ok: true as const, value: [] }) };
    expect(await lastSelicUpTo('2026-11-20', empty as never)).toBeUndefined();
  });
});
