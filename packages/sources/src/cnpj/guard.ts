import type { ProviderError } from '../types.ts';

// In-memory health of each live CNPJ source (E21): pacing for the 3-per-minute free tiers and a
// simple circuit breaker, so a source that keeps failing is skipped instead of costing 4 s on every
// lookup. Per process: a serverless instance learns on its own, which is enough for a demo-sized load.

export interface ProviderGuardOptions {
  /** Consecutive failures that open the circuit. */
  failureThreshold?: number;
  /** How long an open circuit skips the source. */
  openMs?: number;
  /** Minimum pause after a 429 without a usable Retry-After. */
  rateLimitedMs?: number;
  now?: () => number;
}

export type SkipReason = 'circuit_open' | 'paced';

export interface ProviderHealth {
  source: string;
  /**
   * `unknown` until the source is asked once in this process; `down` while the circuit is open;
   * `failing` after a failure below the threshold; `paced` inside a 3/min source's interval.
   */
  state: 'up' | 'failing' | 'down' | 'paced' | 'unknown';
  consecutiveFailures: number;
  /** ISO-8601 of the last answer (a company or a "not found"), rounded down to the minute. */
  lastOkAt: string | null;
  /** Error code of the last failure, never its message. */
  lastFailure: ProviderError['code'] | null;
}

interface Entry {
  failures: number;
  openUntil: number;
  lastCallAt: number | null;
  lastOkAt: number | null;
  lastFailure: ProviderError['code'] | null;
  /** Half-open: one probe call is in flight until this time (a safety cap; the call clears it). */
  probingUntil: number;
}

/** A Retry-After above this is treated as a misconfigured header, not a 3-hour outage. */
export const MAX_RETRY_AFTER_MS = 10 * 60_000;

/** Codes that say "this source is not answering", as opposed to an answer about the CNPJ itself. */
const BREAKER_CODES: ReadonlySet<ProviderError['code']> = new Set([
  'TIMEOUT',
  'UNAVAILABLE',
  'UNEXPECTED_RESPONSE',
  'UNAUTHORIZED',
]);

export class CnpjProviderGuard {
  private readonly entries = new Map<string, Entry>();
  private readonly failureThreshold: number;
  private readonly openMs: number;
  private readonly rateLimitedMs: number;
  readonly now: () => number;

  constructor(options: ProviderGuardOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 3;
    this.openMs = options.openMs ?? 2 * 60_000;
    this.rateLimitedMs = options.rateLimitedMs ?? 60_000;
    this.now = options.now ?? Date.now;
  }

  private entry(source: string): Entry {
    let e = this.entries.get(source);
    if (!e) {
      e = {
        failures: 0,
        openUntil: 0,
        lastCallAt: null,
        lastOkAt: null,
        lastFailure: null,
        probingUntil: 0,
      };
      this.entries.set(source, e);
    }
    return e;
  }

  /**
   * May the source be called now? When it may, the call is booked (pacing counts from here). After the
   * open window a single call goes through (half-open): concurrent lookups keep skipping the source
   * while that probe is in flight, and one more failure re-opens the circuit at once.
   */
  admit(source: string, minIntervalMs = 0): { ok: true } | { ok: false; reason: SkipReason } {
    const e = this.entry(source);
    const now = this.now();
    if (now < e.openUntil) return { ok: false, reason: 'circuit_open' };
    const halfOpen = e.openUntil > 0;
    if (halfOpen && now < e.probingUntil) return { ok: false, reason: 'circuit_open' };
    if (minIntervalMs > 0 && e.lastCallAt !== null && now - e.lastCallAt < minIntervalMs) {
      return { ok: false, reason: 'paced' };
    }
    if (halfOpen) e.probingUntil = now + this.openMs;
    e.lastCallAt = now;
    return { ok: true };
  }

  /** The source answered (a company, or a well-formed "not found"). */
  success(source: string): void {
    const e = this.entry(source);
    e.failures = 0;
    e.openUntil = 0;
    e.probingUntil = 0;
    e.lastOkAt = this.now();
  }

  failure(source: string, error: ProviderError): void {
    if (error.code === 'NOT_FOUND') {
      this.success(source);
      return;
    }
    const e = this.entry(source);
    e.lastFailure = error.code;
    e.probingUntil = 0;
    if (error.code === 'RATE_LIMITED') {
      const pause = Math.min(
        Math.max(error.retryInMs ?? 0, this.rateLimitedMs),
        MAX_RETRY_AFTER_MS,
      );
      e.openUntil = this.now() + pause;
      return;
    }
    if (!BREAKER_CODES.has(error.code)) {
      // A probe that ended in a neutral error (e.g. 400) keeps the circuit half-open for the next call.
      return;
    }
    e.failures += 1;
    if (e.failures >= this.failureThreshold) e.openUntil = this.now() + this.openMs;
  }

  /** For the deep health: state only, no CNPJ, no message. */
  snapshot(sources: readonly { source: string; minIntervalMs: number }[]): ProviderHealth[] {
    const now = this.now();
    return sources.map(({ source, minIntervalMs }) => {
      const e = this.entries.get(source);
      if (!e || e.lastCallAt === null) {
        return {
          source,
          state: 'unknown',
          consecutiveFailures: 0,
          lastOkAt: null,
          lastFailure: null,
        };
      }
      const open = now < e.openUntil;
      const paced = minIntervalMs > 0 && now - e.lastCallAt < minIntervalMs;
      return {
        source,
        state: open ? 'down' : e.failures > 0 ? 'failing' : paced ? 'paced' : 'up',
        consecutiveFailures: e.failures,
        // Minute precision: enough to read the health, without timing individual lookups (review, item 7).
        lastOkAt:
          e.lastOkAt === null
            ? null
            : new Date(Math.floor(e.lastOkAt / 60_000) * 60_000).toISOString(),
        lastFailure: e.lastFailure,
      };
    });
  }
}
