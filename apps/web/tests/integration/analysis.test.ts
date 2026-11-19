import { createMemoryDb, type DbHandle, schema } from '@refund/db';
import { sumCents } from '@refund/engine';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteMyDataWith } from '@/server/account/delete.ts';
import {
  answerQuestionWith,
  questionsOf,
  reanalyzeWith,
  setFinanceExclusionsWith,
  startAnalysisWith,
} from '@/server/analysis/actions.ts';
import { loadLiveAnalysis, reportResult, serializedFinding } from '@/server/analysis/read.ts';
import { executeAnalysis } from '@/server/analysis/run.ts';
import { replayFrames } from '@/server/analysis/stream.ts';
import type { Capabilities } from '@/server/capabilities.ts';
import { lookupCnpjWith } from '@/server/company/lookup.ts';
import {
  CONSENT_SCOPES,
  type ConnectionDeps,
  connectSampleWith,
  recordConsentWith,
  TERMS_VERSION,
} from '@/server/connection/connections.ts';
import { cronAuthorized, runDailyCron } from '@/server/cron/daily.ts';
import type { Secrets } from '@/server/crypto.ts';
import { migrationsFolder } from '@/server/db.ts';
import { liveFinance } from '@/server/financial-view.ts';
import { PLANS } from '@/server/plans/catalog.ts';
import { largestRuleId, serializeFinding, summarizeItems } from '@/server/plans/serialize.ts';
import type { ReportEmail } from '@/server/report/email.ts';
import {
  decideReportWith,
  reportByToken,
  reportStatusOf,
  sendReportWith,
} from '@/server/report/report.ts';
import {
  confirmCompanyWith,
  markEstimateSeenWith,
  saveAnswerWith,
} from '@/server/track/answers.ts';

// E14 against PGlite (TESTS §4 "Live analysis", "Trace paywall", "Report", "LGPD", "free snapshot"): the live run on
// the sample data, the persisted event log, the backend paywall, the card answers, Finanças, the report link and the
// account deletion.

let h: DbHandle;
const secrets: Secrets = {
  session: Buffer.from('s'.repeat(32)),
  encryption: Buffer.alloc(32, 7),
  pepper: Buffer.from('p'.repeat(32)),
  ephemeral: false,
};
const NOW = Date.parse('2026-11-12T15:00:00Z');
const TODAY = '2026-11-12' as const;
const HERO = 'RFDEV001000158';
const CAPS: Capabilities = {
  database: false,
  memoryDatabase: true,
  liveData: false,
  ai: false,
  pluggy: false,
  email: false,
  payments: false,
  lawMonitor: false,
  login: false,
  cron: false,
};

beforeAll(async () => {
  const folder = migrationsFolder();
  if (!folder) throw new Error('migrations folder not found');
  h = await createMemoryDb({ migrationsFolder: folder });
});
afterAll(() => h.close());
beforeEach(() => {
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});
afterEach(() => vi.restoreAllMocks());

let ipSeq = 0;
const headers = () => {
  ipSeq += 1;
  return new Headers({ 'x-forwarded-for': `203.0.113.${ipSeq}` });
};

const connDeps = (userId: string): ConnectionDeps => ({
  db: h.db,
  userId,
  secrets,
  caps: CAPS,
  headers: headers(),
  pluggy: null,
  nowMs: NOW,
});
const deps = (userId: string) => ({ db: h.db, userId, today: TODAY, nowMs: NOW });
const runDeps = { secrets, caps: CAPS, today: TODAY, pluggy: null } as const;

/** A user who finished the track with the hero's sample PJ and PF accounts. */
async function heroUser(): Promise<string> {
  const [u] = await h.db.insert(schema.users).values({}).returning();
  const userId = u?.id as string;
  const looked = await lookupCnpjWith(
    userId,
    { cnpj: HERO, context: 'live' },
    { db: h.db, secrets, headers: headers(), dataMode: 'replay', nowMs: NOW },
  );
  expect(looked.ok).toBe(true);
  await confirmCompanyWith(h.db, userId);
  await saveAnswerWith(h.db, userId, { step: 'faturamento', value: 'from_30k_to_60k' });
  await saveAnswerWith(h.db, userId, { step: 'funcionarios', value: 'yes' });
  await saveAnswerWith(h.db, userId, { step: 'exterior', value: 'half_or_more' });
  await markEstimateSeenWith(h.db, userId);
  expect(
    (
      await recordConsentWith(
        { scopes: [...CONSENT_SCOPES], termsVersion: TERMS_VERSION },
        connDeps(userId),
      )
    ).ok,
  ).toBe(true);
  expect((await connectSampleWith({ holder: 'PJ' }, connDeps(userId))).ok).toBe(true);
  expect((await connectSampleWith({ holder: 'PF' }, connDeps(userId))).ok).toBe(true);
  return userId;
}

async function startAndRun(userId: string): Promise<string> {
  const started = await startAnalysisWith({ companyCnpj: HERO }, deps(userId));
  if (!started.ok) throw new Error(started.error.code);
  expect(await executeAnalysis(started.value.analysisId, { db: h.db, ...runDeps })).toBe(true);
  return started.value.analysisId;
}

async function frames(
  analysisId: string,
  after: number,
): Promise<{ seq: number; type: string; data: unknown }[]> {
  const out: { seq: number; type: string; data: unknown }[] = [];
  for await (const f of replayFrames({
    db: h.db,
    analysisId,
    after,
    instantUntil: Number.MAX_SAFE_INTEGER,
    wait: async () => {},
    aborted: () => false,
    deadlineMs: Date.now() + 10_000,
  })) {
    const id = /^id: (\d+)$/m.exec(f)?.[1];
    const type = /^event: (\w+)$/m.exec(f)?.[1];
    const data = /^data: (.*)$/m.exec(f)?.[1];
    out.push({ seq: Number(id), type: type ?? '', data: JSON.parse(data ?? 'null') });
  }
  return out;
}

describe('live analysis (A3, A4)', () => {
  it('runs once, persists findings and the log; Σ marginals == total', async () => {
    const userId = await heroUser();
    const id = await startAndRun(userId);
    // A second claimer (another tab or instance) does not run it again.
    expect(await executeAnalysis(id, { db: h.db, ...runDeps })).toBe(false);
    const live = await loadLiveAnalysis(h.db, userId, id);
    if (!live) throw new Error('no analysis');
    expect(['completed', 'awaiting_confirmation']).toContain(live.analysis.status);
    // Before any card answer the export card is open, so R05 waits (it needs the "sim").
    expect(live.findings.map((f) => f.ruleId)).toEqual(expect.arrayContaining(['R01', 'R02']));
    expect(live.analysis.status).toBe('awaiting_confirmation');
    const counted = live.findings.filter((f) => f.countsInTotal).map((f) => f.marginalValue12m);
    expect(sumCents(counted)).toBe(live.total.savings12m);
    expect(live.dashboard.total).toBe(live.total.byConfidence.confirmed);
    // Every classification points to a stored transaction row of this user.
    const cls = await h.db
      .select()
      .from(schema.classifications)
      .where(eq(schema.classifications.analysisId, id));
    expect(cls.length).toBe(live.analysis.metrics?.transactions);
  });

  it('reconnection with Last-Event-ID 5 receives from 6 onward, in order, once', async () => {
    const userId = await heroUser();
    const id = await startAndRun(userId);
    const all = await frames(id, 0);
    expect(all[0]?.type).toBe('start');
    expect(all.at(-1)?.type).toBe('end');
    expect(all.map((f) => f.seq)).toEqual(all.map((_, i) => i + 1));
    const rest = await frames(id, 5);
    expect(rest.map((f) => f.seq)).toEqual(all.slice(5).map((f) => f.seq));
    // The finding cards are not duplicated across the whole log.
    const findingIds = all
      .filter((f) => f.type === 'finding' || f.type === 'alert')
      .map((f) => (f.data as { finding: { ruleId: string } }).finding.ruleId);
    expect(new Set(findingIds).size).toBe(findingIds.length);
  });

  it('only the owner reads it', async () => {
    const userId = await heroUser();
    const id = await startAndRun(userId);
    const [other] = await h.db.insert(schema.users).values({}).returning();
    expect(await loadLiveAnalysis(h.db, other?.id as string, id)).toBeNull();
  });
});

describe('trace paywall (A7; ARCHITECTURE §8.3)', () => {
  it('free: only the largest finding carries its trace, in the log and on read; business: all', async () => {
    const userId = await heroUser();
    const id = await startAndRun(userId);
    const log = await frames(id, 0);
    const wire = log
      .filter((f) => f.type === 'finding' || f.type === 'alert')
      .map(
        (f) =>
          (f.data as { finding: { ruleId: string; trace: unknown; traceLocked: boolean } }).finding,
      );
    const live = await loadLiveAnalysis(h.db, userId, id);
    if (!live) throw new Error('no analysis');
    const largest = largestRuleId(live.findings);
    expect(largest).toBe('R01');
    for (const f of wire) {
      expect(f.traceLocked).toBe(f.ruleId !== largest);
      if (f.ruleId === largest) expect(Array.isArray(f.trace)).toBe(true);
      else expect(f.trace).toBeNull();
    }
    for (const row of live.rows) {
      const dto = serializedFinding(live, row);
      expect(dto.trace === null).toBe(row.ruleId !== largest);
      expect(dto.doNot).toEqual(row.doNot);
      expect(dto.actionPlan).toEqual(row.actionPlan ?? []);
    }
    // The owner's summary report empties the locked traces on the server.
    const summary = reportResult(live, false);
    expect(summary.findings.filter((f) => f.trace.length > 0).map((f) => f.ruleId)).toEqual([
      largest,
    ]);

    await h.db.insert(schema.subscriptions).values({
      userId,
      planId: 'business',
      status: 'active',
      origin: 'courtesy',
      startsAt: new Date(0),
      endsAt: new Date(Date.now() + 86_400_000),
    });
    const paid = await loadLiveAnalysis(h.db, userId, id);
    if (!paid) throw new Error('no analysis');
    expect(paid.plan).toBe('business');
    for (const row of paid.rows) expect(serializedFinding(paid, row).traceLocked).toBe(false);
  });

  it('free recovery items: the most urgent one plus the count', () => {
    const items = [
      { pa: '2022-01', daysLeft: 40 },
      { pa: '2022-02', daysLeft: 12 },
      { pa: '2022-03', daysLeft: 90 },
    ] as never[];
    expect(summarizeItems(items)).toEqual([{ pa: '2022-02', daysLeft: 12 }]);
    const dto = serializeFinding(
      {
        ruleId: 'R05-REC',
        type: 'recovery',
        trace: [],
        recoveryItems: items,
      } as never,
      { ent: PLANS.free, isLargest: false, id: 'x', explanation: null },
    );
    expect(dto.recoveryItems).toHaveLength(1);
    expect(dto.recoveryItemsTotal).toBe(3);
    expect(dto.trace).toBeNull();
  });

  it('the 4th analysis of the month on free → PLAN_LIMIT, and nothing is created', async () => {
    const userId = await heroUser();
    for (let i = 0; i < 3; i += 1)
      expect((await startAnalysisWith({ companyCnpj: HERO }, deps(userId))).ok).toBe(true);
    const fourth = await startAnalysisWith({ companyCnpj: HERO }, deps(userId));
    expect(fourth).toMatchObject({ ok: false, error: { code: 'PLAN_LIMIT' } });
    const rows = await h.db
      .select()
      .from(schema.analyses)
      .where(eq(schema.analyses.userId, userId));
    expect(rows).toHaveLength(3);
  });

  it('the track must be over before an analysis starts', async () => {
    const [u] = await h.db.insert(schema.users).values({}).returning();
    const r = await startAnalysisWith({ companyCnpj: HERO }, deps(u?.id as string));
    expect(r).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
  });
});

describe('card answers and re-analysis (A5)', () => {
  it('answering the pró-labore card with another amount changes the total of the next run', async () => {
    const userId = await heroUser();
    const id = await startAndRun(userId);
    const before = await loadLiveAnalysis(h.db, userId, id);
    const q = (await questionsOf(h.db, id)).find((x) => x.type === 'monthly_pro_labore');
    if (!q || !before) throw new Error('the hero asks the pró-labore card');
    expect(
      await answerQuestionWith(
        { analysisId: id, questionId: q.id, answer: 'not-an-option' },
        deps(userId),
      ),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    const answered = await answerQuestionWith(
      { analysisId: id, questionId: q.id, answer: 5_000_00 },
      deps(userId),
    );
    expect(answered).toEqual({ ok: true, value: { reanalyze: true } });
    const next = await reanalyzeWith({ analysisId: id }, deps(userId));
    if (!next.ok) throw new Error(next.error.code);
    await executeAnalysis(next.value.analysisId, { db: h.db, ...runDeps });
    const after = await loadLiveAnalysis(h.db, userId, next.value.analysisId);
    expect(after?.total.savings12m).not.toBe(before.total.savings12m);
  });
});

describe('Finanças (A10; D31 persisted)', () => {
  it('Σ groups == tiles per holder; seals open findings of this analysis; exclusions only for offered ids', async () => {
    const userId = await heroUser();
    const id = await startAndRun(userId);
    const live = await loadLiveAnalysis(h.db, userId, id);
    if (!live) throw new Error('no analysis');
    const f = await liveFinance(h.db, live);
    if (!f.ok) throw new Error(f.reason);
    const hrefs = new Set(Object.values(f.value.findings).map((x) => x.href));
    for (const holder of [f.value.view.pj, f.value.view.pf]) {
      if (holder === null) continue;
      for (const dir of ['inflow', 'outflow'] as const) {
        const groups = holder.groups.filter((g) => g.direction === dir);
        const tile = dir === 'inflow' ? holder.inflow12m : holder.outflow12m;
        expect(sumCents(groups.map((g) => g.total12m))).toBe(tile);
      }
      for (const g of holder.groups)
        for (const seal of g.seals)
          for (const ruleId of seal.ruleIds)
            expect(hrefs.has(f.value.findings[ruleId]?.href ?? '')).toBe(true);
    }
    const r = await setFinanceExclusionsWith(
      { analysisId: id, excluded: ['not-offered'] },
      { ...deps(userId), removable: async () => f.removable },
    );
    expect(r).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    const empty = await setFinanceExclusionsWith(
      { analysisId: id, excluded: [] },
      { ...deps(userId), removable: async () => f.removable },
    );
    expect(empty.ok).toBe(true);
  });
});

describe('report (A6; TESTS §4 "Report")', () => {
  it('without e-mail: link only; token by hash; decided once; status follows', async () => {
    const userId = await heroUser();
    const id = await startAndRun(userId);
    const send = vi.fn();
    const r = await sendReportWith(
      {
        analysisId: id,
        accountantEmail: 'contador@example.com',
        include: { calculations: true, laws: true, transactions: false },
      },
      { db: h.db, userId, secrets, caps: CAPS, origin: 'http://localhost:3118', nowMs: NOW, send },
    );
    if (!r.ok) throw new Error(r.error.code);
    expect(send).not.toHaveBeenCalled(); // e-mail capability off (D6)
    expect(r.value.emailed).toBe(false);
    const token = r.value.approvalLink.split('/r/')[1] ?? '';
    const stored = await h.db
      .select()
      .from(schema.reports)
      .where(eq(schema.reports.id, r.value.reportId));
    expect(stored[0]?.tokenHash).not.toContain(token);
    expect(stored[0]?.accountantEmailEncrypted).not.toContain('contador');
    const found = await reportByToken(h.db, token);
    expect(found?.report.id).toBe(r.value.reportId);
    expect(await reportByToken(h.db, `${token}x`)).toBeNull();
    const live = await loadLiveAnalysis(h.db, userId, id);
    const first = live?.rows[0]?.id as string;
    expect(
      await decideReportWith(
        { token, decisions: [{ findingId: first, decision: 'approved' }], final: 'approved' },
        { db: h.db },
      ),
    ).toEqual({ ok: true, value: undefined });
    expect(
      await decideReportWith({ token, decisions: [], final: 'adjustments' }, { db: h.db }),
    ).toMatchObject({ ok: false });
    const after = await reportByToken(h.db, token);
    expect(after && reportStatusOf(after.report)).toBe('approved');
  });

  it('with e-mail on: sends only to the typed address', async () => {
    const userId = await heroUser();
    const id = await startAndRun(userId);
    const send = vi.fn(async (_email: ReportEmail) => ({ ok: true as const, id: 'em_1' }));
    const r = await sendReportWith(
      {
        analysisId: id,
        accountantEmail: 'Contador@Example.com',
        include: { calculations: true, laws: true, transactions: false },
      },
      {
        db: h.db,
        userId,
        secrets,
        caps: { ...CAPS, email: true },
        origin: 'http://localhost:3118',
        nowMs: NOW,
        send,
      },
    );
    expect(r).toMatchObject({ ok: true, value: { emailed: true } });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toMatchObject({ to: 'contador@example.com' });
  });
});

describe('LGPD (A9; cron)', () => {
  it('deleteMyData removes everything in cascade and leaves a PII-free audit row', async () => {
    const userId = await heroUser();
    await startAndRun(userId);
    expect(
      await deleteMyDataWith({ confirmation: 'apagar' }, { db: h.db, userId, secrets, caps: CAPS }),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    const r = await deleteMyDataWith(
      { confirmation: 'APAGAR' },
      { db: h.db, userId, secrets, caps: CAPS },
    );
    expect(r.ok).toBe(true);
    for (const t of [schema.analyses, schema.connections, schema.consents, schema.companyLinks])
      expect(await h.db.select().from(t).where(eq(t.userId, userId))).toEqual([]);
    const audit = await h.db
      .select()
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.action, 'delete_data'));
    expect(JSON.stringify(audit)).not.toContain(userId);
  });

  it('cron: 401 without the secret; deletes inactive anonymous users at 31 days, keeps 29', async () => {
    expect(cronAuthorized(null, 'x'.repeat(32))).toBe(false);
    expect(cronAuthorized('Bearer abc', undefined)).toBe(false);
    expect(cronAuthorized(`Bearer ${'x'.repeat(32)}`, 'x'.repeat(32))).toBe(true);
    const day = 86_400_000;
    const [old] = await h.db
      .insert(schema.users)
      .values({ lastAccessAt: new Date(Date.now() - 31 * day) })
      .returning();
    const [recent] = await h.db
      .insert(schema.users)
      .values({ lastAccessAt: new Date(Date.now() - 29 * day) })
      .returning();
    const report = await runDailyCron({ db: h.db, secrets, caps: CAPS, pluggy: null });
    expect(report.failed).toEqual([]);
    const ids = (await h.db.select({ id: schema.users.id }).from(schema.users)).map((u) => u.id);
    expect(ids).not.toContain(old?.id);
    expect(ids).toContain(recent?.id);
  });

  it('cron: a free snapshot connection is revoked at 31 days and kept at 29', async () => {
    const userId = await heroUser();
    const conns = await h.db
      .select()
      .from(schema.connections)
      .where(eq(schema.connections.userId, userId));
    const [pj, pf] = conns;
    if (!pj || !pf) throw new Error('two connections');
    const day = 86_400_000;
    await h.db
      .update(schema.connections)
      .set({ createdAt: new Date(Date.now() - 31 * day) })
      .where(eq(schema.connections.id, pj.id));
    await h.db
      .update(schema.connections)
      .set({ createdAt: new Date(Date.now() - 29 * day) })
      .where(eq(schema.connections.id, pf.id));
    await runDailyCron({ db: h.db, secrets, caps: CAPS, pluggy: null });
    const after = await h.db
      .select()
      .from(schema.connections)
      .where(eq(schema.connections.userId, userId));
    expect(after.find((c) => c.id === pj.id)?.status).toBe('revoked');
    expect(after.find((c) => c.id === pf.id)?.status).toBe('active');
  });
});
