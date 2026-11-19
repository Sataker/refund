import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { regulations } from '../../packages/law/src/index.ts';
import { monitorRequest } from '../firecrawl-monitor.ts';

// E16 task 1: one target per corpus regulation, daily in São Paulo, webhook to our route (no network here).

describe('monitorRequest', () => {
  const body = monitorRequest('https://userefund.com.br');

  it('has one git-diff scrape target per regulation URL', () => {
    const urls = body.targets.flatMap((t) => t.urls);
    assert.deepEqual(new Set(urls), new Set(regulations.map((r) => r.url)));
    assert.equal(urls.length, new Set(urls).size);
    for (const t of body.targets) {
      assert.equal(t.urls.length, 1);
      assert.deepEqual(t.scrapeOptions.formats, [{ type: 'changeTracking', modes: ['git-diff'] }]);
    }
  });

  it('runs daily on São Paulo time and posts both events to the webhook', () => {
    assert.deepEqual(body.schedule, { cron: '0 7 * * *', timezone: 'America/Sao_Paulo' });
    assert.equal(body.webhook.url, 'https://userefund.com.br/api/webhooks/firecrawl');
    assert.deepEqual(body.webhook.events, ['monitor.page', 'monitor.check.completed']);
    assert.equal(body.judgeEnabled, true);
  });
});
