import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestError } from '@/instrumentation.ts';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('onRequestError (ARCHITECTURE §10.1)', () => {
  it('logs the route template, never the path with the bearer token', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const token = 'T'.repeat(43);
    await onRequestError(
      Object.assign(new Error('boom'), { digest: 'dg1' }),
      { path: `/r/${token}?a=1`, method: 'GET', headers: { 'x-vercel-id': 'gru1::x' } },
      {
        routerKind: 'App Router',
        routePath: '/r/[token]',
        routeType: 'render',
        renderSource: 'server-rendering',
        revalidateReason: undefined,
      },
    );
    const line = String(err.mock.calls[0]?.[0]);
    expect(line).not.toContain(token);
    expect(JSON.parse(line)).toMatchObject({
      level: 'error',
      event: 'request.error',
      route: '/r/[token]',
      requestId: 'gru1::x',
      digest: 'dg1',
    });
  });
});
