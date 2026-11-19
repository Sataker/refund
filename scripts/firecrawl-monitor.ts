// Creates (or updates) the Firecrawl monitor of the legal corpus (ARCHITECTURE §2.6; ADR-013; EXECUTION E16 task 1):
// one scrape target per regulation of @refund/law, git-diff change tracking, a daily check at 07:00 São Paulo time,
// and the webhook `monitor.page` + `monitor.check.completed` → /api/webhooks/firecrawl. Firecrawl signs every
// delivery with the account's HMAC secret (firecrawl.dev → Settings → Advanced), which goes into the Vercel variable
// FIRECRAWL_WEBHOOK_SECRET; this script never sees it.
//
// Usage (local only, never on Vercel; INFRA-CI §1.2):
//   node scripts/firecrawl-monitor.ts                      prints the request body (dry run, no network)
//   node scripts/firecrawl-monitor.ts --apply              POST /v2/monitor (needs FIRECRAWL_API_KEY)
//   node scripts/firecrawl-monitor.ts --apply --monitor=<id>   PATCH that monitor instead
// With DATABASE_URL_DIRECT set, --apply also records the monitor id in refund.monitored_regulations (the database is
// the only thing it writes; nothing goes to Git). Request shape: docs.firecrawl.dev/features/monitoring (19/11/2026).
import { regulations } from '../packages/law/src/index.ts';

const API = 'https://api.firecrawl.dev/v2/monitor';
/** Local-only variables (INFRA-CI §1.2), read by name like scripts/record-ai.ts. */
const envVar = (name: string): string | undefined => process.env[name] || undefined;
const TIMEOUT_MS = 30_000;
/** Daily, 07:00 in São Paulo: before the working day, after the DOU's overnight publication. */
const SCHEDULE = { cron: '0 7 * * *', timezone: 'America/Sao_Paulo' } as const;
const GOAL =
  'Alert when the wording of a provision changes in a way that can change a tax calculation: a rate, an amount, ' +
  'a limit, a bracket, a deadline, an effective date, or who may opt into a regime. Ignore layout, links and ' +
  'navigation changes.';

export interface MonitorRequest {
  name: string;
  schedule: typeof SCHEDULE;
  goal: string;
  judgeEnabled: true;
  targets: {
    type: 'scrape';
    urls: string[];
    scrapeOptions: { formats: { type: 'changeTracking'; modes: ['git-diff'] }[] };
  }[];
  webhook: {
    url: string;
    metadata: Record<string, string>;
    events: ['monitor.page', 'monitor.check.completed'];
  };
  retentionDays: number;
}

/** The monitor body: one target per corpus regulation (Firecrawl allows up to 50). */
export function monitorRequest(siteUrl: string): MonitorRequest {
  const urls = [...new Set(regulations.map((r) => r.url))];
  if (urls.length > 50) throw new Error(`${urls.length} regulations: above Firecrawl's 50 targets`);
  return {
    name: 'refund-corpus',
    schedule: SCHEDULE,
    goal: GOAL,
    judgeEnabled: true,
    targets: urls.map((url) => ({
      type: 'scrape',
      urls: [url],
      scrapeOptions: { formats: [{ type: 'changeTracking', modes: ['git-diff'] }] },
    })),
    webhook: {
      url: new URL('/api/webhooks/firecrawl', siteUrl).toString(),
      metadata: { app: 'refund' },
      events: ['monitor.page', 'monitor.check.completed'],
    },
    retentionDays: 90,
  };
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const existing = process.argv.find((a) => a.startsWith('--monitor='))?.slice('--monitor='.length);
  const site = envVar('NEXT_PUBLIC_SITE_URL') ?? 'https://userefund.com.br';
  const body = monitorRequest(site);
  if (!apply) {
    console.log(JSON.stringify(body, null, 2));
    console.log(`\n${body.targets.length} targets. Dry run: pass --apply to create the monitor.`);
    return;
  }
  const key = envVar('FIRECRAWL_API_KEY');
  if (!key) {
    console.error('FIRECRAWL_API_KEY is not set.');
    process.exit(1);
  }
  const res = await fetch(existing ? `${API}/${encodeURIComponent(existing)}` : API, {
    method: existing ? 'PATCH' : 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => null)) as {
    success?: boolean;
    data?: { id?: string; nextRunAt?: string; estimatedCreditsPerMonth?: number };
    error?: string;
  } | null;
  if (!res.ok || !json?.success || typeof json.data?.id !== 'string') {
    console.error(`Firecrawl answered ${res.status}: ${json?.error ?? 'unexpected body'}`);
    process.exit(1);
  }
  const monitorId = json.data.id;
  console.log(
    `monitor ${monitorId}: next run ${json.data.nextRunAt ?? '?'}, ~${json.data.estimatedCreditsPerMonth ?? '?'} credits/month`,
  );

  const dbUrl = envVar('DATABASE_URL_DIRECT');
  if (!dbUrl) {
    console.log('DATABASE_URL_DIRECT not set: monitored_regulations not updated.');
    return;
  }
  const { createDb, ensureMonitoredRegulation, setFirecrawlMonitorId } = await import(
    '../packages/db/src/index.ts'
  );
  const handle = await createDb({ url: dbUrl, ssl: envVar('DB_SSL') !== 'disable', max: 1 });
  try {
    for (const r of regulations) {
      await ensureMonitoredRegulation(handle.db, { regulationId: r.id, url: r.url });
    }
    await setFirecrawlMonitorId(
      handle.db,
      regulations.map((r) => r.id),
      monitorId,
    );
    console.log(`monitored_regulations: ${regulations.length} rows linked to ${monitorId}.`);
  } finally {
    await handle.close();
  }
}

if (import.meta.main) await main();
