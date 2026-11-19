import 'server-only';
import type { LawChangeSummary, LawChangeSummaryInput } from '@refund/ai';
import {
  type Db,
  ensureMonitoredRegulation,
  insertLawChange,
  lawAlertRecipients,
  markMonitorChecked,
  markRuleFindingsOutdated,
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
// (model behind the guards, or template) → alert e-mail. It writes to the database only and NEVER changes a parameter:
// a new parameter period is a commit with golden cases, after a person reviews the change.

export interface LawProcessDeps {
  db: Db;
  summarize: (input: LawChangeSummaryInput) => Promise<LawChangeSummary>;
  /** Sends the alert to the owners of the affected analyses (no-op when e-mail is off). */
  notify: (
    recipients: { userId: string; emailEncrypted: string }[],
    regulationLabel: string,
  ) => Promise<void>;
}

export async function processFirecrawlEvent(
  ev: VerifiedEvent,
  deps: LawProcessDeps,
): Promise<'processed' | 'ignored'> {
  const parsed = sanitizeFirecrawlEvent(ev.payload);
  if (!parsed.ok) return 'ignored';
  const event = parsed.value;

  if (event.type === 'monitor.check.completed') {
    let touched = 0;
    for (const c of event.checks) touched += await markMonitorChecked(deps.db, c.monitorId);
    return touched > 0 ? 'processed' : 'ignored';
  }

  let recorded = 0;
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
    const id = await insertLawChange(deps.db, {
      regulationId: reg.id,
      url: reg.url,
      eventId: i === 0 ? ev.eventId : `${ev.eventId}:${i}`,
      diffText: page.diffText,
      judgment: page.judgment?.reason ?? null,
      affectedArticles: articles,
      affectedRules: rules,
    });
    if (id === null) continue;
    recorded++;

    const summary = await deps.summarize({
      diff: page.diffText,
      regulationLabel: reg.short,
      articleLabels: articles.flatMap((a) => article(a)?.label ?? []),
    });
    await setLawChangeSummary(deps.db, id, summary.summary, summary.origin);
    const analysisIds = await markRuleFindingsOutdated(deps.db, rules, id);
    const recipients = await lawAlertRecipients(deps.db, analysisIds);
    logger.info('law.change_recorded', {
      regulationId: reg.id,
      articles: articles.length,
      rules: rules.length,
      analyses: analysisIds.length,
      recipients: recipients.length,
      summaryOrigin: summary.origin,
    });
    if (recipients.length > 0) await deps.notify(recipients, reg.short);
  }
  return recorded > 0 ? 'processed' : 'ignored';
}
