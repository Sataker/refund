import { z } from 'zod';
import { fail, ok } from '../result.ts';
import type { Result } from '../types.ts';

// Firecrawl monitor webhooks (ARCHITECTURE §2.6, §4.8; whitelist §6.2 "Firecrawl"). The payload shape follows
// Firecrawl's documented `monitor.page` / `monitor.check.completed` events (docs.firecrawl.dev, features/monitoring
// and api-reference/webhooks-openapi.json, read on 19/11/2026). Only `url`, `status`, `isMeaningful`, `judgment`,
// `diff.text` (law text is public) and our own `metadata` survive; scrape ids, `diff.json` and anything else are
// dropped before the data reaches the database, a fixture or a log.

export const FIRECRAWL_WHITELIST = 'firecrawl@1';

export type MonitorPageStatus = 'same' | 'new' | 'changed' | 'removed' | 'error';

export interface MonitorJudgment {
  meaningful: boolean;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

/** One monitored page of a `monitor.page` delivery, whitelisted. */
export interface MonitorPage {
  url: string;
  status: MonitorPageStatus;
  /** null when Firecrawl did not judge the change (no goal, or judging off). */
  isMeaningful: boolean | null;
  judgment: MonitorJudgment | null;
  /** Unified markdown diff of the page; null when the page did not change. */
  diffText: string | null;
}

export type MonitorEvent =
  | { type: 'monitor.page'; pages: MonitorPage[]; metadata: Record<string, string> }
  | {
      type: 'monitor.check.completed';
      checks: { monitorId: string; status: string }[];
      metadata: Record<string, string>;
    };

/** Longest diff kept (a law page diff; the webhook body itself is capped at 64 KB). */
export const MAX_DIFF_CHARS = 60_000;

const judgmentSchema = z.object({
  meaningful: z.boolean(),
  confidence: z.enum(['high', 'medium', 'low']),
  reason: z.string().max(2_000),
});

const pageSchema = z.object({
  url: z.url(),
  status: z.enum(['same', 'new', 'changed', 'removed', 'error']),
  isMeaningful: z.boolean().nullish(),
  judgment: judgmentSchema.nullish(),
  diff: z.object({ text: z.string().nullish() }).nullish(),
});

const metadataSchema = z.record(z.string(), z.string()).nullish();

const pageEventSchema = z.object({
  type: z.literal('monitor.page'),
  data: z.array(pageSchema).max(50),
  metadata: metadataSchema,
});

const checkEventSchema = z.object({
  type: z.literal('monitor.check.completed'),
  data: z.array(z.object({ monitorId: z.string().max(80), status: z.string().max(40) })).max(50),
  metadata: metadataSchema,
});

const ourMetadata = (m: Record<string, string> | null | undefined): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(m ?? {})) if (k.length <= 40) out[k] = v.slice(0, 200);
  return out;
};

/**
 * Parses and whitelists a Firecrawl monitor event (already HMAC-verified). Unknown event types and malformed bodies
 * are INVALID; the caller decides whether that is a 400 or an ignored event.
 */
export function sanitizeFirecrawlEvent(raw: unknown): Result<MonitorEvent> {
  const type = (raw as { type?: unknown } | null)?.type;
  if (type === 'monitor.page') {
    const parsed = pageEventSchema.safeParse(raw);
    if (!parsed.success) return fail('INVALID', 'firecrawl', 'Evento do monitor fora do formato.');
    return ok({
      type,
      metadata: ourMetadata(parsed.data.metadata),
      pages: parsed.data.data.map((p) => ({
        url: p.url,
        status: p.status,
        isMeaningful: p.isMeaningful ?? null,
        judgment: p.judgment
          ? {
              meaningful: p.judgment.meaningful,
              confidence: p.judgment.confidence,
              reason: p.judgment.reason,
            }
          : null,
        diffText: p.diff?.text ? p.diff.text.slice(0, MAX_DIFF_CHARS) : null,
      })),
    });
  }
  if (type === 'monitor.check.completed') {
    const parsed = checkEventSchema.safeParse(raw);
    if (!parsed.success) return fail('INVALID', 'firecrawl', 'Evento do monitor fora do formato.');
    return ok({
      type,
      metadata: ourMetadata(parsed.data.metadata),
      checks: parsed.data.data.map((c) => ({ monitorId: c.monitorId, status: c.status })),
    });
  }
  return fail('INVALID', 'firecrawl', 'Tipo de evento do monitor desconhecido.');
}

/** A change worth recording (ARCHITECTURE §2.6 "isMeaningful?"): changed, with a diff, not judged irrelevant. */
export function isMeaningfulChange(page: MonitorPage): boolean {
  return page.status === 'changed' && page.diffText !== null && page.isMeaningful !== false;
}
