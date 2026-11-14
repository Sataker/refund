import 'server-only';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { capabilitiesFrom } from './capabilities.ts';
import { readEnv } from './env.ts';

// ARCHITECTURE §9.3: AES-256-GCM at rest as `v1.<iv>.<tag>.<ciphertext>` (base64url), HMAC for lookup
// (`*_hash`, documents, IP), sha256 for one-time tokens, constant-time comparison.

export interface Secrets {
  /** HMAC key of the `rf_sid` cookie. */
  session: Buffer;
  /** AES-256-GCM key (32 bytes). */
  encryption: Buffer;
  /** HMAC pepper for e-mail, CPF and IP. */
  pepper: Buffer;
  /** True when generated in memory for PGlite dev/test (never in production). */
  ephemeral: boolean;
}

type GlobalWithSecrets = typeof globalThis & { __refundEphemeralSecrets?: Secrets };

/** Per-process random secrets for `pnpm dev` without `.env`: data dies with the PGlite anyway. */
function ephemeralSecrets(): Secrets {
  const g = globalThis as GlobalWithSecrets;
  g.__refundEphemeralSecrets ??= {
    session: randomBytes(32),
    encryption: randomBytes(32),
    pepper: randomBytes(32),
    ephemeral: true,
  };
  return g.__refundEphemeralSecrets;
}

/**
 * The real secrets when all three are set and valid; ephemeral ones when the app runs on PGlite;
 * otherwise null (the live mode is off).
 */
export function serverSecrets(): Secrets | null {
  const env = readEnv();
  const e = env.values;
  if (e.SESSION_SECRET && e.ENCRYPTION_KEY && e.PII_PEPPER) {
    return {
      session: Buffer.from(e.SESSION_SECRET, 'utf8'),
      encryption: Buffer.from(e.ENCRYPTION_KEY, 'base64'),
      pepper: Buffer.from(e.PII_PEPPER, 'utf8'),
      ephemeral: false,
    };
  }
  return capabilitiesFrom(env).memoryDatabase ? ephemeralSecrets() : null;
}

const VERSION = 'v1';

export function encrypt(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, ciphertext]
    .map((p) => (typeof p === 'string' ? p : b64url(p)))
    .join('.');
}

/** null when the format, the version, the key or the tag do not match (tampered or rotated). */
export function decrypt(token: string, key: Buffer): string | null {
  const [version, iv, tag, ciphertext, ...rest] = token.split('.');
  if (version !== VERSION || !iv || !tag || ciphertext === undefined || rest.length > 0)
    return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}

/** HMAC-SHA256 → base64url (43 chars). */
export function hmac(value: string, key: Buffer): string {
  return createHmac('sha256', key).update(value, 'utf8').digest('base64url');
}

/** HMAC of a CPF/CNPJ with any punctuation removed (alphanumeric CNPJ kept, uppercased). */
export function hmacDocument(doc: string, pepper: Buffer): string {
  return hmac(doc.replace(/[^0-9A-Za-z]/g, '').toUpperCase(), pepper);
}

/** Lookup key of an e-mail (`users.email_hash`, `waitlist.email_hash`, `reports.accountant_email_hash`). */
export function hashEmail(email: string, pepper: Buffer): string {
  return hmac(email.trim().toLowerCase(), pepper);
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Random token for links (report approval): 32 bytes, base64url. Store only `sha256Hex(token)`. */
export function randomToken(bytes = 32): string {
  return b64url(randomBytes(bytes));
}

/** Constant-time string comparison; different lengths are simply unequal. */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
}

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}
