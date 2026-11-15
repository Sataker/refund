import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  decrypt,
  encrypt,
  hashEmail,
  hmac,
  hmacDocument,
  randomToken,
  safeEqual,
  serverSecrets,
  sha256Hex,
} from './crypto.ts';

const KEY = Buffer.alloc(32, 3);

afterEach(() => vi.unstubAllEnvs());

describe('AES-256-GCM (ARCHITECTURE §9.3)', () => {
  it('round-trips in the v1.<iv>.<tag>.<ciphertext> format with a fresh IV', () => {
    const a = encrypt('item-123', KEY);
    const b = encrypt('item-123', KEY);
    expect(a).toMatch(/^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(a).not.toBe(b);
    expect(decrypt(a, KEY)).toBe('item-123');
  });

  it('returns null for a tampered token, another key or a bad format', () => {
    const token = encrypt('segredo', KEY);
    const parts = token.split('.');
    const tampered = [...parts.slice(0, 3), `${parts[3]?.slice(0, -2)}AA`].join('.');
    expect(decrypt(tampered, KEY)).toBeNull();
    expect(decrypt(token, Buffer.alloc(32, 4))).toBeNull();
    expect(decrypt('v2.a.b.c', KEY)).toBeNull();
    expect(decrypt('v1.a.b', KEY)).toBeNull();
    expect(decrypt(`${token}.x`, KEY)).toBeNull();
  });

  it('rejects a truncated tag and an IV that is not 12 bytes (GCM forgery surface)', () => {
    const [v, iv, tag, ct] = encrypt('segredo', KEY).split('.') as [string, string, string, string];
    const shortTag = Buffer.from(tag, 'base64url').subarray(0, 4).toString('base64url');
    expect(decrypt([v, iv, shortTag, ct].join('.'), KEY)).toBeNull();
    const longIv = Buffer.concat([Buffer.from(iv, 'base64url'), Buffer.alloc(4)]).toString(
      'base64url',
    );
    expect(decrypt([v, longIv, tag, ct].join('.'), KEY)).toBeNull();
  });
});

describe('HMAC, hashes and tokens', () => {
  it('normalizes documents and e-mails before the HMAC', () => {
    expect(hmacDocument('12.ABC.345/01DE-35', KEY)).toBe(hmacDocument('12abc34501de35', KEY));
    expect(hashEmail(' Ana@Exemplo.com.br ', KEY)).toBe(hashEmail('ana@exemplo.com.br', KEY));
    expect(hmac('x', KEY)).toHaveLength(43);
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(Buffer.from(randomToken(), 'base64url')).toHaveLength(32);
  });

  it('compares in constant time and handles different lengths', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('serverSecrets', () => {
  it('uses the configured secrets when all three are valid', () => {
    vi.stubEnv('SESSION_SECRET', 's'.repeat(32));
    vi.stubEnv('ENCRYPTION_KEY', KEY.toString('base64'));
    vi.stubEnv('PII_PEPPER', 'p'.repeat(32));
    const s = serverSecrets();
    expect(s?.ephemeral).toBe(false);
    expect(s?.encryption.equals(KEY)).toBe(true);
  });

  it('falls back to stable per-process secrets only on PGlite (not production)', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('DATABASE_URL', '');
    const a = serverSecrets();
    expect(a?.ephemeral).toBe(true);
    expect(serverSecrets()?.session.equals(a?.session as Buffer)).toBe(true);
    vi.stubEnv('NODE_ENV', 'production');
    expect(serverSecrets()).toBeNull();
  });
});
