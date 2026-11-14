import { describe, expect, it, vi } from 'vitest';
import { SECURITY_HEADERS } from './headers.ts';

function header(key: string): string | undefined {
  return SECURITY_HEADERS.find((h) => h.key === key)?.value;
}

describe('SECURITY_HEADERS (ARCHITECTURE §9.1)', () => {
  it('sends the CSP with frame-ancestors none and no eval outside next dev', () => {
    const csp = header('Content-Security-Policy') ?? '';
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain('frame-src https://connect.pluggy.ai');
    expect(csp).not.toContain('unsafe-eval');
  });

  it('sends HSTS, nosniff, DENY and the restrictive permissions policy', () => {
    expect(header('Strict-Transport-Security')).toBe(
      'max-age=63072000; includeSubDomains; preload',
    );
    expect(header('X-Content-Type-Options')).toBe('nosniff');
    expect(header('X-Frame-Options')).toBe('DENY');
    expect(header('Permissions-Policy')).toContain('camera=()');
  });

  it("allows 'unsafe-eval' only under next dev (React Refresh)", async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.resetModules();
    const dev = await import('./headers.ts');
    const csp = dev.SECURITY_HEADERS.find((h) => h.key === 'Content-Security-Policy')?.value;
    expect(csp).toContain("'unsafe-eval'");
    vi.unstubAllEnvs();
  });
});
