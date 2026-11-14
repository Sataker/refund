import 'server-only';
import { randomUUID } from 'node:crypto';
import { insertSystemEvent } from '@refund/db';
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

/** Removes documents and e-mails from free text. */
export function redactText(text: string): string {
  let out = text.length > MAX_STRING ? `${text.slice(0, MAX_STRING)}…` : text;
  for (const re of DOCUMENT_PATTERNS) out = out.replace(re, '[doc]');
  return out.replace(EMAIL, '[email]');
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
    return {
      name: value.name,
      message: redactText(value.message),
      ...(typeof digest === 'string' ? { digest } : {}),
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
  const line = {
    ...safe,
    ts: new Date().toISOString(),
    level,
    event,
    ...(ctx.requestId ? { requestId: ctx.requestId } : {}),
    ...(ctx.route ? { route: ctx.route } : {}),
    ...(ctx.durationMs !== undefined ? { durationMs: ctx.durationMs } : {}),
  };
  const out = level === 'info' ? process.stdout : process.stderr;
  out.write(`${JSON.stringify(line)}\n`);
  if (level !== 'info') persist(level, event, safe, ctx);
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
