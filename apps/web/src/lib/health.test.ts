import { describe, expect, it } from 'vitest';
import { basicHealth } from './health.ts';

describe('basicHealth', () => {
  it('reports local defaults when nothing is injected (zero env)', () => {
    expect(basicHealth({})).toEqual({
      status: 'ok',
      version: 'local',
      environment: 'local',
      builtAt: null,
    });
  });

  it('uses the 7-char commit SHA and the Vercel environment', () => {
    const health = basicHealth({
      VERCEL_GIT_COMMIT_SHA: '3f9c2e1a7b0d4c5e',
      VERCEL_ENV: 'production',
      REFUND_BUILT_AT: '2026-11-15T12:00:00.000Z',
    });
    expect(health.version).toBe('3f9c2e1');
    expect(health.environment).toBe('production');
    expect(health.builtAt).toBe('2026-11-15T12:00:00.000Z');
  });
});
