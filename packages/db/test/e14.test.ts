import type { Finding } from '@refund/engine';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db, DbHandle } from '../src/client.ts';
import {
  clearRevokedItem,
  connectionsOlderThan,
  connectionsWithItem,
  consentsOlderThan,
  deleteOrphanCompanies,
  expireSubscriptions,
  inactiveAnonymousUserIds,
  revokePendingConnections,
  withdrawConsent,
} from '../src/repos/cleanup.ts';
import {
  decideReportRow,
  findOwnedReport,
  findReportByTokenHash,
  insertReport,
  markReportOpened,
} from '../src/repos/reports.ts';
import {
  createAnalysis,
  findingOf,
  findingRow,
  findOwnedAnalysis,
  listAnalysisLedger,
  listFindings,
  saveRun,
  setExcludedTransactions,
  setFindingStatus,
} from '../src/repos/runs.ts';
import {
  accounts,
  analyses,
  analysisEvents,
  companies,
  companyLinks,
  connections,
  consents,
  subscriptions,
  transactions,
} from '../src/schema/index.ts';
import { makeCompany, makeSubscription, makeUser, memoryDb } from './factories.ts';

let h: DbHandle;
let db: Db;
beforeAll(async () => {
  h = await memoryDb();
  db = h.db;
});
afterAll(() => h.close());

const DAY = 86_400_000;

function must<T>(x: T | undefined): T {
  if (x === undefined) throw new Error('missing row');
  return x;
}

const finding = (over: Partial<Finding> = {}): Finding =>
  ({
    ruleId: 'R05-REC',
    ruleVersion: '1.0.0',
    order: 3,
    type: 'recovery',
    title: 'Recuperar o pago a mais',
    marginalValue12m: 0,
    range: [100_00, 200_00],
    byDestination: { federal: [50_00, 100_00], municipal: [50_00, 100_00], state: [0, 0] },
    confidence: 'estimated',
    deadline: '2027-01-20',
    trace: [
      {
        id: 'R05-REC.X',
        description: 'passo',
        inputs: {},
        formula: 'a+b',
        result: { value: 1, unit: 'cents' },
        ref: { id: 'lc123-art18-p4a', label: 'LC 123', url: 'https://x' },
      },
    ],
    refs: [{ id: 'lc123-art18', label: 'LC 123, art. 18', url: 'https://x' }],
    doNot: ['não'],
    tradeoffs: [],
    assumptionsUsed: ['a'],
    countsInTotal: false,
    actionPlan: [
      {
        order: 1,
        who: 'accountant',
        what: 'Retificar',
        where: 'PGDAS-D',
        when: '2027-01',
        refIds: [],
      },
    ],
    howToReceive: [],
    recoveryItems: [
      {
        period: '2022-01',
        overpaidCents: 10_00,
        deadline: '2027-01-20',
        daysLeft: 62,
      },
    ],
    ...over,
  }) as unknown as Finding;

async function ledgerFixture() {
  const user = await makeUser(db);
  const company = await makeCompany(
    db,
    `RFE14${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}99`,
  );
  const [conn] = await db
    .insert(connections)
    .values({ userId: user.id, companyId: company.id, provider: 'persona', holder: 'PJ' })
    .returning();
  const [acc] = await db
    .insert(accounts)
    .values({
      connectionId: must(conn).id,
      sourceIdHash: `h-${must(conn).id}`,
      holder: 'PJ',
      type: 'checking',
      productName: 'Conta Corrente PJ',
      institution: 'Banco Sintético',
    })
    .returning();
  const txIds = ['TXA', 'TXB'].map((x) => `${x}${must(conn).id.slice(0, 20)}`.slice(0, 26));
  await db.insert(transactions).values(
    txIds.map((id, i) => ({
      id,
      accountId: must(acc).id,
      sourceIdHash: `s-${id}`,
      date: `2026-10-0${i + 1}`,
      month: '2026-10',
      amountCents: -1000 * (i + 1),
      direction: 'outflow' as const,
      description: 'TARIFA',
      method: 'FEE' as const,
    })),
  );
  return { user, company, conn: must(conn), txIds };
}

describe('runs', () => {
  it('round-trips a finding exactly (action plan, recovery items, optional fields)', async () => {
    const { user, company } = await ledgerFixture();
    const a = await createAnalysis(db, {
      userId: user.id,
      companyId: company.id,
      referenceMonth: '2026-10',
    });
    const f = finding();
    await db.update(analyses).set({ status: 'running' }).where(eq(analyses.id, a.id));
    const saved = await saveRun(db, a.id, {
      status: 'completed',
      engineVersion: '0.2.0',
      parametersVersion: '2026.11.14',
      parametersHash: `sha256:${'a'.repeat(64)}`,
      inputsHash: 'b'.repeat(64),
      total: null,
      metrics: { transactions: 0, byOrigin: {}, durationMs: 1 },
      error: null,
      findings: [findingRow(a.id, f, { text: 'explicação', origin: 'template' })],
      classifications: [],
      events: [{ seq: 1, type: 'start', payload: { type: 'start' } }],
    });
    expect(saved).toBe(true);
    const [row] = await listFindings(db, a.id);
    expect(findingOf(must(row))).toEqual(f);
    expect(row?.explanation).toBe('explicação');
    expect(row?.refIds).toEqual(['lc123-art18', 'lc123-art18-p4a']);
    const after = await findOwnedAnalysis(db, user.id, a.id);
    expect(after?.status).toBe('completed');
    expect(after?.parametersHash).toBe('a'.repeat(64));
    // A second save (another instance) writes nothing.
    expect(
      await saveRun(db, a.id, {
        status: 'completed',
        engineVersion: null,
        parametersVersion: null,
        parametersHash: null,
        inputsHash: null,
        total: null,
        metrics: { transactions: 0, byOrigin: {}, durationMs: 0 },
        error: null,
        findings: [],
        classifications: [],
        events: [{ seq: 1, type: 'start', payload: {} }],
      }),
    ).toBe(false);
    expect(
      await db.select().from(analysisEvents).where(eq(analysisEvents.analysisId, a.id)),
    ).toHaveLength(1);
  });

  it('a finding without optional fields keeps them absent', () => {
    const plain = finding({
      type: 'savings',
      ruleId: 'R01',
      countsInTotal: true,
      marginalValue12m: 5 as never,
    });
    for (const k of ['range', 'byDestination', 'deadline', 'recoveryItems'] as const)
      delete plain[k];
    const row = {
      ...findingRow('x', plain, null),
      id: 'id',
      status: 'new',
      outdated: false,
      lawChangeId: null,
      createdAt: new Date(),
    };
    expect(findingOf(row as never)).toEqual(plain);
  });

  it('only the owner finds the analysis; status and exclusions are stored', async () => {
    const { user, company } = await ledgerFixture();
    const other = await makeUser(db);
    const a = await createAnalysis(db, {
      userId: user.id,
      companyId: company.id,
      referenceMonth: '2026-10',
    });
    expect(await findOwnedAnalysis(db, other.id, a.id)).toBeNull();
    await setExcludedTransactions(db, a.id, ['b', 'a', 'b']);
    expect((await findOwnedAnalysis(db, user.id, a.id))?.excludedTransactionIds).toEqual([
      'a',
      'b',
    ]);
    await db.update(analyses).set({ status: 'running' }).where(eq(analyses.id, a.id));
    await saveRun(db, a.id, {
      status: 'completed',
      engineVersion: null,
      parametersVersion: null,
      parametersHash: null,
      inputsHash: null,
      total: null,
      metrics: { transactions: 0, byOrigin: {}, durationMs: 0 },
      error: null,
      findings: [findingRow(a.id, finding(), null)],
      classifications: [],
      events: [],
    });
    const [row] = await listFindings(db, a.id);
    expect(await setFindingStatus(db, a.id, must(row).id, 'marked')).toBe(true);
    expect(
      await setFindingStatus(db, 'ffffffff-ffff-4fff-8fff-ffffffffffff', must(row).id, 'marked'),
    ).toBe(false);
  });

  it('the ledger joins transactions, accounts and the analysis classifications', async () => {
    const { user, company, txIds } = await ledgerFixture();
    const a = await createAnalysis(db, {
      userId: user.id,
      companyId: company.id,
      referenceMonth: '2026-10',
    });
    await db.update(analyses).set({ status: 'running' }).where(eq(analyses.id, a.id));
    await saveRun(db, a.id, {
      status: 'completed',
      engineVersion: null,
      parametersVersion: null,
      parametersHash: null,
      inputsHash: null,
      total: null,
      metrics: { transactions: 2, byOrigin: {}, durationMs: 0 },
      error: null,
      findings: [],
      classifications: txIds.map((t) => ({
        transactionId: t,
        category: 'bank_fee' as const,
        confidenceBp: 1000,
        origin: 'rule' as const,
        ruleId: 'fee',
        reason: 'tarifa',
        status: 'applied' as const,
      })),
      events: [],
    });
    const ledger = await listAnalysisLedger(db, a.id);
    expect(ledger.map((r) => r.transaction.id)).toEqual(txIds);
    expect(ledger[0]?.account.holder).toBe('PJ');
    expect(ledger[0]?.classification.category).toBe('bank_fee');
  });
});

describe('reports', () => {
  it('token by hash only, opened once, final decision once, owner only', async () => {
    const { user, company } = await ledgerFixture();
    const a = await createAnalysis(db, {
      userId: user.id,
      companyId: company.id,
      referenceMonth: '2026-10',
    });
    const r = await insertReport(db, {
      analysisId: a.id,
      tokenHash: 'hash-1',
      accountantEmailEncrypted: 'enc',
      accountantEmailHash: 'eh',
      include: { calculations: true, laws: true, transactions: false },
      expiresAt: new Date(Date.now() + 30 * DAY),
    });
    expect(await findReportByTokenHash(db, 'hash-2')).toBeNull();
    expect((await findReportByTokenHash(db, 'hash-1'))?.userId).toBe(user.id);
    await markReportOpened(db, r.id);
    const first = (await findReportByTokenHash(db, 'hash-1'))?.report.openedAt;
    await markReportOpened(db, r.id);
    expect((await findReportByTokenHash(db, 'hash-1'))?.report.openedAt).toEqual(first);
    expect(await decideReportRow(db, r.id, 'approved', [])).toBe(true);
    expect(await decideReportRow(db, r.id, 'adjustments', [])).toBe(false);
    expect((await findOwnedReport(db, user.id, r.id))?.decision).toBe('approved');
    expect(await findOwnedReport(db, (await makeUser(db)).id, r.id)).toBeNull();
    await insertReport(db, {
      analysisId: a.id,
      tokenHash: 'hash-old',
      accountantEmailEncrypted: 'enc',
      accountantEmailHash: 'eh',
      include: { calculations: true, laws: true, transactions: false },
      expiresAt: new Date(Date.now() - DAY),
    });
    expect(await findReportByTokenHash(db, 'hash-old')).toBeNull();
  });
});

describe('cleanup', () => {
  it('inactive anonymous users, items to delete, pending revokes', async () => {
    const old = await makeUser(db, { lastAccessAt: new Date(Date.now() - 31 * DAY) });
    const recent = await makeUser(db, { lastAccessAt: new Date(Date.now() - 29 * DAY) });
    const ids = await inactiveAnonymousUserIds(db, 30);
    expect(ids).toContain(old.id);
    expect(ids).not.toContain(recent.id);
    const [c] = await db
      .insert(connections)
      .values({
        userId: old.id,
        provider: 'pluggy',
        holder: 'PF',
        itemIdEncrypted: 'v1.x',
        itemIdHash: `ih-${old.id}`,
        status: 'revoked',
        errorCode: 'REVOKE_PENDING',
        revokedAt: new Date(),
      })
      .returning();
    expect((await connectionsWithItem(db, [old.id])).map((x) => x.id)).toEqual([must(c).id]);
    expect((await revokePendingConnections(db, 'REVOKE_PENDING')).map((x) => x.id)).toContain(
      must(c).id,
    );
    await clearRevokedItem(db, must(c).id);
    expect((await revokePendingConnections(db, 'REVOKE_PENDING')).map((x) => x.id)).not.toContain(
      must(c).id,
    );
  });

  it('snapshot TTL candidates at 31 days, not at 29; consents older than a year', async () => {
    const u = await makeUser(db);
    const mk = async (days: number) => {
      const [row] = await db
        .insert(connections)
        .values({
          userId: u.id,
          provider: 'persona',
          holder: 'PJ',
          createdAt: new Date(Date.now() - days * DAY),
        })
        .returning();
      return must(row).id;
    };
    const c31 = await mk(31);
    const c29 = await mk(29);
    const ids = (await connectionsOlderThan(db, 30)).map((c) => c.id);
    expect(ids).toContain(c31);
    expect(ids).not.toContain(c29);
    const [old] = await db
      .insert(consents)
      .values({ userId: u.id, termsVersion: 't', grantedAt: new Date(Date.now() - 366 * DAY) })
      .returning();
    expect((await consentsOlderThan(db, 365)).map((x) => x.id)).toContain(must(old).id);
    await withdrawConsent(db, must(old).id);
    expect((await consentsOlderThan(db, 365)).map((x) => x.id)).not.toContain(must(old).id);
  });

  it('orphan companies older than 30 days go; linked or recent ones stay', async () => {
    const orphanOld = await makeCompany(db, 'RFORF001000101');
    const orphanNew = await makeCompany(db, 'RFORF002000102');
    const linked = await makeCompany(db, 'RFORF003000103');
    const u = await makeUser(db);
    await db.insert(companyLinks).values({ userId: u.id, companyId: linked.id, role: 'partner' });
    await db
      .update(companies)
      .set({ updatedAt: sql`now() - interval '31 days'` })
      .where(sql`${companies.id} in (${orphanOld.id}, ${linked.id})`);
    expect(await deleteOrphanCompanies(db, 30)).toBeGreaterThanOrEqual(1);
    const left = (await db.select({ id: companies.id }).from(companies)).map((c) => c.id);
    expect(left).not.toContain(orphanOld.id);
    expect(left).toContain(orphanNew.id);
    expect(left).toContain(linked.id);
  });

  it('expires subscriptions past their end', async () => {
    const u = await makeUser(db);
    const s = await makeSubscription(db, u.id, 'business', new Date(Date.now() - DAY));
    expect(await expireSubscriptions(db)).toBeGreaterThanOrEqual(1);
    const [row] = await db.select().from(subscriptions).where(eq(subscriptions.id, s.id));
    expect(row?.status).toBe('expired');
  });
});
