import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db, DbHandle } from '../src/client.ts';
import { inactiveAnonymousUsers } from '../src/repos/cleanup.ts';
import { insertCharge, settleCharge } from '../src/repos/payments.ts';
import { activeSubscriptions } from '../src/repos/subscriptions.ts';
import { insertAuditEvent } from '../src/repos/system.ts';
import { consumeUsage } from '../src/repos/usage.ts';
import {
  deleteInactiveAnonymousUsers,
  findUser,
  findUserByIdentity,
  linkIdentity,
  mergeUsers,
} from '../src/repos/users.ts';
import {
  analyses,
  auditEvents,
  charges,
  companyLinks,
  connections,
  consents,
  monthlyUsage,
  userAssumptions,
} from '../src/schema/index.ts';
import { makeAnalysis, makeCompany, makeUser, memoryDb } from './factories.ts';

// D58 (ARCHITECTURE §9.2): login at payment intent. The anonymous session user is linked in place, or merged into
// the account that already holds the identity; the LGPD cleanup never deletes a user who paid.

const DAY = 86_400_000;
let h: DbHandle;
let db: Db;
beforeAll(async () => {
  h = await memoryDb();
  db = h.db;
});
afterAll(() => h.close());

let seq = 0;
function identity() {
  seq += 1;
  return {
    workosUserId: `user_test${seq}`,
    emailHash: `email-hash-${seq}`,
    emailEncrypted: `v1.enc${seq}`,
    displayName: 'Marina',
  };
}

async function paidCharge(userId: string, planId = 'business') {
  const charge = await insertCharge(db, {
    userId,
    planId,
    period: 'yearly',
    amountCents: 59900,
    devMode: true,
    expiresAt: new Date(Date.now() + 900_000),
  });
  const settled = await settleCharge(db, { chargeId: charge.id, paidAt: new Date(), days: 366 });
  expect(settled.settled).toBe(true);
  return charge;
}

describe('linkIdentity / findUserByIdentity', () => {
  it('turns the anonymous user into an account in place and finds it by WorkOS id or e-mail hash', async () => {
    const user = await makeUser(db);
    const id = identity();
    const linked = await linkIdentity(db, user.id, id);
    expect(linked).toMatchObject({
      id: user.id,
      anonymous: false,
      workosUserId: id.workosUserId,
      emailHash: id.emailHash,
      emailEncrypted: id.emailEncrypted,
      displayName: 'Marina',
    });
    expect((await findUserByIdentity(db, id))?.id).toBe(user.id);
    expect(
      (await findUserByIdentity(db, { workosUserId: 'user_other', emailHash: id.emailHash }))?.id,
    ).toBe(user.id);
    expect(
      (await findUserByIdentity(db, { workosUserId: id.workosUserId, emailHash: 'other' }))?.id,
    ).toBe(user.id);
    expect(
      await findUserByIdentity(db, { workosUserId: 'nobody', emailHash: 'nobody' }),
    ).toBeNull();
    expect(await linkIdentity(db, '00000000-0000-4000-8000-000000000000', identity())).toBeNull();
  });

  it('prefers the WorkOS id match over an e-mail-only match', async () => {
    const byEmail = await makeUser(db);
    const byWorkos = await makeUser(db);
    const a = identity();
    const b = identity();
    await linkIdentity(db, byEmail.id, a);
    await linkIdentity(db, byWorkos.id, b);
    const found = await findUserByIdentity(db, {
      workosUserId: b.workosUserId,
      emailHash: a.emailHash,
    });
    expect(found?.id).toBe(byWorkos.id);
  });
});

describe('mergeUsers', () => {
  it('moves everything to the existing account, keeps its duplicates, sums usage and deletes the anonymous row', async () => {
    const anon = await makeUser(db);
    const account = await makeUser(db);
    await linkIdentity(db, account.id, identity());
    const shared = await makeCompany(db, 'RFMERG01000101');
    const onlyAnon = await makeCompany(db, 'RFMERG02000102');
    await db.insert(companyLinks).values([
      { userId: anon.id, companyId: shared.id, role: 'partner' },
      { userId: anon.id, companyId: onlyAnon.id, role: 'partner' },
      { userId: account.id, companyId: shared.id, role: 'accountant' },
    ]);
    await db.insert(userAssumptions).values([
      { userId: anon.id, companyId: shared.id, key: 'monthly_pro_labore', value: 1 },
      { userId: anon.id, companyId: shared.id, key: 'full_bookkeeping', value: true },
      { userId: account.id, companyId: shared.id, key: 'monthly_pro_labore', value: 2 },
    ]);
    const [consent] = await db
      .insert(consents)
      .values({ userId: anon.id, termsVersion: '2026-11-20' })
      .returning();
    await db.insert(connections).values({
      userId: anon.id,
      companyId: onlyAnon.id,
      provider: 'persona',
      holder: 'PJ',
      status: 'active',
    });
    const analysis = await makeAnalysis(db, anon.id, onlyAnon.id);
    await consumeUsage(db, {
      userId: anon.id,
      month: '2026-11',
      resource: 'live',
      n: 2,
      limit: 10,
    });
    await consumeUsage(db, {
      userId: account.id,
      month: '2026-11',
      resource: 'live',
      n: 3,
      limit: 10,
    });
    await consumeUsage(db, {
      userId: anon.id,
      month: '2026-10',
      resource: 'live',
      n: 1,
      limit: 10,
    });
    await insertAuditEvent(db, {
      actorType: 'user',
      actorUserId: anon.id,
      action: 'funnel.estimate_seen',
      targetType: 'funnel',
    });

    expect(await mergeUsers(db, anon.id, account.id)).toBe(true);

    expect(await findUser(db, anon.id)).toBeNull();
    const links = await db.select().from(companyLinks).where(eq(companyLinks.userId, account.id));
    expect(links.map((l) => [l.companyId, l.role]).sort()).toEqual(
      [
        [shared.id, 'accountant'],
        [onlyAnon.id, 'partner'],
      ].sort(),
    );
    const assumptions = await db
      .select()
      .from(userAssumptions)
      .where(eq(userAssumptions.userId, account.id));
    expect(Object.fromEntries(assumptions.map((a) => [a.key, a.value]))).toEqual({
      monthly_pro_labore: 2,
      full_bookkeeping: true,
    });
    expect(
      (
        await db
          .select()
          .from(consents)
          .where(eq(consents.id, consent?.id as string))
      )[0]?.userId,
    ).toBe(account.id);
    expect(
      (await db.select().from(connections).where(eq(connections.userId, account.id))).length,
    ).toBe(1);
    expect((await db.select().from(analyses).where(eq(analyses.id, analysis.id)))[0]?.userId).toBe(
      account.id,
    );
    const usage = await db.select().from(monthlyUsage).where(eq(monthlyUsage.userId, account.id));
    expect(Object.fromEntries(usage.map((u) => [u.month, u.quantity]))).toEqual({
      '2026-11': 5,
      '2026-10': 1,
    });
    const events = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, 'funnel.estimate_seen'));
    expect(events.map((e) => e.actorUserId)).toEqual([account.id]);
  });

  it('a paid subscription survives the merge', async () => {
    const anon = await makeUser(db);
    const account = await makeUser(db);
    await linkIdentity(db, account.id, identity());
    const charge = await paidCharge(anon.id);
    expect((await activeSubscriptions(db, anon.id)).map((s) => s.planId)).toEqual(['business']);

    expect(await mergeUsers(db, anon.id, account.id)).toBe(true);

    expect((await activeSubscriptions(db, account.id)).map((s) => s.planId)).toEqual(['business']);
    const [row] = await db.select().from(charges).where(eq(charges.id, charge.id));
    expect(row).toMatchObject({ userId: account.id, status: 'paid' });
  });

  it('is a no-op for the same user or a missing one', async () => {
    const user = await makeUser(db);
    expect(await mergeUsers(db, user.id, user.id)).toBe(false);
    expect(await mergeUsers(db, user.id, '00000000-0000-4000-8000-000000000000')).toBe(false);
    expect(await findUser(db, user.id)).not.toBeNull();
  });
});

describe('LGPD cleanup never selects a user who paid', () => {
  it('skips an inactive anonymous user with a paid charge, keeps selecting the unpaid one', async () => {
    const paid = await makeUser(db, { lastAccessAt: new Date(Date.now() - 31 * DAY) });
    await paidCharge(paid.id, 'personal');
    const pendingOnly = await makeUser(db, { lastAccessAt: new Date(Date.now() - 31 * DAY) });
    await insertCharge(db, {
      userId: pendingOnly.id,
      planId: 'business',
      period: 'monthly',
      amountCents: 5990,
      devMode: true,
      expiresAt: new Date(Date.now() - DAY),
    });
    const ids = (await inactiveAnonymousUsers(db, 30)).map((u) => u.id);
    expect(ids).not.toContain(paid.id);
    expect(ids).toContain(pendingOnly.id);

    await deleteInactiveAnonymousUsers(db, 30);
    expect(await findUser(db, paid.id)).not.toBeNull();
    expect(await findUser(db, pendingOnly.id)).toBeNull();
  });
});
