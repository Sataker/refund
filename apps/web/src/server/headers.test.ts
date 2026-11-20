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

  it('sends nosniff, DENY and the restrictive permissions policy everywhere', () => {
    expect(header('X-Content-Type-Options')).toBe('nosniff');
    expect(header('X-Frame-Options')).toBe('DENY');
    expect(header('Permissions-Policy')).toContain('camera=()');
  });

  it('sends HSTS and upgrade-insecure-requests only on Vercel (https), never on http://localhost', async () => {
    expect(header('Strict-Transport-Security')).toBeUndefined();
    expect(header('Content-Security-Policy')).not.toContain('upgrade-insecure-requests');
    vi.stubEnv('VERCEL', '1');
    vi.resetModules();
    const vercel = await import('./headers.ts');
    const get = (k: string) => vercel.SECURITY_HEADERS.find((h) => h.key === k)?.value;
    expect(get('Strict-Transport-Security')).toBe('max-age=63072000; includeSubDomains; preload');
    expect(get('Content-Security-Policy')).toContain('upgrade-insecure-requests');
    vi.unstubAllEnvs();
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
