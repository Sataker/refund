import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createEnvelope } from './fixtures/envelope.ts';
import { mergeSanitization, sanitizationOf } from './fixtures/sanitization.ts';
import { detectPii } from './pii/detect.ts';
import { fail } from './result.ts';
import type { FixtureSource, ProviderError, Result, Sanitization } from './types.ts';

// Recorder (ARCHITECTURE §5.2): wraps an ALREADY-SANITIZED provider and writes what it returns as a
// fixture envelope. It never sees a raw HTTP response, refuses objects that did not go through a
// whitelist, and refuses (writes nothing) when `detectPii` finds anything.

export interface RecordingOptions {
  /** e.g. `scripts/record-fixtures.ts@3f9c2e1`. */
  recordedBy?: string;
  origin?: 'live' | 'synthetic';
  now?: () => Date;
  write?: (path: string, content: string) => void;
  /** Called after each successful write (the script prints it). */
  onRecorded?: (path: string) => void;
}

type AnyResult = Result<unknown, ProviderError>;

function isResult(value: unknown): value is AnyResult {
  return value !== null && typeof value === 'object' && 'ok' in value;
}

function isContext(value: unknown): boolean {
  return value !== null && typeof value === 'object' && 'mode' in value;
}

/** File-safe key from the call arguments: `RFDEV001000158`, `432-2026-11-12-2026-11-12`… */
export function fixtureKey(args: readonly unknown[]): string {
  return args
    .filter((a) => !isContext(a))
    .map((a) => {
      if (typeof a === 'string' || typeof a === 'number') return String(a);
      const p = a as { from?: unknown; to?: unknown } | null;
      return p && typeof p.from === 'string' && typeof p.to === 'string' ? `${p.from}-${p.to}` : '';
    })
    .filter(Boolean)
    .join('-')
    .replace(/[^0-9A-Za-z._-]/g, '_');
}

function refuse(message: string): { ok: false; error: ProviderError } {
  return fail('UNEXPECTED_RESPONSE', 'recorder', message, { recoverable: false });
}

/** The object's own sanitization, or the merge of its elements' when every element went through one. */
function sanitizationFor(data: unknown): Sanitization | null {
  const own = sanitizationOf(data);
  if (own) return own;
  if (Array.isArray(data) && data.length > 0) {
    const infos = data.map(sanitizationOf);
    if (infos.every((i) => i !== undefined)) return mergeSanitization(infos, 'unknown');
  }
  return null;
}

export function recording<P extends object>(
  provider: P,
  destination: { dir: string; source: FixtureSource },
  options: RecordingOptions = {},
): P {
  const write =
    options.write ??
    ((path: string, content: string) => {
      mkdirSync(destination.dir, { recursive: true });
      writeFileSync(path, content);
    });

  /** Writes the fixture; returns the refusal, or null when it was written (or there was nothing to write). */
  const record = (key: string, data: unknown): AnyResult | null => {
    // An empty answer (no identity, no accounts) is not an error and is not worth a fixture.
    if (data === null || data === undefined || (Array.isArray(data) && data.length === 0))
      return null;
    // An EI/MEI CNPJ identifies a person: it would land in the file name and in `data.cnpj` (C1).
    if (typeof data === 'object' && (data as { masked?: unknown }).masked === true) {
      return refuse('Gravação recusada: CNPJ de empresário individual ou MEI é dado pessoal.');
    }
    const sanitization = sanitizationFor(data);
    if (!sanitization) return refuse('Gravação recusada: o objeto não passou pela whitelist.');
    const findings = detectPii(data);
    if (findings.length > 0) {
      const rules = [...new Set(findings.map((f) => f.rule))].join(', ');
      return refuse(`Gravação recusada: dado pessoal detectado (${rules}).`);
    }
    const envelope = createEnvelope({
      source: destination.source,
      key,
      origin: options.origin ?? 'live',
      recordedAt: (options.now?.() ?? new Date()).toISOString(),
      recordedBy: options.recordedBy ?? 'scripts/record-fixtures.ts',
      sanitization,
      data,
    });
    const path = join(destination.dir, `${key}.json`);
    write(path, `${JSON.stringify(envelope, null, 2)}\n`);
    options.onRecorded?.(path);
    return null;
  };

  return new Proxy(provider, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver) as unknown;
      if (typeof original !== 'function') return original;
      return (...args: unknown[]) => {
        const out = (original as (...a: unknown[]) => unknown).apply(target, args);
        const key = fixtureKey(args);
        if (out !== null && typeof out === 'object' && Symbol.asyncIterator in out) {
          return (async function* () {
            const items: unknown[] = [];
            let failed = false;
            for await (const page of out as AsyncIterable<unknown>) {
              if (isResult(page) && page.ok && Array.isArray(page.value)) items.push(...page.value);
              else failed = true;
              yield page;
            }
            // Pages are recorded together, only when the whole listing succeeded.
            const refused = failed || items.length === 0 ? null : record(key, items);
            if (refused) yield refused;
          })();
        }
        if (out instanceof Promise) {
          return out.then((r: unknown) => {
            if (!isResult(r) || !r.ok) return r;
            return record(key, r.value) ?? r;
          });
        }
        return out;
      };
    },
  });
}
