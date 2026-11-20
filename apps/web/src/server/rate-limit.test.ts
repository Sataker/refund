import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { quotaMonth } from './entitlements.ts';
import { clientIp, ipKey, memoryRateLimit, windowStart } from './rate-limit.ts';

describe('memory rate limit (ARCHITECTURE §9.4)', () => {
  it('allows `limit` hits per window and frees the next window', () => {
    const rule = { key: 'health:ip:test-a', limit: 3, windowMs: 60_000 };
    const t0 = 1_800_000_000_000;
    expect([1, 2, 3, 4].map(() => memoryRateLimit(rule, t0))).toEqual([true, true, true, false]);
    expect(memoryRateLimit(rule, t0 + 60_000)).toBe(true);
    expect(windowStart(t0 + 59_999, 60_000).getTime()).toBe(Math.floor(t0 / 60_000) * 60_000);
  });

  it('keeps at most 5000 keys (oldest evicted)', () => {
    for (let i = 0; i < 5001; i++) memoryRateLimit({ key: `k${i}`, limit: 1, windowMs: 1000 }, 0);
    expect(memoryRateLimit({ key: 'k0', limit: 1, windowMs: 1000 }, 0)).toBe(true);
  });
});

describe('client IP key', () => {
  it('uses the first x-forwarded-for value and never keeps the IP in clear', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' });
    expect(clientIp(headers)).toBe('203.0.113.7');
    expect(clientIp(new Headers())).toBe('unknown');
    const withPepper = ipKey('cnpj', headers, Buffer.alloc(32, 1));
    const withoutPepper = ipKey('cnpj', headers);
    expect(withPepper).toMatch(/^cnpj:ip:[\w-]{43}$/);
    expect(withoutPepper).toMatch(/^cnpj:ip:[\w-]{43}$/);
    expect(withoutPepper).not.toBe(withPepper);
    expect(ipKey('cnpj', headers)).toBe(withoutPepper);
    for (const key of [withPepper, withoutPepper]) expect(key).not.toContain('203.0.113.7');
    // Not a plain hash: without the key, sha256(ip) does not reproduce it.
    expect(withoutPepper).not.toContain(
      createHash('sha256').update('203.0.113.7').digest('hex').slice(0, 20),
    );
  });
});

describe('quota month (America/Sao_Paulo)', () => {
  it('rolls over at midnight BRT, not UTC', () => {
    expect(quotaMonth(Date.parse('2026-12-01T02:59:59Z'))).toBe('2026-11');
    expect(quotaMonth(Date.parse('2026-12-01T03:00:00Z'))).toBe('2026-12');
  });
});
