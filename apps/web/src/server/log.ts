import 'server-only';
import { randomUUID } from 'node:crypto';
import { insertSystemEvent } from '@refund/db';
import { stripDocuments } from '@refund/sources';
import { peekDb } from './db.ts';

// ARCHITECTURE §10.1 and §6.5: one JSON object per line, everything through redactLog(). warn/error
// also go to refund.system_events (best effort: never blocks, never throws, never opens the database).

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogContext {
  requestId?: string | undefined;
  route?: string | undefined;
  durationMs?: number | undefined;
}

const SENSITIVE_KEY = /cpf|email|nome|name|document|token|secret|key|authorization|cookie/i;
const MAX_DEPTH = 6;
const MAX_STRING = 2000;

const DOCUMENT_PATTERNS: readonly RegExp[] = [
  /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, // formatted CPF
  /\b[0-9A-Z]{2}\.[0-9A-Z]{3}\.[0-9A-Z]{3}\/[0-9A-Z]{4}-\d{2}\b/g, // formatted CNPJ (alphanumeric too)
  /\b\d{11}\b|\b\d{14}\b/g, // bare CPF/CNPJ digits (logs over-redact on purpose)
];
const EMAIL = /[^\s@"'<>]+@[^\s@"'<>]+\.[^\s@"'<>]+/g;

/**
 * Removes documents and e-mails from free text: the patterns above, then the same stripDocuments the sources use on
 * transaction descriptions (valid CPFs with loose or spread separators, numeric CNPJ runs; compliance review E14, H6).
 */
export function redactText(text: string): string {
  let out = text.length > MAX_STRING ? `${text.slice(0, MAX_STRING)}…` : text;
  for (const re of DOCUMENT_PATTERNS) out = out.replace(re, '[doc]');
  return stripDocuments(out).replace(EMAIL, '[email]');
}

/**
 * Error text without data: a Drizzle `Failed query: <sql>\nparams: <values>` keeps only "Failed query"
 * (the SQL can inline values, the params always are values); anything after `\nparams:` is dropped.
 */
function errorMessage(message: string): string {
  if (message.startsWith('Failed query')) return 'Failed query';
  const cut = message.indexOf('\nparams:');
  return redactText(cut === -1 ? message : message.slice(0, cut));
}

/** Only the machine code of the cause (ECONNREFUSED, 23505…): its message can echo values. */
function errorCode(cause: unknown): string | undefined {
  const code = (cause as { code?: unknown } | null | undefined)?.code;
  return typeof code === 'string' && /^[A-Z0-9_]{1,40}$/.test(code) ? code : undefined;
}

/** Deep copy without sensitive keys and with redacted strings. Safe on cycles and Errors. */
export function redactLog(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return redactText(value);
  if (value === null || typeof value !== 'object') {
    return typeof value === 'bigint' || typeof value === 'symbol' || typeof value === 'function'
      ? String(value)
      : value;
  }
  if (seen.has(value) || depth >= MAX_DEPTH) return '[…]';
  seen.add(value);
  if (value instanceof Error) {
    const digest = (value as { digest?: unknown }).digest;
    const code = errorCode(value.cause);
    return {
      name: value.name,
      message: errorMessage(value.message),
      ...(typeof digest === 'string' ? { digest } : {}),
      ...(code ? { cause: { code } } : {}),
    };
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((v) => redactLog(v, depth + 1, seen));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = SENSITIVE_KEY.test(k) ? '[redacted]' : redactLog(v, depth + 1, seen);
  }
  return out;
}

const ID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-|\d{6,}/i;

/**
 * Route safe to log: no query string, and any concrete segment that could be a secret or an id
 * (`/r/<token>`, uuids, long numbers, anything over 24 chars) becomes `[redacted]`. Next's route
 * templates (`/r/[token]`) pass through.
 */
export function safeRoute(route: string | undefined): string | undefined {
  if (!route) return undefined;
  const path = route.split('?')[0] ?? '';
  return path
    .split('/')
    .map((seg) =>
      /^\[[^\]]+\]$/.test(seg) || (seg.length <= 24 && !ID_LIKE.test(seg)) ? seg : '[redacted]',
    )
    .join('/');
}

/** `x-vercel-id` when on Vercel, otherwise a local UUID. */
export function requestIdFrom(headers: Headers | null | undefined): string {
  return headers?.get('x-vercel-id') ?? randomUUID();
}

export function log(
  level: LogLevel,
  event: string,
  data: Record<string, unknown> = {},
  ctx: LogContext = {},
): void {
  const safe = redactLog(data) as Record<string, unknown>;
  const route = safeRoute(ctx.route);
  const requestId = ctx.requestId ? redactText(ctx.requestId).slice(0, 120) : undefined;
  const line = {
    ...safe,
    ts: new Date().toISOString(),
    level,
    event,
    ...(requestId ? { requestId } : {}),
    ...(route ? { route } : {}),
    ...(ctx.durationMs !== undefined ? { durationMs: ctx.durationMs } : {}),
  };
  const out = level === 'info' ? process.stdout : process.stderr;
  out.write(`${JSON.stringify(line)}\n`);
  if (level !== 'info') persist(level, event, safe, { route, requestId });
}

function persist(
  level: 'warn' | 'error',
  event: string,
  context: Record<string, unknown>,
  ctx: LogContext,
): void {
  const handle = peekDb();
  if (!handle) return;
  void handle
    .then((h) =>
      h
        ? insertSystemEvent(h.db, {
            level,
            event,
            route: ctx.route ?? null,
            requestId: ctx.requestId ?? null,
            context,
          })
        : undefined,
    )
    .catch(() => {});
}

export const logger = {
  info: (event: string, data?: Record<string, unknown>, ctx?: LogContext) =>
    log('info', event, data, ctx),
  warn: (event: string, data?: Record<string, unknown>, ctx?: LogContext) =>
    log('warn', event, data, ctx),
  error: (event: string, data?: Record<string, unknown>, ctx?: LogContext) =>
    log('error', event, data, ctx),
};
