// "Law changed" repository (SCHEMA §2.7; ARCHITECTURE §2.6): idempotent change, outdated findings by rule,
// recipients, review. PGlite with the real migrations.
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db, DbHandle } from '../src/client.ts';
import {
  ensureMonitoredRegulation,
  insertLawChange,
  lawAlertRecipients,
  listLawChanges,
  markMonitorChecked,
  markRuleFindingsOutdated,
  reviewLawChange,
  setFirecrawlMonitorId,
  setLawChangeSummary,
  touchMonitoredRegulation,
} from '../src/repos/law.ts';
import { findings, lawChanges, monitoredRegulations } from '../src/schema/index.ts';
import { makeAnalysis, makeCompany, makeFinding, makeUser, memoryDb } from './factories.ts';

let h: DbHandle;
let db: Db;
beforeAll(async () => {
  h = await memoryDb();
  db = h.db;
});
afterAll(() => h.close());

const URL_LC123 = 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm';

const change = (eventId: string) => ({
  regulationId: 'lc123-2006',
  url: URL_LC123,
  eventId,
  diffText: '-a\n+b',
  judgment: 'reason',
  affectedArticles: ['lc123-2006/art18-a/p1'],
  affectedRules: ['R03'],
});

describe('monitored regulations', () => {
  it('ensure is idempotent and keeps the monitor id; touch and check stamp the dates', async () => {
    await ensureMonitoredRegulation(db, { regulationId: 'lc123-2006', url: URL_LC123 });
    await setFirecrawlMonitorId(db, ['lc123-2006'], 'mon-1');
    await ensureMonitoredRegulation(db, { regulationId: 'lc123-2006', url: 'https://x.test' });
    await touchMonitoredRegulation(db, 'lc123-2006', false);
    let [row] = await db.select().from(monitoredRegulations);
    expect(row).toMatchObject({ url: URL_LC123, firecrawlMonitorId: 'mon-1', lastChangedAt: null });
    expect(row?.lastCheckedAt).toBeInstanceOf(Date);
    await touchMonitoredRegulation(db, 'lc123-2006', true);
    [row] = await db.select().from(monitoredRegulations);
    expect(row?.lastChangedAt).toBeInstanceOf(Date);
    expect(await markMonitorChecked(db, 'mon-1')).toBe(1);
    expect(await markMonitorChecked(db, 'other')).toBe(0);
    await setFirecrawlMonitorId(db, [], 'ignored');
  });
});

describe('law changes', () => {
  it('insert is idempotent on event_id; summary and review are recorded', async () => {
    const id = await insertLawChange(db, change('sha-1'));
    expect(id).toEqual(expect.any(String));
    expect(await insertLawChange(db, change('sha-1'))).toBeNull();
    await setLawChangeSummary(db, id as string, 'Mudou.', 'template');
    const [row] = await listLawChanges(db, { status: 'new' });
    expect(row).toMatchObject({
      id,
      status: 'new',
      summary: 'Mudou.',
      summaryOrigin: 'template',
      affectedRules: ['R03'],
    });
    expect(await reviewLawChange(db, id as string, 'reviewed', null)).toBe(true);
    expect(await listLawChanges(db, { status: 'new' })).toEqual([]);
    const [reviewed] = await db
      .select()
      .from(lawChanges)
      .where(eq(lawChanges.id, id as string));
    expect(reviewed?.reviewedAt).toBeInstanceOf(Date);
    expect(
      await reviewLawChange(db, '00000000-0000-4000-8000-000000000000', 'dismissed', null),
    ).toBe(false);
  });

  it('marks the findings of the affected rules once and finds the owners with an e-mail', async () => {
    const withEmail = await makeUser(db, { emailEncrypted: 'v1.cipher' });
    const without = await makeUser(db);
    const company = await makeCompany(db);
    const a1 = await makeAnalysis(db, withEmail.id, company.id);
    const a2 = await makeAnalysis(db, without.id, company.id);
    const f1 = await makeFinding(db, a1.id, 'R03', []);
    const f2 = await makeFinding(db, a2.id, 'R03', []);
    const f3 = await makeFinding(db, a1.id, 'R01', []);
    const changeId = await insertLawChange(db, change('sha-2'));
    const affected = await markRuleFindingsOutdated(db, ['R03'], changeId as string);
    expect(affected.sort()).toEqual([a1.id, a2.id].sort());
    expect(await markRuleFindingsOutdated(db, ['R03'], changeId as string)).toEqual([]);
    expect(await markRuleFindingsOutdated(db, [], changeId as string)).toEqual([]);
    const rows = await db.select().from(findings);
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(f1.id)).toMatchObject({ outdated: true, lawChangeId: changeId });
    expect(byId.get(f2.id)?.outdated).toBe(true);
    expect(byId.get(f3.id)?.outdated).toBe(false);
    expect(await lawAlertRecipients(db, affected)).toEqual([
      { userId: withEmail.id, emailEncrypted: 'v1.cipher' },
    ]);
    expect(await lawAlertRecipients(db, [])).toEqual([]);
  });
});
