import 'server-only';
import { randomUUID } from 'node:crypto';
import { hmac, safeEqual } from './crypto.ts';

// ARCHITECTURE §9.2: the signed `rf_sid` cookie `{ userId, issuedAt }`, HMAC-SHA256(SESSION_SECRET).
// No database and no next/headers here: proxy.ts imports this file.

export const SESSION_COOKIE = 'rf_sid';
export const SESSION_MAX_AGE_S = 7_776_000; // 90 days
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
  maxAge: SESSION_MAX_AGE_S,
} as const;

export interface SessionPayload {
  userId: string;
  /** Epoch seconds. */
  issuedAt: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function signSession(payload: SessionPayload, secret: Buffer): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${hmac(body, secret)}`;
}

/** null if unsigned, tampered, malformed, from the future or older than 90 days. */
export function verifySession(
  value: string | undefined,
  secret: Buffer,
  nowMs: number = Date.now(),
): SessionPayload | null {
  if (!value) return null;
  const [body, sig, ...rest] = value.split('.');
  if (!body || !sig || rest.length > 0 || !safeEqual(sig, hmac(body, secret))) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  const p = parsed as Partial<SessionPayload>;
  if (typeof p.userId !== 'string' || !UUID.test(p.userId)) return null;
  if (typeof p.issuedAt !== 'number' || !Number.isSafeInteger(p.issuedAt)) return null;
  const age = Math.floor(nowMs / 1000) - p.issuedAt;
  if (age < -60 || age > SESSION_MAX_AGE_S) return null;
  return { userId: p.userId, issuedAt: p.issuedAt };
}

export function newSession(secret: Buffer, nowMs: number = Date.now()) {
  const payload: SessionPayload = { userId: randomUUID(), issuedAt: Math.floor(nowMs / 1000) };
  return { payload, value: signSession(payload, secret) };
}
