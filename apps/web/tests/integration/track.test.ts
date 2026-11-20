import { randomUUID } from 'node:crypto';
import { createMemoryDb, type DbHandle, schema } from '@refund/db';
import { estimateByProfile, type ProfileAnswers } from '@refund/engine';
import {
  type CnpjProvider,
  detectPii,
  findForbiddenKeys,
  PersonaFinancial,
  type SourceItem,
} from '@refund/sources';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentStep } from '@/features/track/steps.ts';
import type { Capabilities } from '@/server/capabilities.ts';
import { estimateByRevenueWith, lookupCnpjWith } from '@/server/company/lookup.ts';
import { toPublicProfile } from '@/server/company/profile.ts';
import { REPLAY_COMPANIES } from '@/server/company/replay-companies.ts';
import {
  CONSENT_SCOPES,
  type ConnectionDeps,
  connectSampleWith,
  createConnectTokenWith,
  getConnectionStatusWith,
  type PluggyPort,
  REVOKE_PENDING,
  recordConsentWith,
  refreshPluggyConnection,
  registerPluggyItemWith,
  revokeConnectionWith,
  SAMPLE_DATA,
  SANDBOX_ONLY,
  TERMS_VERSION,
} from '@/server/connection/connections.ts';
import { syncConnection } from '@/server/connection/sync.ts';
import { decrypt, hmac, type Secrets } from '@/server/crypto.ts';
import { migrationsFolder } from '@/server/db.ts';
import {
  confirmCompanyWith,
  markEstimateSeenWith,
  rejectCompanyWith,
  requireInScope,
  saveAnswerWith,
  skipPersonalAccountWith,
} from '@/server/track/answers.ts';
import { loadTrack } from '@/server/track/state.ts';
import { pluggyVerifier, processPluggyEvent } from '@/server/webhooks/pluggy.ts';
import { receiveWebhook } from '@/server/webhooks/types.ts';

// E11 against PGlite (TESTS §4): live CNPJ + profile estimate, the track's saved answers, consent,
// the persona fallback (A11), the Pluggy connection with a fake provider, and the Pluggy webhook.

let h: DbHandle;
const secrets: Secrets = {
  session: Buffer.from('s'.repeat(32)),
  encryption: Buffer.alloc(32, 7),
  pepper: Buffer.from('p'.repeat(32)),
  ephemeral: false,
};
/** 12/11/2026 15:00 UTC: the persona's analysis date (ENGINE-SPEC C.11.10 values). */
const NOW = Date.parse('2026-11-12T15:00:00Z');
const HERO = 'RFDEV001000158';
const PRESUMIDO = 'RFPRES01000137';
const COSMETICS = 'RFCOSM01000136';
const HERO_ANSWERS: ProfileAnswers = {
  monthlyRevenueBracket: 'from_30k_to_60k',
  hasEmployees: 'yes',
  receivesFromAbroad: 'half_or_more',
};
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
function headers(): Headers {
  ipSeq += 1;
  return new Headers({ 'x-forwarded-for': `198.51.100.${ipSeq}` });
}

async function newUser(): Promise<string> {
  const [u] = await h.db.insert(schema.users).values({}).returning();
  return u?.id as string;
}

const companyDeps = (extra: Partial<Parameters<typeof lookupCnpjWith>[2]> = {}) => ({
  db: h.db,
  secrets,
  headers: headers(),
  dataMode: 'replay' as const,
  nowMs: NOW,
  ...extra,
});

const connDeps = (userId: string, extra: Partial<ConnectionDeps> = {}): ConnectionDeps => ({
  db: h.db,
  userId,
  secrets,
  caps: CAPS,
  headers: headers(),
  pluggy: null,
  nowMs: NOW,
  ...extra,
});

async function heroThroughEstimate(userId: string): Promise<void> {
  expect((await lookupCnpjWith(userId, { cnpj: HERO, context: 'live' }, companyDeps())).ok).toBe(
    true,
  );
  await confirmCompanyWith(h.db, userId);
  await saveAnswerWith(h.db, userId, { step: 'faturamento', value: 'from_30k_to_60k' });
  await saveAnswerWith(h.db, userId, { step: 'funcionarios', value: 'yes' });
  await saveAnswerWith(h.db, userId, { step: 'exterior', value: 'half_or_more' });
  await markEstimateSeenWith(h.db, userId);
}

async function consent(userId: string): Promise<void> {
  const r = await recordConsentWith(
    { scopes: [...CONSENT_SCOPES], termsVersion: TERMS_VERSION },
    connDeps(userId),
  );
  expect(r.ok).toBe(true);
}

describe('lookupCnpj + estimateByRevenue (ARCHITECTURE §4.7; E11 definition of done)', () => {
  it('estimateByRevenue returns the same object as estimateByProfile for the hero (replay)', async () => {
    const userId = await newUser();
    const looked = await lookupCnpjWith(
      userId,
      { cnpj: 'rf.dev.001/0001-58', context: 'live' },
      companyDeps(),
    );
    if (!looked.ok) throw new Error(looked.error.code);
    expect(looked.value.company.cnpj).toBe(HERO);
    expect(looked.value.questions).toEqual({ revenue: true, employees: true, abroad: true });
    expect(looked.value.applicableRules.map((r) => r.ruleId)).toEqual(['R01', 'R05', 'R02']);

    const r = await estimateByRevenueWith(
      userId,
      { cnpj: HERO, answers: HERO_ANSWERS, context: 'live' },
      { db: h.db, nowMs: NOW },
    );
    const direct = estimateByProfile(toPublicProfile(looked.value.company), HERO_ANSWERS, {
      analysisDate: '2026-11-12' as never,
    });
    if (!r.ok || !direct.ok) throw new Error('estimate failed');
    expect(r.value).toEqual(direct.value);
    expect(r.value.type).toBe('range');
    if (r.value.type === 'range') expect(r.value.total).toEqual([1246338, 9077928]);
  });

  it('a Lucro Presumido replay CNPJ → no_range REGIME_OUT_OF_SCOPE and no optional questions', async () => {
    const userId = await newUser();
    const looked = await lookupCnpjWith(
      userId,
      { cnpj: PRESUMIDO, context: 'live' },
      companyDeps(),
    );
    if (!looked.ok) throw new Error(looked.error.code);
    expect(looked.value.questions).toEqual({ revenue: true, employees: false, abroad: false });
    expect(looked.value.applicableRules).toEqual([]);
    const r = await estimateByRevenueWith(
      userId,
      {
        cnpj: PRESUMIDO,
        answers: { ...HERO_ANSWERS, hasEmployees: 'dont_know', receivesFromAbroad: 'dont_know' },
        context: 'live',
      },
      { db: h.db, nowMs: NOW },
    );
    expect(r).toMatchObject({
      ok: true,
      value: { type: 'no_range', reason: 'REGIME_OUT_OF_SCOPE' },
    });
  });

  it('A1: the company is written with whitelist fields only (no QSA, no PII)', async () => {
    const userId = await newUser();
    await lookupCnpjWith(userId, { cnpj: HERO, context: 'live' }, companyDeps());
    const rows = await h.db.select().from(schema.companies);
    const hero = rows.find((c) => c.cnpj === HERO);
    expect(hero?.publicData).toEqual(REPLAY_COMPANIES[0]);
    expect(findForbiddenKeys(JSON.stringify(rows))).toEqual([]);
    expect(detectPii(rows.map((r) => r.publicData))).toEqual([]);
    const links = await h.db.select().from(schema.companyLinks);
    expect(links.filter((l) => l.userId === userId)).toHaveLength(1);
  });

  it('errors: malformed input → INVALID_INPUT, unknown CNPJ → NOT_FOUND, foreign CNPJ → FORBIDDEN', async () => {
    const userId = await newUser();
    expect(await lookupCnpjWith(userId, { cnpj: 42 }, companyDeps())).toMatchObject({
      ok: false,
      error: { code: 'INVALID_INPUT' },
    });
    expect(
      await lookupCnpjWith(userId, { cnpj: 'RFDEV001000159', context: 'live' }, companyDeps()),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    expect(
      await lookupCnpjWith(userId, { cnpj: 'RFNONE01000122', context: 'live' }, companyDeps()),
    ).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    expect(
      await estimateByRevenueWith(
        userId,
        { cnpj: HERO, answers: HERO_ANSWERS, context: 'live' },
        { db: h.db, nowMs: NOW },
      ),
    ).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    const bad = await estimateByRevenueWith(userId, { cnpj: HERO, answers: {} }, { db: h.db });
    expect(bad).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    expect(JSON.stringify(bad)).not.toMatch(/stack|at .*\.ts/);
  });

  it('live data: 5 lookups per day per session + IP, only valid CNPJs count; replay is not counted (M4)', async () => {
    const userId = await newUser();
    const live: CnpjProvider = {
      lookup: async () => ({ ok: true, value: REPLAY_COMPANIES[0] as never }),
    };
    const ip = new Headers({ 'x-forwarded-for': '203.0.113.99' });
    const deps = () => companyDeps({ dataMode: 'live', provider: live, headers: ip });
    for (let i = 0; i < 6; i++) {
      // Typos (bad check digit) never spend the daily lookups.
      expect(
        await lookupCnpjWith(userId, { cnpj: 'RFDEV001000159', context: 'live' }, deps()),
      ).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    }
    for (let i = 0; i < 5; i++) {
      expect((await lookupCnpjWith(userId, { cnpj: HERO, context: 'live' }, deps())).ok).toBe(true);
    }
    expect(await lookupCnpjWith(userId, { cnpj: HERO, context: 'live' }, deps())).toMatchObject({
      ok: false,
      error: { code: 'RATE_LIMITED' },
    });
    // Another visitor behind the same NAT has their own 5.
    const other = await newUser();
    expect((await lookupCnpjWith(other, { cnpj: HERO, context: 'live' }, deps())).ok).toBe(true);
    const replay = () => companyDeps({ headers: ip });
    for (let i = 0; i < 5; i++) {
      expect((await lookupCnpjWith(userId, { cnpj: HERO, context: 'live' }, replay())).ok).toBe(
        true,
      );
    }
  });

  it('live data: a coarse 50 per day per IP stops rotating sessions (M4)', async () => {
    const live: CnpjProvider = {
      lookup: async () => ({ ok: true, value: REPLAY_COMPANIES[0] as never }),
    };
    const ip = new Headers({ 'x-forwarded-for': '203.0.113.98' });
    const deps = () => companyDeps({ dataMode: 'live', provider: live, headers: ip });
    for (let u = 0; u < 10; u++) {
      const userId = await newUser();
      for (let i = 0; i < 5; i++) {
        expect((await lookupCnpjWith(userId, { cnpj: HERO, context: 'live' }, deps())).ok).toBe(
          true,
        );
      }
    }
    expect(
      await lookupCnpjWith(await newUser(), { cnpj: HERO, context: 'live' }, deps()),
    ).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });
  });

  it('a provider outage maps to UNAVAILABLE with a human message', async () => {
    const userId = await newUser();
    const down: CnpjProvider = {
      lookup: async () => ({
        ok: false,
        error: { code: 'UNAVAILABLE', source: 'brasilapi', message: 'x', recoverable: true },
      }),
    };
    const r = await lookupCnpjWith(
      userId,
      { cnpj: HERO, context: 'live' },
      companyDeps({ provider: down }),
    );
    expect(r).toMatchObject({ ok: false, error: { code: 'UNAVAILABLE' } });
    if (!r.ok) expect(r.error.message).toMatch(/fora do ar/);
  });
});

describe('first-access track state (D19; ARCHITECTURE §13)', () => {
  it('track actions share a per-session limit: the 121st in the hour → RATE_LIMITED (M3)', async () => {
    const userId = await newUser();
    await lookupCnpjWith(userId, { cnpj: HERO, context: 'live' }, companyDeps());
    await confirmCompanyWith(h.db, userId);
    // confirm spent 1 of the 120 (the lookup ran on the fixed test date: another window).
    for (let i = 0; i < 119; i++) {
      expect(
        (await saveAnswerWith(h.db, userId, { step: 'faturamento', value: 'from_30k_to_60k' })).ok,
      ).toBe(true);
    }
    expect(
      await saveAnswerWith(h.db, userId, { step: 'faturamento', value: 'from_30k_to_60k' }),
    ).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });
    expect(await markEstimateSeenWith(h.db, userId)).toMatchObject({
      ok: false,
      error: { code: 'RATE_LIMITED' },
    });
    // The next hour frees it.
    expect(
      (
        await saveAnswerWith(
          h.db,
          userId,
          { step: 'faturamento', value: 'from_30k_to_60k' },
          Date.now() + 3_600_000,
        )
      ).ok,
    ).toBe(true);
  });

  it('answers are saved per step, conditional steps follow the company, the user resumes', async () => {
    const userId = await newUser();
    expect(currentStep((await loadTrack(h.db, userId)).progress)).toBe('cnpj');
    await lookupCnpjWith(userId, { cnpj: HERO, context: 'live' }, companyDeps());
    expect(currentStep((await loadTrack(h.db, userId)).progress)).toBe('confirmar-empresa');
    // Before "Sou eu" no answer is accepted.
    expect(
      await saveAnswerWith(h.db, userId, { step: 'faturamento', value: 'from_30k_to_60k' }),
    ).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(await confirmCompanyWith(h.db, userId)).toMatchObject({
      ok: true,
      value: { next: '/app/comecar/faturamento' },
    });
    expect(
      await saveAnswerWith(h.db, userId, { step: 'faturamento', value: 'from_30k_to_60k' }),
    ).toEqual({ ok: true, value: { next: '/app/comecar/funcionarios' } });
    expect(
      await saveAnswerWith(h.db, userId, { step: 'faturamento', value: 'lots' }),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    const { progress } = await loadTrack(h.db, userId);
    expect(progress.answers).toEqual({ monthlyRevenueBracket: 'from_30k_to_60k' });
    expect(currentStep(progress)).toBe('funcionarios');
  });

  it('H3: a company out of the Simples stops at "É você?": "Sou eu" is refused with the regime, no step after it', async () => {
    const userId = await newUser();
    await lookupCnpjWith(userId, { cnpj: PRESUMIDO, context: 'live' }, companyDeps());
    expect(await confirmCompanyWith(h.db, userId)).toMatchObject({
      ok: false,
      error: {
        code: 'FORBIDDEN',
        message:
          'Por enquanto o Refund calcula só empresas do Simples Nacional. A Consultoria Presumida Exemplo Ltda está no Lucro Presumido.',
      },
    });
    const { progress } = await loadTrack(h.db, userId);
    expect(progress.company?.outOfScope).toBe(true);
    expect(currentStep(progress)).toBe('confirmar-empresa');
    expect(
      await saveAnswerWith(h.db, userId, { step: 'faturamento', value: 'from_60k_to_150k' }),
    ).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
  });

  it('a CNAE outside the verified table stops at the estimate: no "seen", no consent, no bank step', async () => {
    const userId = await newUser();
    const looked = await lookupCnpjWith(
      userId,
      { cnpj: COSMETICS, context: 'live' },
      companyDeps(),
    );
    expect(looked.ok).toBe(true);
    expect(await confirmCompanyWith(h.db, userId)).toMatchObject({ ok: true });
    const answered = await saveAnswerWith(h.db, userId, {
      step: 'faturamento',
      value: 'from_30k_to_60k',
    });
    expect(answered).toEqual({ ok: true, value: { next: '/app/comecar/estimativa' } });
    const estimate = await estimateByRevenueWith(
      userId,
      { cnpj: COSMETICS, answers: { ...HERO_ANSWERS, hasEmployees: 'no' }, context: 'live' },
      { db: h.db, nowMs: NOW },
    );
    expect(estimate).toMatchObject({ ok: true, value: { reason: 'CNAE_OUT_OF_SCOPE' } });
    const seen = await markEstimateSeenWith(h.db, userId);
    expect(seen.ok).toBe(false);
    if (seen.ok) return;
    expect(seen.error.code).toBe('FORBIDDEN');
    expect(seen.error.message).toMatch(
      /^Por enquanto o Refund calcula só estas atividades: .*web design \(6201-5\/02\).*\. A sua atividade \(4772-5\/00 Comércio varejista de cosméticos, produtos de perfumaria e de higiene pessoal\) ainda não está na nossa tabela conferida\.$/,
    );
    const { progress } = await loadTrack(h.db, userId);
    expect(progress.company).toMatchObject({ outOfScope: false, activityOutOfScope: true });
    expect(currentStep(progress)).toBe('estimativa');
    expect(await requireInScope(h.db, userId)).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN', message: seen.error.message },
    });
  });

  it('the scope guard of consent and the bank steps lets the hero through and stops the regime', async () => {
    const hero = await newUser();
    await lookupCnpjWith(hero, { cnpj: HERO, context: 'live' }, companyDeps());
    expect(await requireInScope(h.db, hero)).toEqual({ ok: true, value: undefined });
    const presumido = await newUser();
    await lookupCnpjWith(presumido, { cnpj: PRESUMIDO, context: 'live' }, companyDeps());
    expect(await requireInScope(h.db, presumido)).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });
  });

  it('"Não é minha empresa" clears the company and its answers; a new CNPJ starts over', async () => {
    const userId = await newUser();
    await heroThroughEstimate(userId);
    expect(await rejectCompanyWith(h.db, userId)).toEqual({
      ok: true,
      value: { next: '/app/comecar/cnpj' },
    });
    const after = await loadTrack(h.db, userId);
    expect(after.company).toBeNull();
    expect(currentStep(after.progress)).toBe('cnpj');
    await heroThroughEstimate(userId);
    await lookupCnpjWith(userId, { cnpj: PRESUMIDO, context: 'live' }, companyDeps());
    const switched = await loadTrack(h.db, userId);
    expect(switched.progress.answers).toEqual({});
    expect(currentStep(switched.progress)).toBe('confirmar-empresa');
  });
});

describe('consent and the sample-data fallback (A2, A11)', () => {
  it('connecting needs consent first', async () => {
    const userId = await newUser();
    await heroThroughEstimate(userId);
    expect(await connectSampleWith({ holder: 'PJ' }, connDeps(userId))).toMatchObject({
      ok: false,
      error: { code: 'CONSENT_REQUIRED' },
    });
    expect(
      await recordConsentWith(
        { scopes: ['everything'], termsVersion: TERMS_VERSION },
        connDeps(userId),
      ),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
  });

  it('A2: consent → sample PJ + PF → connections.status = active, rows written, CPF only as HMAC', async () => {
    const userId = await newUser();
    await heroThroughEstimate(userId);
    await consent(userId);
    const [row] = await h.db.select().from(schema.consents);
    expect(row?.ipHash).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(row?.termsVersion).toBe(TERMS_VERSION);

    const pj = await connectSampleWith({ holder: 'PJ' }, connDeps(userId));
    if (!pj.ok) throw new Error(pj.error.code);
    expect(pj.value.status).toBe('active');
    expect(pj.value.transactions).toBe(114);
    // Idempotent: a second tap returns the same connection.
    const again = await connectSampleWith({ holder: 'PJ' }, connDeps(userId));
    expect(again).toMatchObject({ ok: true, value: { connectionId: pj.value.connectionId } });
    expect(currentStep((await loadTrack(h.db, userId)).progress)).toBe('conta-pf');

    const pf = await connectSampleWith({ holder: 'PF' }, connDeps(userId));
    expect(pf).toMatchObject({ ok: true, value: { status: 'active', transactions: 60 } });
    expect(currentStep((await loadTrack(h.db, userId)).progress)).toBe('done');

    const conns = await h.db.select().from(schema.connections);
    const mine = conns.filter((c) => c.userId === userId);
    expect(mine.map((c) => c.status)).toEqual(['active', 'active']);
    expect(mine.every((c) => c.provider === 'persona' && c.itemIdEncrypted === null)).toBe(true);

    const accounts = await h.db.select().from(schema.accounts);
    const txs = await h.db.select().from(schema.transactions);
    expect(accounts.length).toBeGreaterThanOrEqual(3);
    expect(txs.length).toBeGreaterThanOrEqual(174);
    // CPF only as HMAC (or a mask): no detector fires on what was written.
    expect(detectPii(txs)).toEqual([]);
    expect(detectPii(accounts)).toEqual([]);
    for (const t of txs) {
      if (t.counterpartyDocType === 'CPF') {
        expect(t.counterpartyCnpj).toBeNull();
        expect(t.counterpartyName).toBeNull();
      }
    }
  });

  it('recordConsent is idempotent per session and terms version (M3)', async () => {
    const userId = await newUser();
    await heroThroughEstimate(userId);
    const a = await recordConsentWith(
      { scopes: [...CONSENT_SCOPES], termsVersion: TERMS_VERSION },
      connDeps(userId),
    );
    const b = await recordConsentWith(
      { scopes: [...CONSENT_SCOPES], termsVersion: TERMS_VERSION },
      connDeps(userId),
    );
    if (!a.ok || !b.ok) throw new Error('consent failed');
    expect(b.value.consentId).toBe(a.value.consentId);
    const mine = (await h.db.select().from(schema.consents)).filter((c) => c.userId === userId);
    expect(mine).toHaveLength(1);
  });

  it('the connection carries its consent; revoking the last one withdraws the consent (C3)', async () => {
    const userId = await newUser();
    await heroThroughEstimate(userId);
    await consent(userId);
    const pj = await connectSampleWith({ holder: 'PJ' }, connDeps(userId));
    const pf = await connectSampleWith({ holder: 'PF' }, connDeps(userId));
    if (!pj.ok || !pf.ok) throw new Error('connect failed');
    const [consentRow] = (await h.db.select().from(schema.consents)).filter(
      (c) => c.userId === userId,
    );
    const conns = (await h.db.select().from(schema.connections)).filter((c) => c.userId === userId);
    expect(conns.every((c) => c.consentId === consentRow?.id)).toBe(true);

    await revokeConnectionWith({ connectionId: pj.value.connectionId }, connDeps(userId));
    expect((await loadTrack(h.db, userId)).progress.consented).toBe(true);
    await revokeConnectionWith({ connectionId: pf.value.connectionId }, connDeps(userId));
    const after = await loadTrack(h.db, userId);
    expect(after.progress.consented).toBe(false);
    expect(currentStep(after.progress)).toBe('permissoes');
    expect(await connectSampleWith({ holder: 'PJ' }, connDeps(userId))).toMatchObject({
      ok: false,
      error: { code: 'CONSENT_REQUIRED' },
    });
    const left = (await h.db.select().from(schema.accounts)).filter(
      (a) => a.connectionId === pj.value.connectionId || a.connectionId === pf.value.connectionId,
    );
    expect(left).toEqual([]);
  });

  it("after 'Não é minha empresa' the old company's PJ account no longer completes conta-pj", async () => {
    const userId = await newUser();
    await heroThroughEstimate(userId);
    await consent(userId);
    await connectSampleWith({ holder: 'PJ' }, connDeps(userId));
    expect((await loadTrack(h.db, userId)).progress.pj?.status).toBe('active');
    await rejectCompanyWith(h.db, userId);
    await lookupCnpjWith(userId, { cnpj: PRESUMIDO, context: 'live' }, companyDeps());
    expect((await loadTrack(h.db, userId)).progress.pj).toBeNull();
  });

  it('skipping the PF account ends the track with only the PJ', async () => {
    const userId = await newUser();
    await heroThroughEstimate(userId);
    await consent(userId);
    expect(await skipPersonalAccountWith(h.db, userId)).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });
    await connectSampleWith({ holder: 'PJ' }, connDeps(userId));
    expect(await skipPersonalAccountWith(h.db, userId)).toEqual({
      ok: true,
      value: { next: '/app' },
    });
  });

  it('syncConnection is idempotent: running it twice inserts no duplicate', async () => {
    const userId = await newUser();
    await heroThroughEstimate(userId);
    await consent(userId);
    const r = await connectSampleWith({ holder: 'PF' }, connDeps(userId));
    if (!r.ok) throw new Error(r.error.code);
    const item = SAMPLE_DATA.items.find((i) => i.holder === 'PF');
    const second = await syncConnection(
      { id: r.value.connectionId, itemId: item?.item.sourceId as string, holder: 'PF' },
      {
        db: h.db,
        provider: new PersonaFinancial(SAMPLE_DATA),
        pepper: secrets.pepper,
        period: SAMPLE_DATA.period,
      },
    );
    expect(second).toEqual({ ok: true, accounts: 1, transactions: 0 });
  });
});

/** Pluggy stand-in: the persona's data behind an item whose owner and status the test controls. */
function fakePluggy(
  owner: string,
  status: SourceItem['status'] = 'UPDATED',
  options: { sandbox?: boolean; revokeFails?: boolean } = {},
) {
  const persona = new PersonaFinancial(SAMPLE_DATA);
  const pjItem = SAMPLE_DATA.items.find((i) => i.holder === 'PJ');
  // A fresh Pluggy item id per test (an item belongs to one user: item_id_hash is unique).
  const itemId = randomUUID();
  const source = (id: string) => (id === itemId ? (pjItem?.item.sourceId as string) : id);
  const calls = { revoke: 0, token: 0, accounts: 0 };
  const provider: PluggyPort = {
    name: 'pluggy',
    async sandboxConnectorIds() {
      return { ok: true, value: [0, 2] };
    },
    async createConnectToken(clientUserId) {
      calls.token += 1;
      return { ok: true, value: { accessToken: `tok-${clientUserId}`, expiresAt: 'x' } };
    },
    async getItem(id, ctx) {
      const r = await persona.getItem(source(id), ctx);
      return r.ok
        ? {
            ok: true,
            value: {
              ...r.value,
              sourceId: id,
              clientUserId: owner,
              status,
              connector: { ...r.value.connector, sandbox: options.sandbox ?? true },
            },
          }
        : r;
    },
    listAccounts: (id, ctx) => {
      calls.accounts += 1;
      return persona.listAccounts(source(id), ctx);
    },
    listTransactions: (id, period, ctx) => persona.listTransactions(id, period, ctx),
    getIdentity: (id, ctx) => persona.getIdentity(id, ctx),
    async revokeItem() {
      calls.revoke += 1;
      return options.revokeFails
        ? {
            ok: false,
            error: { code: 'UNAVAILABLE', source: 'pluggy', message: 'x', recoverable: true },
          }
        : { ok: true, value: undefined };
    },
  };
  return { provider, itemId, calls };
}

describe('Pluggy connection (ARCHITECTURE §2.4; TESTS §4 "Pluggy connection")', () => {
  it('without the capability: createConnectToken → NOT_CONFIGURED (the button is not even shown)', async () => {
    const userId = await newUser();
    expect(await createConnectTokenWith({ holder: 'PJ' }, connDeps(userId))).toMatchObject({
      ok: false,
      error: { code: 'NOT_CONFIGURED' },
    });
  });

  it('token → register → polling syncs when the item is UPDATED → active; revoke deletes the copy', async () => {
    const userId = await newUser();
    await heroThroughEstimate(userId);
    await consent(userId);
    const fake = fakePluggy(userId);
    const deps = () => connDeps(userId, { pluggy: fake.provider });
    expect(await createConnectTokenWith({ holder: 'PJ' }, deps())).toEqual({
      ok: true,
      value: {
        connectToken: `tok-${userId}`,
        includeSandbox: true,
        connectorTypes: ['BUSINESS_BANK'],
        connectorIds: [0, 2],
      },
    });
    expect(
      await registerPluggyItemWith({ itemId: 'not-a-uuid', holder: 'PJ' }, deps()),
    ).toMatchObject({
      ok: false,
      error: { code: 'INVALID_INPUT' },
    });
    const reg = await registerPluggyItemWith({ itemId: fake.itemId, holder: 'PJ' }, deps());
    if (!reg.ok) throw new Error(reg.error.code);
    // Registering the same item again is idempotent.
    expect(await registerPluggyItemWith({ itemId: fake.itemId, holder: 'PJ' }, deps())).toEqual(
      reg,
    );

    const [conn] = (await h.db.select().from(schema.connections)).filter(
      (c) => c.id === reg.value.connectionId,
    );
    expect(conn?.status).toBe('syncing');
    expect(conn?.itemIdHash).toBe(hmac(fake.itemId, secrets.pepper));
    expect(conn?.itemIdEncrypted).not.toContain(fake.itemId);
    expect(decrypt(conn?.itemIdEncrypted as string, secrets.encryption)).toBe(fake.itemId);

    const status = await getConnectionStatusWith({ connectionId: reg.value.connectionId }, deps());
    // Live Pluggy reads the last 12 months up to today (12/11): the persona's 5 PJ transactions of
    // 01–11/11/2025 fall outside, so 109 of its 114.
    expect(status).toEqual({ ok: true, value: { status: 'active', transactions: 109 } });
    expect(await createConnectTokenWith({ holder: 'PJ' }, deps())).toMatchObject({
      ok: false,
      error: { code: 'PLAN_LIMIT' },
    });

    // Another session cannot read or revoke it.
    const stranger = await newUser();
    expect(
      await getConnectionStatusWith({ connectionId: reg.value.connectionId }, connDeps(stranger)),
    ).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });

    expect(await revokeConnectionWith({ connectionId: reg.value.connectionId }, deps())).toEqual({
      ok: true,
      value: undefined,
    });
    expect(fake.calls.revoke).toBe(1);
    const [revoked] = (await h.db.select().from(schema.connections)).filter(
      (c) => c.id === reg.value.connectionId,
    );
    expect(revoked?.status).toBe('revoked');
    expect(revoked?.itemIdEncrypted).toBeNull();
    const left = (await h.db.select().from(schema.accounts)).filter(
      (a) => a.connectionId === reg.value.connectionId,
    );
    expect(left).toEqual([]);
  });

  it('a real (non-sandbox) bank item is deleted at Pluggy and never stored (C1)', async () => {
    const userId = await newUser();
    await heroThroughEstimate(userId);
    await consent(userId);
    const fake = fakePluggy(userId, 'UPDATED', { sandbox: false });
    const r = await registerPluggyItemWith(
      { itemId: fake.itemId, holder: 'PJ' },
      connDeps(userId, { pluggy: fake.provider }),
    );
    expect(r).toMatchObject({ ok: false, error: { code: 'FORBIDDEN', message: SANDBOX_ONLY } });
    expect(fake.calls.revoke).toBe(1);
    const hash = hmac(fake.itemId, secrets.pepper);
    expect((await h.db.select().from(schema.connections)).some((c) => c.itemIdHash === hash)).toBe(
      false,
    );
  });

  it('a real bank item whose deletion fails keeps only the encrypted id, REVOKE_PENDING (E14 H7)', async () => {
    const userId = await newUser();
    await heroThroughEstimate(userId);
    await consent(userId);
    const fake = fakePluggy(userId, 'UPDATED', { sandbox: false, revokeFails: true });
    const r = await registerPluggyItemWith(
      { itemId: fake.itemId, holder: 'PJ' },
      connDeps(userId, { pluggy: fake.provider }),
    );
    expect(r).toMatchObject({ ok: false, error: { code: 'FORBIDDEN', message: SANDBOX_ONLY } });
    const hash = hmac(fake.itemId, secrets.pepper);
    const rows = (await h.db.select().from(schema.connections)).filter(
      (c) => c.itemIdHash === hash,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: 'revoked',
      errorCode: REVOKE_PENDING,
      connectorName: null,
      companyId: null,
      consentId: null,
    });
    expect(decrypt(rows[0]?.itemIdEncrypted ?? '', secrets.encryption)).toBe(fake.itemId);
    const accounts = await h.db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.connectionId, rows[0]?.id ?? ''));
    expect(accounts).toEqual([]);
  });

  it('without the sandbox connector list the widget is not offered (C1)', async () => {
    const userId = await newUser();
    await heroThroughEstimate(userId);
    await consent(userId);
    const fake = fakePluggy(userId);
    const noList: PluggyPort = {
      ...fake.provider,
      async sandboxConnectorIds() {
        return { ok: true, value: [] };
      },
    };
    expect(
      await createConnectTokenWith({ holder: 'PJ' }, connDeps(userId, { pluggy: noList })),
    ).toMatchObject({ ok: false, error: { code: 'UNAVAILABLE' } });
    expect(fake.calls.token).toBe(0);
  });

  it('a failed revoke at Pluggy keeps the encrypted item id, flagged for retry (M2)', async () => {
    const userId = await newUser();
    await heroThroughEstimate(userId);
    await consent(userId);
    const fake = fakePluggy(userId, 'UPDATED', { revokeFails: true });
    const deps = connDeps(userId, { pluggy: fake.provider });
    const reg = await registerPluggyItemWith({ itemId: fake.itemId, holder: 'PJ' }, deps);
    if (!reg.ok) throw new Error(reg.error.code);
    await getConnectionStatusWith({ connectionId: reg.value.connectionId }, deps);
    expect(await revokeConnectionWith({ connectionId: reg.value.connectionId }, deps)).toEqual({
      ok: true,
      value: undefined,
    });
    const [row] = (await h.db.select().from(schema.connections)).filter(
      (c) => c.id === reg.value.connectionId,
    );
    expect(row?.status).toBe('revoked');
    expect(row?.errorCode).toBe(REVOKE_PENDING);
    expect(decrypt(row?.itemIdEncrypted as string, secrets.encryption)).toBe(fake.itemId);
    const left = (await h.db.select().from(schema.accounts)).filter(
      (a) => a.connectionId === reg.value.connectionId,
    );
    expect(left).toEqual([]);
  });

  it('an unfinished attempt replaced by a new item is deleted at Pluggy too (C6)', async () => {
    const userId = await newUser();
    await heroThroughEstimate(userId);
    await consent(userId);
    const first = fakePluggy(userId, 'UPDATING');
    const a = await registerPluggyItemWith(
      { itemId: first.itemId, holder: 'PJ' },
      connDeps(userId, { pluggy: first.provider }),
    );
    if (!a.ok) throw new Error(a.error.code);
    const second = fakePluggy(userId);
    const b = await registerPluggyItemWith(
      { itemId: second.itemId, holder: 'PJ' },
      connDeps(userId, { pluggy: second.provider }),
    );
    expect(b.ok).toBe(true);
    expect(second.calls.revoke).toBe(1);
    const [old] = (await h.db.select().from(schema.connections)).filter(
      (c) => c.id === a.value.connectionId,
    );
    expect(old?.status).toBe('revoked');
    expect(old?.itemIdEncrypted).toBeNull();
  });

  it('a claimed sync is not started twice (polling + webhook; M3)', async () => {
    const userId = await newUser();
    await heroThroughEstimate(userId);
    await consent(userId);
    const fake = fakePluggy(userId);
    const reg = await registerPluggyItemWith(
      { itemId: fake.itemId, holder: 'PJ' },
      connDeps(userId, { pluggy: fake.provider }),
    );
    if (!reg.ok) throw new Error(reg.error.code);
    const [row] = (await h.db.select().from(schema.connections)).filter(
      (c) => c.id === reg.value.connectionId,
    );
    if (!row) throw new Error('no row');
    const deps = { db: h.db, secrets, provider: fake.provider, nowMs: NOW };
    const [x, y] = await Promise.all([
      refreshPluggyConnection(row, deps),
      refreshPluggyConnection(row, deps),
    ]);
    expect([x, y].sort()).toEqual(['active', 'syncing']);
    expect(fake.calls.accounts).toBe(1);
  });

  it("registerPluggyItem with another user's clientUserId → FORBIDDEN", async () => {
    const userId = await newUser();
    await heroThroughEstimate(userId);
    await consent(userId);
    const fake = fakePluggy('00000000-0000-4000-8000-0000000000aa');
    expect(
      await registerPluggyItemWith(
        { itemId: fake.itemId, holder: 'PJ' },
        connDeps(userId, { pluggy: fake.provider }),
      ),
    ).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
  });

  it('a LOGIN_ERROR item turns the connection into error (the UI offers the sample data)', async () => {
    const userId = await newUser();
    await heroThroughEstimate(userId);
    await consent(userId);
    const fake = fakePluggy(userId, 'LOGIN_ERROR');
    const deps = connDeps(userId, { pluggy: fake.provider });
    const reg = await registerPluggyItemWith({ itemId: fake.itemId, holder: 'PJ' }, deps);
    if (!reg.ok) throw new Error(reg.error.code);
    expect(await getConnectionStatusWith({ connectionId: reg.value.connectionId }, deps)).toEqual({
      ok: true,
      value: { status: 'error', transactions: 0 },
    });
  });
});

describe('Pluggy webhook (ARCHITECTURE §4.9; ADR-010)', () => {
  const SECRET = 'w'.repeat(64);
  const CLIENT = '11111111-2222-4333-8444-555555555555';
  const verifier = pluggyVerifier({ secret: SECRET, clientId: CLIENT, pepper: secrets.pepper });
  const request = (body: string, secret: string | null = SECRET) =>
    new Request('https://example.test/api/webhooks/pluggy', {
      method: 'POST',
      body,
      headers: secret === null ? {} : { 'x-refund-webhook-secret': secret },
    });
  const payload = (eventId: string, itemId: string, clientId = CLIENT) =>
    JSON.stringify({ event: 'item/updated', eventId, itemId, clientId, triggeredBy: 'SYNC' });

  it('verifier: valid; wrong, missing or other-environment secret → 401; other clientId → 401; broken JSON → 400', async () => {
    const deps = { db: h.db, defer: () => {} };
    const processed = vi.fn(async () => 'ignored' as const);
    const ok = await receiveWebhook(verifier, request(payload('ev-v1', 'x')), deps, processed);
    expect(ok.status).toBe(200);
    for (const req of [
      request(payload('ev-v2', 'x'), 'x'.repeat(64)),
      request(payload('ev-v3', 'x'), null),
      request(payload('ev-v4', 'x'), `${SECRET}0`),
      request(payload('ev-v5', 'x', '99999999-2222-4333-8444-555555555555')),
    ]) {
      expect((await receiveWebhook(verifier, req, deps, processed)).status).toBe(401);
    }
    expect(
      (await receiveWebhook(verifier, request(`${payload('ev-v6', 'x')}}`), deps, processed))
        .status,
    ).toBe(400);
    const unconfigured = pluggyVerifier({
      secret: undefined,
      clientId: CLIENT,
      pepper: secrets.pepper,
    });
    expect(
      (await receiveWebhook(unconfigured, request(payload('ev-v7', 'x')), deps, processed)).status,
    ).toBe(401);
    expect(processed).toHaveBeenCalledTimes(1);
  });

  it('idempotent: the same eventId twice → 200 both times, processed once; it syncs the connection', async () => {
    const userId = await newUser();
    await heroThroughEstimate(userId);
    await consent(userId);
    const fake = fakePluggy(userId);
    const reg = await registerPluggyItemWith(
      { itemId: fake.itemId, holder: 'PJ' },
      connDeps(userId, { pluggy: fake.provider }),
    );
    if (!reg.ok) throw new Error(reg.error.code);
    const deferred: Promise<unknown>[] = [];
    const deps = { db: h.db, defer: (p: Promise<unknown>) => void deferred.push(p) };
    const process = vi.fn((ev: Parameters<typeof processPluggyEvent>[0]) =>
      processPluggyEvent(ev, { db: h.db, secrets, provider: fake.provider }),
    );
    const body = payload('ev-sync-1', fake.itemId);
    expect((await receiveWebhook(verifier, request(body), deps, process)).status).toBe(200);
    const dup = await receiveWebhook(verifier, request(body), deps, process);
    expect(dup.status).toBe(200);
    expect(await dup.json()).toEqual({ ok: true, duplicate: true });
    await Promise.all(deferred);
    expect(process).toHaveBeenCalledTimes(1);
    const [conn] = (await h.db.select().from(schema.connections)).filter(
      (c) => c.id === reg.value.connectionId,
    );
    expect(conn?.status).toBe('active');
    const [event] = (await h.db.select().from(schema.webhookEvents)).filter(
      (e) => e.eventId === 'ev-sync-1',
    );
    expect(event?.status).toBe('processed');
    // Minimal payload (ADR-010); the item id, which gives access to the data, only as an HMAC (M1).
    expect(event?.payload).toEqual({
      event: 'item/updated',
      eventId: 'ev-sync-1',
      triggeredBy: 'SYNC',
      itemIdHash: hmac(fake.itemId, secrets.pepper),
    });
    expect(JSON.stringify(event?.payload)).not.toContain(fake.itemId);
  });

  it('a body over 64 KB → 413, nothing recorded', async () => {
    const big = JSON.stringify({
      event: 'item/updated',
      eventId: 'ev-big',
      itemId: 'x',
      clientId: CLIENT,
      pad: 'x'.repeat(65 * 1024),
    });
    const res = await receiveWebhook(
      verifier,
      request(big),
      { db: h.db, defer: () => {} },
      async () => 'ignored',
    );
    expect(res.status).toBe(413);
    const events = (await h.db.select().from(schema.webhookEvents)).filter(
      (e) => e.eventId === 'ev-big',
    );
    expect(events).toEqual([]);
  });

  it('an event for an unknown item is recorded and ignored', async () => {
    const deferred: Promise<unknown>[] = [];
    const res = await receiveWebhook(
      verifier,
      request(payload('ev-unknown', '6b1addfc-623a-4f5f-be7e-dbee3294e06f')),
      { db: h.db, defer: (p) => void deferred.push(p) },
      (ev) => processPluggyEvent(ev, { db: h.db, secrets, provider: null }),
    );
    expect(res.status).toBe(200);
    await Promise.all(deferred);
    const [event] = (await h.db.select().from(schema.webhookEvents)).filter(
      (e) => e.eventId === 'ev-unknown',
    );
    expect(event?.status).toBe('ignored');
  });
});
