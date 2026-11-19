import { randomUUID } from 'node:crypto';
import { companyRow, createMemoryDb, type DbHandle, schema } from '@refund/db';
import { param } from '@refund/engine';
import { lawChangeFixture, type MonitorPage, type PublicCompany } from '@refund/sources';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Capabilities } from '@/server/capabilities.ts';
import { encrypt, type Secrets } from '@/server/crypto.ts';
import { migrationsFolder } from '@/server/db.ts';
import { lawAlertEmailBody } from '@/server/law/alert-email.ts';
import { lawProcessDeps } from '@/server/law/deps.ts';
import { type LawProcessDeps, processFirecrawlEvent } from '@/server/law/process.ts';
import {
  FIRECRAWL_SIGNATURE_HEADER,
  firecrawlSignature,
  firecrawlVerifier,
} from '@/server/webhooks/firecrawl.ts';
import { receiveWebhook } from '@/server/webhooks/types.ts';

// E16 "law changed" against PGlite (ARCHITECTURE §2.6, §4.9; ADR-013; EXECUTION E16 task 4): HMAC `sha256=` over the
// raw body (invalid → 401), idempotency (repeated → 200 without reprocessing), law_changes, outdated findings by rule,
// summary fallback and alert recipients. The webhook never changes a parameter.

let h: DbHandle;
const SECRET = 'f'.repeat(48);
const secrets: Secrets = {
  session: Buffer.from('s'.repeat(32)),
  encryption: Buffer.alloc(32, 7),
  pepper: Buffer.from('p'.repeat(32)),
  ephemeral: false,
};
const OFF: Capabilities = {
  database: false,
  memoryDatabase: true,
  liveData: false,
  ai: false,
  pluggy: false,
  email: false,
  payments: false,
  lawMonitor: true,
  login: false,
  cron: false,
};

const fixturePage = (() => {
  const r = lawChangeFixture('lc123-2006-2026-10-21');
  if (!r.ok) throw new Error(r.error.message);
  return r.value.page;
})();

/** A delivery in Firecrawl's documented `monitor.page` shape, built from the (synthetic) fixture page. */
const monitorPageBody = (pages: Partial<MonitorPage>[] = [{}], nonce = '') =>
  JSON.stringify({
    success: true,
    type: 'monitor.page',
    id: '0b8d6f7e-0000-4000-8000-000000000001',
    webhookId: `0b8d6f7e-0000-4000-8000-00000000000${nonce || '2'}`,
    metadata: { app: 'refund' },
    data: pages.map((over) => {
      const p = { ...fixturePage, ...over };
      return {
        monitorId: '0b8d6f7e-0000-4000-8000-0000000000aa',
        checkId: '0b8d6f7e-0000-4000-8000-0000000000bb',
        url: p.url,
        status: p.status,
        previousScrapeId: null,
        currentScrapeId: null,
        error: null,
        isMeaningful: p.isMeaningful,
        judgment: p.judgment,
        diff: p.diffText === null ? null : { text: p.diffText },
      };
    }),
  });

const request = (body: string, signature: string | null = firecrawlSignature(body, SECRET)) =>
  new Request('https://example.test/api/webhooks/firecrawl', {
    method: 'POST',
    body,
    headers: signature === null ? {} : { [FIRECRAWL_SIGNATURE_HEADER]: signature },
  });

const verifier = firecrawlVerifier({ secret: SECRET });

function testDeps(notify = vi.fn(async () => {})): LawProcessDeps & { notify: typeof notify } {
  return { ...lawProcessDeps(h.db, secrets, OFF), notify };
}

/** Runs receiveWebhook and waits for the deferred processing. */
async function deliver(body: string, deps: LawProcessDeps, signature?: string | null) {
  const deferred: Promise<unknown>[] = [];
  const process = vi.fn((ev: Parameters<typeof processFirecrawlEvent>[0]) =>
    processFirecrawlEvent(ev, deps),
  );
  const res = await receiveWebhook(
    verifier,
    signature === undefined ? request(body) : request(body, signature),
    { db: h.db, defer: (p) => void deferred.push(p) },
    process,
  );
  await Promise.all(deferred);
  return { res, process };
}

let companyId: string | undefined;
/** One synthetic company (persona-shaped CNPJ that does not exist at the Receita). */
async function testCompany(): Promise<{ id: string }> {
  if (companyId) return { id: companyId };
  const [row] = await h.db
    .insert(schema.companies)
    .values(
      companyRow({
        cnpj: 'RFLAW001000199' as PublicCompany['cnpj'],
        displayLegalName: 'EMPRESA TESTE LTDA',
        displayTradeName: null,
        masked: false,
        legalNature: { code: '2062', description: 'Sociedade Empresária Limitada' },
        size: 'ME',
        primaryCnae: { code: '6201-5/01', description: 'Desenvolvimento de software' },
        secondaryCnaes: [],
        registrationStatus: 'ATIVA',
        activityStartDate: '2020-01-02',
        uf: 'SP',
        ibgeMunicipality: '3550308',
        simples: { optedIn: true, since: '2020-01-02', excludedAt: null },
        mei: { optedIn: false, since: null, excludedAt: null },
        taxRegimeHistory: [],
        source: 'persona',
        fetchedAt: '2026-11-14T12:00:00.000Z',
      }),
    )
    .returning();
  if (!row) throw new Error('company');
  companyId = row.id;
  return row;
}

async function ownerWithFinding(ruleId: string, email: string | null) {
  const [user] = await h.db
    .insert(schema.users)
    .values({
      id: randomUUID(),
      anonymous: email === null,
      emailEncrypted: email === null ? null : encrypt(email, secrets.encryption),
    })
    .returning();
  const company = await testCompany();
  if (!user || !company) throw new Error('setup');
  const [analysis] = await h.db
    .insert(schema.analyses)
    .values({ userId: user.id, companyId: company.id, origin: 'live', referenceMonth: '2026-10' })
    .returning();
  if (!analysis) throw new Error('setup');
  const [finding] = await h.db
    .insert(schema.findings)
    .values({
      analysisId: analysis.id,
      ruleId,
      ruleVersion: '1',
      order: 1,
      type: 'alert',
      title: 'Achado de teste',
      marginalValue12mCents: 0,
      confidence: 'confirmed',
      countsInTotal: false,
      trace: [],
      refs: [],
    })
    .returning();
  if (!finding) throw new Error('setup');
  return { user, analysis, finding };
}

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

describe('Firecrawl webhook: signature (ARCHITECTURE §4.9)', () => {
  it('invalid, missing, other-secret or unconfigured → 401 and nothing is processed', async () => {
    const body = monitorPageBody([{}], '3');
    const deps = testDeps();
    for (const sig of [
      null,
      'sha256=00',
      firecrawlSignature(body, 'x'.repeat(48)),
      firecrawlSignature(body, SECRET).replace('sha256=', ''),
      firecrawlSignature(`${body} `, SECRET),
    ]) {
      const { res, process } = await deliver(body, deps, sig);
      expect(res.status).toBe(401);
      expect(process).not.toHaveBeenCalled();
    }
    const unconfigured = await receiveWebhook(
      firecrawlVerifier({ secret: undefined }),
      request(body),
      { db: h.db, defer: () => {} },
      async () => 'processed',
    );
    expect(unconfigured.status).toBe(401);
    expect(await h.db.select().from(schema.webhookEvents)).toEqual([]);
  });

  it('a signed body that is not JSON or has no type → 400', async () => {
    expect((await deliver('{not json', testDeps())).res.status).toBe(400);
    expect((await deliver('{"data":[]}', testDeps())).res.status).toBe(400);
  });
});

describe('Firecrawl webhook: law changed (ARCHITECTURE §2.6; ADR-013)', () => {
  it('records the change, flags the findings of the affected rules and alerts the owner with an e-mail', async () => {
    const meiOwner = await ownerWithFinding('R03', 'dona@example.com');
    const anonymous = await ownerWithFinding('R03', null);
    const other = await ownerWithFinding('R01', 'outra@example.com');
    const officialMei = param('mei.limit', '2026-06');
    const deps = testDeps();
    const body = monitorPageBody();

    const { res, process } = await deliver(body, deps);
    expect(res.status).toBe(200);
    expect(process).toHaveBeenCalledTimes(1);

    const changes = await h.db.select().from(schema.lawChanges);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      regulationId: 'lc123-2006',
      affectedArticles: ['lc123-2006/art18-a/p1', 'lc123-2006/art18-a/p2'],
      affectedRules: ['R03'],
      status: 'new',
      summaryOrigin: 'template',
      judgment: fixturePage.judgment?.reason,
    });
    expect(changes[0]?.summary).toContain('LC 123/2006, art. 18-A, § 1º');
    expect(changes[0]?.eventId).toMatch(/^[0-9a-f]{64}$/);

    const findings = await h.db.select().from(schema.findings);
    const outdated = (id: string) => findings.find((f) => f.id === id)?.outdated;
    expect(outdated(meiOwner.finding.id)).toBe(true);
    expect(outdated(anonymous.finding.id)).toBe(true);
    expect(outdated(other.finding.id)).toBe(false);

    expect(deps.notify).toHaveBeenCalledTimes(1);
    expect(deps.notify).toHaveBeenCalledWith(
      [{ userId: meiOwner.user.id, emailEncrypted: expect.any(String) }],
      'LC 123/2006',
    );

    const [event] = await h.db
      .select()
      .from(schema.webhookEvents)
      .where(eq(schema.webhookEvents.provider, 'firecrawl'));
    expect(event).toMatchObject({ status: 'processed', type: 'monitor.page' });
    // ADR-010: the stored payload is minimal; the diff lives only in law_changes.
    expect(event?.payload).toEqual({ type: 'monitor.page', items: 1 });

    const [reg] = await h.db
      .select()
      .from(schema.monitoredRegulations)
      .where(eq(schema.monitoredRegulations.regulationId, 'lc123-2006'));
    expect(reg?.lastChangedAt).toBeInstanceOf(Date);

    // ADR-013: the webhook never changes a parameter.
    expect(param('mei.limit', '2026-06')).toEqual(officialMei);
  });

  it('the same delivery again → 200 without reprocessing', async () => {
    const deps = testDeps();
    const { res, process } = await deliver(monitorPageBody(), deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, duplicate: true });
    expect(process).not.toHaveBeenCalled();
    expect(deps.notify).not.toHaveBeenCalled();
    expect(await h.db.select().from(schema.lawChanges)).toHaveLength(1);
  });

  it('a change judged irrelevant, an unchanged page or an unknown page is ignored', async () => {
    const deps = testDeps();
    for (const [nonce, pages] of [
      ['4', [{ isMeaningful: false }]],
      ['5', [{ status: 'same' as const, diffText: null }]],
      ['6', [{ url: 'https://example.com/pagina.htm' }]],
    ] as const) {
      const { res } = await deliver(monitorPageBody([...pages], nonce), deps);
      expect(res.status).toBe(200);
    }
    expect(await h.db.select().from(schema.lawChanges)).toHaveLength(1);
    const statuses = (await h.db.select().from(schema.webhookEvents)).map((e) => e.status);
    expect(statuses.filter((s) => s === 'ignored')).toHaveLength(3);
  });

  it('a change outside the corpus provisions is recorded for review with no rule and no alert', async () => {
    const deps = testDeps();
    const diff = '-Texto de outro artigo da página.\n+Texto novo de outro artigo da página.';
    const { res } = await deliver(monitorPageBody([{ diffText: diff }], '7'), deps);
    expect(res.status).toBe(200);
    const rows = await h.db
      .select()
      .from(schema.lawChanges)
      .where(eq(schema.lawChanges.diffText, diff));
    expect(rows[0]).toMatchObject({ affectedArticles: [], affectedRules: [] });
    expect(rows[0]?.summary).toContain('fora dos dispositivos');
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it('monitor.check.completed stamps the regulations of that monitor', async () => {
    await h.db
      .update(schema.monitoredRegulations)
      .set({ firecrawlMonitorId: 'mon-e16', lastCheckedAt: null })
      .where(eq(schema.monitoredRegulations.regulationId, 'lc123-2006'));
    const body = JSON.stringify({
      success: true,
      type: 'monitor.check.completed',
      id: 'c',
      webhookId: 'w',
      data: [
        {
          monitorId: 'mon-e16',
          checkId: 'c',
          status: 'completed',
          summary: { totalPages: 1, same: 1, changed: 0, new: 0, removed: 0, error: 0 },
        },
      ],
    });
    const { res } = await deliver(body, testDeps());
    expect(res.status).toBe(200);
    const [reg] = await h.db
      .select()
      .from(schema.monitoredRegulations)
      .where(eq(schema.monitoredRegulations.regulationId, 'lc123-2006'));
    expect(reg?.lastCheckedAt).toBeInstanceOf(Date);
  });
});

describe('alert e-mail', () => {
  it('names the regulation and links to the app, with no number', () => {
    const body = lawAlertEmailBody({
      regulationLabel: 'LC 123/2006',
      link: 'https://userefund.com.br/app',
    });
    expect(body.subject).toBe('Uma lei que o Refund usa nos seus cálculos mudou');
    expect(body.text).toContain('O texto de LC 123/2006 mudou.');
    expect(body.text).toContain('https://userefund.com.br/app');
    expect(body.text).not.toMatch(/R\$/);
  });

  it('is not sent when the e-mail capability is off', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await lawProcessDeps(h.db, secrets, OFF).notify(
      [{ userId: 'u', emailEncrypted: encrypt('a@example.com', secrets.encryption) }],
      'LC 123/2006',
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
