import 'server-only';
import {
  type Db,
  ensureMonitoredRegulation,
  lawAlertRecipients,
  markMonitorChecked,
  recordLawChange,
  setLawChangeSummary,
  touchMonitoredRegulation,
} from '@refund/db';
import { article } from '@refund/law';
import { isMeaningfulChange, sanitizeFirecrawlEvent } from '@refund/sources';
import { affectedArticles, affectedRules, regulationOfUrl } from '@/features/law/change.ts';
import { logger } from '../log.ts';
import type { VerifiedEvent } from '../webhooks/types.ts';

// The "law changed" flow after a verified Firecrawl webhook (ARCHITECTURE §2.6; ADR-013):
// monitor.page → law_changes (diff, affected articles) → rules via rulesByRef → findings.outdated = true → summary
// (template) → alert e-mail. It writes to the database only and NEVER changes a parameter: a new parameter period is
// a commit with golden cases, after a person reviews the change.

export interface LawProcessDeps {
  db: Db;
  /** Summary of the change: template only for now (code review E16, M2: no scraped diff goes to the model). */
  summarize: (input: {
    regulationLabel: string;
    articleLabels: string[];
  }) => Promise<{ summary: string; origin: 'llm' | 'template' }>;
  /** Sends the alert to the owners of the affected analyses (no-op when e-mail is off). */
  notify: (
    recipients: { userId: string; emailEncrypted: string }[],
    regulationLabel: string,
  ) => Promise<void>;
}

/** Bound of the summary step: the alert never waits on it (code review E16, H1). */
export const SUMMARY_TIMEOUT_MS = 8_000;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

export async function processFirecrawlEvent(
  ev: VerifiedEvent,
  deps: LawProcessDeps,
  options: { summaryTimeoutMs?: number } = {},
): Promise<'processed' | 'ignored'> {
  const parsed = sanitizeFirecrawlEvent(ev.payload);
  if (!parsed.ok) return 'ignored';
  const event = parsed.value;

  if (event.type === 'monitor.check.completed') {
    let touched = 0;
    for (const c of event.checks) touched += await markMonitorChecked(deps.db, c.monitorId);
    return touched > 0 ? 'processed' : 'ignored';
  }

  // Phase 1, durable (code review E16, H1): every page's change and its outdated findings, one transaction each,
  // before anything slow. A summary or e-mail failure below can no longer leave a finding unmarked; a repeated change
  // re-marks (idempotent).
  const recorded: {
    id: string;
    analysisIds: string[];
    regulationLabel: string;
    articleLabels: string[];
  }[] = [];
  for (const [i, page] of event.pages.entries()) {
    const reg = regulationOfUrl(page.url);
    if (!reg) {
      logger.info('law.unknown_page', { status: page.status });
      continue;
    }
    await ensureMonitoredRegulation(deps.db, { regulationId: reg.id, url: reg.url });
    await touchMonitoredRegulation(deps.db, reg.id, page.status === 'changed');
    if (!isMeaningfulChange(page) || page.diffText === null) continue;

    const articles = affectedArticles(reg.id, page.diffText);
    const rules = affectedRules(articles);
    const change = await recordLawChange(deps.db, {
      regulationId: reg.id,
      url: reg.url,
      eventId: i === 0 ? ev.eventId : `${ev.eventId}:${i}`,
      diffText: page.diffText,
      judgment: page.judgment?.reason ?? null,
      affectedArticles: articles,
      affectedRules: rules,
    });
    logger.info('law.change_recorded', {
      regulationId: reg.id,
      created: change.created,
      articles: articles.length,
      rules: rules.length,
      analyses: change.analysisIds.length,
    });
    recorded.push({
      id: change.id,
      analysisIds: change.analysisIds,
      regulationLabel: reg.short,
      articleLabels: articles.flatMap((a) => article(a)?.label ?? []),
    });
  }

  // Phase 2, best-effort: the summary (bounded) and the alert. Each failure is logged and never undoes phase 1.
  for (const r of recorded) {
    try {
      const summary = await withTimeout(
        deps.summarize({ regulationLabel: r.regulationLabel, articleLabels: r.articleLabels }),
        options.summaryTimeoutMs ?? SUMMARY_TIMEOUT_MS,
      );
      await setLawChangeSummary(deps.db, r.id, summary.summary, summary.origin);
    } catch (err) {
      logger.warn('law.summary_failed', { error: err });
    }
    try {
      const recipients = await lawAlertRecipients(deps.db, r.analysisIds);
      if (recipients.length > 0) await deps.notify(recipients, r.regulationLabel);
    } catch (err) {
      logger.warn('law.alert_failed', { error: err });
    }
  }
  return recorded.length > 0 ? 'processed' : 'ignored';
}
