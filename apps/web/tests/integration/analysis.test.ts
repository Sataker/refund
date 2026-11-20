import { randomUUID } from 'node:crypto';
import { createAnalysis, createMemoryDb, type DbHandle, schema } from '@refund/db';
import { sumCents } from '@refund/engine';
import { and, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { confirmCards } from '@/features/findings/confirm.ts';
import { deleteMyDataWith } from '@/server/account/delete.ts';
import {
  answerQuestionWith,
  confirmProLaboreWith,
  markFindingWith,
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
  type PluggyPort,
  recordConsentWith,
  revokeConnectionWith,
  TERMS_VERSION,
} from '@/server/connection/connections.ts';
import { cronAuthorized, runDailyCron } from '@/server/cron/daily.ts';
import { encrypt, type Secrets } from '@/server/crypto.ts';
import { migrationsFolder } from '@/server/db.ts';
import { liveFinance } from '@/server/financial-view.ts';
import { PLANS } from '@/server/plans/catalog.ts';
import { largestRuleId, serializeFinding, summarizeItems } from '@/server/plans/serialize.ts';
import type { ReportEmail } from '@/server/report/email.ts';
import {
  decideReportWith,
  reportByToken,
  reportStatusFrames,
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

describe('live jury path (UX review 19/11: H1, C2, H3)', () => {
  // The answer key of the hero (ENGINE-SPEC F.2), as a visitor taps it on the live Confirmar screen.
  const TAP: Record<string, string> = {
    'pro-labore-gross': 'yes',
    'clt-payroll-gross': 'yes',
  };
  const tapOf = (id: string) => (id.startsWith('health:') ? 'holder' : (TAP[id] ?? 'yes'));

  it('H1: answering every card of the live hero gives the /demo total, R$ 62.318,92 confirmed', async () => {
    const userId = await heroUser();
    const id = await startAndRun(userId);
    const first = await loadLiveAnalysis(h.db, userId, id);
    expect(first?.origin).toEqual({
      companySynthetic: true,
      companyIsSample: true,
      bank: 'sample',
    });
    const questions = await questionsOf(h.db, id);
    expect(questions.map((q) => q.id)).toContain('clt-payroll-gross');
    // The options the live screen offers for the sample statements (the payroll report exists there).
    const cards = confirmCards(questions, [], () => null, { payrollReport: true });
    for (const card of cards) {
      const value = tapOf(card.id);
      expect(card.options.map((o) => o.value)).toContain(value);
      const r = await answerQuestionWith(
        { analysisId: id, questionId: card.id, answer: value },
        deps(userId),
      );
      expect(r, card.id).toEqual({ ok: true, value: { reanalyze: true } });
    }
    const next = await reanalyzeWith({ analysisId: id }, deps(userId));
    if (!next.ok) throw new Error(next.error.code);
    await executeAnalysis(next.value.analysisId, { db: h.db, ...runDeps });
    const after = await loadLiveAnalysis(h.db, userId, next.value.analysisId);
    expect(after?.total.byConfidence.confirmed).toBe(6231892);
    expect(after?.dashboard.total).toBe(6231892);
    expect(await questionsOf(h.db, next.value.analysisId)).toEqual([]);
  });

  it('H1: without a payroll report the option is not offered and a plain "yes" is refused', async () => {
    const userId = await heroUser();
    const id = await startAndRun(userId);
    const questions = await questionsOf(h.db, id);
    const payroll = confirmCards(questions, [], () => null, { payrollReport: false }).find(
      (c) => c.id === 'clt-payroll-gross',
    );
    expect(payroll?.options.map((o) => o.value)).toEqual(['dont_know']);
    // A sample-backed run maps "yes" to the report; drop the sample connections and the same tap is refused.
    await h.db.delete(schema.classifications).where(eq(schema.classifications.analysisId, id));
    await h.db
      .update(schema.connections)
      .set({ provider: 'pluggy' })
      .where(eq(schema.connections.userId, userId));
    expect(
      await answerQuestionWith(
        { analysisId: id, questionId: 'clt-payroll-gross', answer: 'yes' },
        deps(userId),
      ),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    expect((await loadLiveAnalysis(h.db, userId, id))?.origin.bank).toBe('sandbox');
  });

  it('H3: a run for a Lucro Presumido company ends with the regime as the reason, not the activity', async () => {
    const [u] = await h.db.insert(schema.users).values({}).returning();
    const userId = u?.id as string;
    const looked = await lookupCnpjWith(
      userId,
      { cnpj: 'RFPRES01000137', context: 'live' },
      { db: h.db, secrets, headers: headers(), dataMode: 'replay', nowMs: NOW },
    );
    expect(looked.ok).toBe(true);
    const [company] = await h.db
      .select({ id: schema.companies.id })
      .from(schema.companies)
      .where(eq(schema.companies.cnpj, 'RFPRES01000137'));
    await recordConsentWith(
      { scopes: [...CONSENT_SCOPES], termsVersion: TERMS_VERSION },
      connDeps(userId),
    );
    expect((await connectSampleWith({ holder: 'PJ' }, connDeps(userId))).ok).toBe(true);
    const row = await createAnalysis(h.db, {
      userId,
      companyId: company?.id as string,
      referenceMonth: '2026-10',
    });
    await executeAnalysis(row.id, { db: h.db, ...runDeps });
    const log = await frames(row.id, 0);
    expect(log.map((f) => f.type)).toEqual(['error']);
    expect(log[0]?.data).toMatchObject({
      code: 'REGIME_OUT_OF_SCOPE',
      message:
        'Por enquanto o Refund calcula só empresas do Simples Nacional. A Consultoria Presumida Exemplo Ltda está no Lucro Presumido.',
      recoverable: false,
    });
    const live = await loadLiveAnalysis(h.db, userId, row.id);
    expect(live?.analysis.status).toBe('error');
    // C2: a real-looking company next to Marina's statements carries the banner.
    expect(live?.origin).toMatchObject({ companyIsSample: false, bank: 'sample' });
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
    const analysisId = await startAndRun(userId);
    await sendReportWith(
      { analysisId, include: { calculations: true, laws: true, transactions: false } },
      { db: h.db, userId, secrets, caps: CAPS, origin: 'http://localhost', nowMs: NOW },
    );
    const q = (await questionsOf(h.db, analysisId))[0];
    if (q) await answerQuestionWith({ analysisId, questionId: q.id, answer: null }, deps(userId));
    const [link] = await h.db
      .select()
      .from(schema.companyLinks)
      .where(eq(schema.companyLinks.userId, userId));
    const accountIds = (
      await h.db
        .select({ id: schema.accounts.id })
        .from(schema.accounts)
        .innerJoin(schema.connections, eq(schema.connections.id, schema.accounts.connectionId))
        .where(eq(schema.connections.userId, userId))
    ).map((a) => a.id);
    expect(accountIds.length).toBeGreaterThan(0);
    expect(
      (await h.db.select().from(schema.rateLimits)).some((r) => r.key.endsWith(`:u:${userId}`)),
    ).toBe(true);
    expect(
      await deleteMyDataWith({ confirmation: 'apagar' }, { db: h.db, userId, secrets, caps: CAPS }),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    const r = await deleteMyDataWith(
      { confirmation: 'APAGAR' },
      { db: h.db, userId, secrets, caps: CAPS },
    );
    expect(r.ok).toBe(true);
    for (const t of [
      schema.analyses,
      schema.connections,
      schema.consents,
      schema.companyLinks,
      schema.userAssumptions,
    ])
      expect(await h.db.select().from(t).where(eq(t.userId, userId))).toEqual([]);
    // M4: everything under the analysis and the connections, the report and the linked company row.
    for (const t of [
      schema.reports,
      schema.analysisEvents,
      schema.findings,
      schema.classifications,
    ])
      expect(await h.db.select().from(t).where(eq(t.analysisId, analysisId))).toEqual([]);
    for (const id of accountIds) {
      expect(await h.db.select().from(schema.accounts).where(eq(schema.accounts.id, id))).toEqual(
        [],
      );
      expect(
        await h.db.select().from(schema.transactions).where(eq(schema.transactions.accountId, id)),
      ).toEqual([]);
    }
    // The hero CNPJ is shared by every test user of this file: it stays while another one still links it.
    const stillLinked = await h.db
      .select()
      .from(schema.companyLinks)
      .where(eq(schema.companyLinks.companyId, link?.companyId ?? ''));
    const company = await h.db
      .select()
      .from(schema.companies)
      .where(eq(schema.companies.id, link?.companyId ?? ''));
    expect(company.length).toBe(stillLinked.length > 0 ? 1 : 0);
    expect(
      (await h.db.select().from(schema.rateLimits)).some((r) => r.key.endsWith(`:u:${userId}`)),
    ).toBe(false);
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

describe('code and compliance review fixes (E14)', () => {
  const day = 86_400_000;
  const failingPluggy = {
    name: 'pluggy',
    revokeItem: async () => ({
      ok: false as const,
      error: { code: 'UNAVAILABLE' as const, source: 'pluggy', message: 'x', recoverable: true },
    }),
  } as unknown as PluggyPort;

  async function staleUserWithItem(daysAgo: number): Promise<string> {
    const [u] = await h.db
      .insert(schema.users)
      .values({ lastAccessAt: new Date(Date.now() - daysAgo * day) })
      .returning();
    const userId = u?.id as string;
    await h.db.insert(schema.connections).values({
      userId,
      provider: 'pluggy',
      holder: 'PF',
      itemIdEncrypted: encrypt(randomUUID(), secrets.encryption),
      itemIdHash: `ih-${randomUUID()}`,
      status: 'active',
    });
    return userId;
  }

  const exists = async (id: string) =>
    (await h.db.select().from(schema.users).where(eq(schema.users.id, id))).length === 1;

  it('M1: reanalyze runs only after an answer changed, from the latest analysis', async () => {
    const userId = await heroUser();
    const id = await startAndRun(userId);
    expect(await reanalyzeWith({ analysisId: id }, deps(userId))).toEqual({
      ok: true,
      value: { analysisId: id },
    });
    const q = (await questionsOf(h.db, id)).find((x) => x.type === 'monthly_pro_labore');
    if (!q) throw new Error('pró-labore card');
    await answerQuestionWith({ analysisId: id, questionId: q.id, answer: 'yes' }, deps(userId));
    const next = await reanalyzeWith({ analysisId: id }, deps(userId));
    if (!next.ok) throw new Error(next.error.code);
    expect(next.value.analysisId).not.toBe(id);
    // The old one is no longer the latest: it points to the new one, and nothing new is created.
    expect(await reanalyzeWith({ analysisId: id }, deps(userId))).toEqual({
      ok: true,
      value: { analysisId: next.value.analysisId },
    });
    // The new one has not run yet (pending): same id back.
    expect(await reanalyzeWith({ analysisId: next.value.analysisId }, deps(userId))).toEqual({
      ok: true,
      value: { analysisId: next.value.analysisId },
    });
    const rows = await h.db
      .select()
      .from(schema.analyses)
      .where(eq(schema.analyses.userId, userId));
    expect(rows).toHaveLength(2);
  });

  it('M2: no Pluggy client → the inactive user is deleted anyway, the audit row keeps the count', async () => {
    const userId = await staleUserWithItem(31);
    await runDailyCron({ db: h.db, secrets, caps: CAPS, pluggy: null });
    expect(await exists(userId)).toBe(false);
    const audit = await h.db
      .select()
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.actorType, 'system'));
    expect(audit.some((a) => (a.data as { pendingAtPluggy?: number }).pendingAtPluggy === 1)).toBe(
      true,
    );
    expect(JSON.stringify(audit)).not.toContain(userId);
  });

  it('M2: Pluggy failing → kept until 30 + 7 days, then deleted anyway', async () => {
    const kept = await staleUserWithItem(32);
    const gone = await staleUserWithItem(38);
    const report = await runDailyCron({ db: h.db, secrets, caps: CAPS, pluggy: failingPluggy });
    expect(report.failed).toEqual([]);
    expect(await exists(kept)).toBe(true);
    expect(await exists(gone)).toBe(false);
  });

  it('H3: disconnecting deletes the transaction samples of the analyses that read it', async () => {
    const userId = await heroUser();
    const id = await startAndRun(userId);
    const samples = async () =>
      (
        await h.db
          .select()
          .from(schema.analysisEvents)
          .where(eq(schema.analysisEvents.analysisId, id))
      ).filter((e) => e.type === 'transaction_sample');
    expect(await samples()).toHaveLength(1);
    const [pf] = await h.db
      .select()
      .from(schema.connections)
      .where(and(eq(schema.connections.userId, userId), eq(schema.connections.holder, 'PF')));
    expect(await revokeConnectionWith({ connectionId: pf?.id }, connDeps(userId))).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await samples()).toHaveLength(0);
    // The analysis itself stays (findings) until "Apagar meus dados".
    expect((await loadLiveAnalysis(h.db, userId, id))?.rows.length).toBeGreaterThan(0);
  });

  it('H4: the waitlist is deleted by the cron from 12/03/2027 on, not before', async () => {
    await h.db.insert(schema.waitlist).values({
      emailEncrypted: 'v1.x',
      emailHash: `wh-${randomUUID()}`,
      hasCnpj: true,
      origin: 'landing',
      consentedAt: new Date(),
    });
    await runDailyCron({
      db: h.db,
      secrets,
      caps: CAPS,
      pluggy: null,
      nowMs: Date.parse('2027-03-11T15:00:00Z'),
    });
    expect((await h.db.select().from(schema.waitlist)).length).toBeGreaterThan(0);
    const r = await runDailyCron({
      db: h.db,
      secrets,
      caps: CAPS,
      pluggy: null,
      nowMs: Date.parse('2027-03-12T15:00:00Z'),
    });
    expect(r.cleaned.waitlist).toBeGreaterThan(0);
    expect(await h.db.select().from(schema.waitlist)).toEqual([]);
  });

  it('M3: audit rows lose the id of a user that no longer exists', async () => {
    const [u] = await h.db.insert(schema.users).values({}).returning();
    await h.db
      .insert(schema.auditEvents)
      .values({ actorType: 'user', actorUserId: u?.id ?? null, action: 'test' });
    await h.db.delete(schema.users).where(eq(schema.users.id, u?.id ?? ''));
    await runDailyCron({ db: h.db, secrets, caps: CAPS, pluggy: null });
    const left = await h.db
      .select()
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.action, 'test'));
    expect(left.every((a) => a.actorUserId === null)).toBe(true);
  });

  it('L8: another user gets nothing from any analysis action or the report status', async () => {
    const owner = await heroUser();
    const id = await startAndRun(owner);
    const [other] = await h.db.insert(schema.users).values({}).returning();
    const intruder = other?.id as string;
    const live = await loadLiveAnalysis(h.db, owner, id);
    const finding = live?.rows[0]?.id as string;
    const q = (await questionsOf(h.db, id))[0]?.id as string;
    const notFound = { ok: false, error: { code: 'NOT_FOUND' } };
    expect(
      await markFindingWith({ findingId: finding, status: 'marked' }, deps(intruder)),
    ).toMatchObject(notFound);
    expect(
      await answerQuestionWith({ analysisId: id, questionId: q, answer: 'yes' }, deps(intruder)),
    ).toMatchObject(notFound);
    expect(
      await confirmProLaboreWith({ analysisId: id, monthlyAmountCents: 100_00 }, deps(intruder)),
    ).toMatchObject(notFound);
    expect(
      await setFinanceExclusionsWith(
        { analysisId: id, excluded: [] },
        { ...deps(intruder), removable: async () => new Set() },
      ),
    ).toMatchObject(notFound);
    expect(
      await sendReportWith(
        { analysisId: id, include: { calculations: true, laws: true, transactions: false } },
        { db: h.db, userId: intruder, secrets, caps: CAPS, origin: 'http://localhost', nowMs: NOW },
      ),
    ).toMatchObject(notFound);
    const sent = await sendReportWith(
      { analysisId: id, include: { calculations: true, laws: true, transactions: false } },
      { db: h.db, userId: owner, secrets, caps: CAPS, origin: 'http://localhost', nowMs: NOW },
    );
    if (!sent.ok) throw new Error(sent.error.code);
    const frames: string[] = [];
    for await (const f of reportStatusFrames({
      db: h.db,
      userId: intruder,
      reportId: sent.value.reportId,
      wait: async () => {},
      aborted: () => false,
      deadlineMs: Date.now() + 5_000,
    }))
      frames.push(f);
    expect(frames).toEqual([]);
    expect(await reanalyzeWith({ analysisId: id }, deps(intruder))).toMatchObject(notFound);
  });

  it('L3: link-only reports do not use the 3/day e-mail limit', async () => {
    const userId = await heroUser();
    const id = await startAndRun(userId);
    for (let i = 0; i < 4; i += 1) {
      const r = await sendReportWith(
        { analysisId: id, include: { calculations: true, laws: true, transactions: false } },
        { db: h.db, userId, secrets, caps: CAPS, origin: 'http://localhost', nowMs: NOW },
      );
      expect(r.ok).toBe(true);
    }
  });
});
