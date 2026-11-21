import 'server-only';
import {
  cleanupTechnical,
  clearDeletedAuditActors,
  clearRevokedItem,
  connectionsOlderThan,
  connectionsWithItem,
  consentsOlderThan,
  type Db,
  deleteOrphanCompanies,
  deleteRateLimitsBefore,
  deleteWaitlist,
  expireSubscriptions,
  inactiveAnonymousUsers,
  revokePendingConnections,
  schema,
  touchHeartbeat,
  withdrawConsent,
} from '@refund/db';
import { and, eq, isNull } from 'drizzle-orm';
import { eraseUser } from '../account/delete.ts';
import type { Capabilities } from '../capabilities.ts';
import { todayBrt } from '../company/profile.ts';
import {
  deleteItemAtPluggy,
  type PluggyPort,
  REVOKE_PENDING,
  retireConnection,
} from '../connection/connections.ts';
import { type Secrets, safeEqual } from '../crypto.ts';
import { activePlanWith } from '../entitlements.ts';
import { logger } from '../log.ts';
import { PLANS } from '../plans/catalog.ts';

// `GET /api/cron/diario` (ARCHITECTURE §4.8, §9.6, §10.4; ADR-011). Every step is idempotent and independent: one
// failing step is reported and the others still run (the cron is the only janitor during the freeze).

/** §9.6: anonymous users with no access for 30 days are deleted. */
export const INACTIVE_DAYS = 30;
/** EXECUTION §9 (E11, C7): public company rows nobody uses, after 30 days. */
export const ORPHAN_COMPANY_DAYS = 30;
/** EXECUTION §9 (E11, C4): a consent lasts 12 months. */
export const CONSENT_DAYS = 365;
/** §9.4: rate-limit windows older than 14 days. */
export const RATE_LIMIT_DAYS = 14;
/** Extra days an inactive user waits when Pluggy fails to delete an item (code review E14, M2). */
export const PLUGGY_GRACE_DAYS = 7;
/** The waitlist is deleted from this day on (90 days after the final, 12/12/2026; /privacidade says so). */
export const WAITLIST_DELETE_FROM = '2027-03-12';

export interface CronDeps {
  db: Db;
  secrets: Secrets;
  caps: Capabilities;
  pluggy?: PluggyPort | null;
  nowMs?: number;
}

export interface CronReport {
  cleaned: {
    users: number;
    usersKeptForPluggy: number;
    auditActors: number;
    waitlist: number;
    companies: number;
    revokeRetried: number;
    revokeStillPending: number;
    snapshotsRevoked: number;
    consentsExpired: number;
    rateLimits: number;
    systemEvents: number;
    webhookPayloads: number;
  };
  expired: { subscriptions: number };
  failed: string[];
}

/** Constant-time check of `Authorization: Bearer <CRON_SECRET>`; no secret configured → always false. */
export function cronAuthorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  return safeEqual(header, `Bearer ${secret}`);
}

export async function runDailyCron(deps: CronDeps): Promise<CronReport> {
  const report: CronReport = {
    cleaned: {
      users: 0,
      usersKeptForPluggy: 0,
      auditActors: 0,
      waitlist: 0,
      companies: 0,
      revokeRetried: 0,
      revokeStillPending: 0,
      snapshotsRevoked: 0,
      consentsExpired: 0,
      rateLimits: 0,
      systemEvents: 0,
      webhookPayloads: 0,
    },
    expired: { subscriptions: 0 },
    failed: [],
  };
  const step = async (name: string, work: () => Promise<void>) => {
    try {
      await work();
    } catch (error) {
      logger.error('cron.step_failed', { step: name, error });
      report.failed.push(name);
    }
  };
  const now = deps.nowMs ?? Date.now();

  await step('heartbeat', async () => {
    await touchHeartbeat(deps.db, 'cron');
  });

  // Pluggy items whose deletion failed earlier (EXECUTION §9, E11 M2): retry, then forget the id.
  await step('revoke_pending', async () => {
    for (const row of await revokePendingConnections(deps.db, REVOKE_PENDING)) {
      if ((await deleteItemAtPluggy(deps, row)) === 'done') {
        await clearRevokedItem(deps.db, row.id);
        report.cleaned.revokeRetried += 1;
      } else report.cleaned.revokeStillPending += 1;
    }
  });

  // §8.2 snapshot TTL: on a `snapshot` plan a connection lives `snapshotTtlDays` days, then it is revoked and its
  // copied data deleted.
  await step('snapshot_ttl', async () => {
    const ttl = Math.min(
      ...Object.values(PLANS).flatMap((p) =>
        p.connectionMode === 'snapshot' && p.snapshotTtlDays !== undefined
          ? [p.snapshotTtlDays]
          : [],
      ),
    );
    for (const row of await connectionsOlderThan(deps.db, ttl)) {
      const { plan } = await activePlanWith(deps.db, row.userId);
      const ent = PLANS[plan];
      if (ent.connectionMode !== 'snapshot') continue;
      const age = (now - row.createdAt.getTime()) / 86_400_000;
      if (age <= (ent.snapshotTtlDays ?? Number.POSITIVE_INFINITY)) continue;
      await retireConnection(deps, row);
      report.cleaned.snapshotsRevoked += 1;
    }
  });

  // Consent expiry after 12 months: the consent is withdrawn and its connections retired (LGPD art. 8, § 5º).
  await step('consent_expiry', async () => {
    for (const c of await consentsOlderThan(deps.db, CONSENT_DAYS)) {
      const rows = await deps.db
        .select()
        .from(schema.connections)
        .where(and(eq(schema.connections.consentId, c.id), isNull(schema.connections.revokedAt)));
      for (const row of rows) await retireConnection(deps, row);
      await withdrawConsent(deps.db, c.id);
      report.cleaned.consentsExpired += 1;
    }
  });

  // §9.6 retention: anonymous users inactive for 30 days. Their Pluggy items go first. When Pluggy answers with an
  // error the user waits for the next run, at most PLUGGY_GRACE_DAYS more; with no Pluggy client at all (nothing could
  // ever delete the item) or past the grace, the user is deleted anyway and the PII-free audit row keeps the count of
  // items left at Pluggy (code review E14, M2).
  await step('inactive_users', async () => {
    for (const user of await inactiveAnonymousUsers(deps.db, INACTIVE_DAYS)) {
      let failed = 0;
      let pending = 0;
      for (const row of await connectionsWithItem(deps.db, [user.id])) {
        const r = await deleteItemAtPluggy(deps, row);
        if (r !== 'done') pending += 1;
        if (r === 'failed') failed += 1;
      }
      const overdue =
        now - user.lastAccessAt.getTime() > (INACTIVE_DAYS + PLUGGY_GRACE_DAYS) * 86_400_000;
      if (failed > 0 && !overdue) {
        report.cleaned.usersKeptForPluggy += 1;
        continue;
      }
      const erased = await eraseUser(
        { db: deps.db, userId: user.id, secrets: deps.secrets, caps: deps.caps },
        'system',
        pending,
        { abandonedDays: INACTIVE_DAYS },
      );
      if (erased !== null) report.cleaned.users += 1;
    }
  });

  // SCHEMA §2.9: audit rows outlive their user; the id goes once the user is gone.
  await step('audit_actors', async () => {
    report.cleaned.auditActors = await clearDeletedAuditActors(deps.db);
  });

  // Landing waitlist: kept only to say when the list opens, until 90 days after the final (12/12/2026).
  await step('waitlist', async () => {
    if (todayBrt(now) >= WAITLIST_DELETE_FROM)
      report.cleaned.waitlist = await deleteWaitlist(deps.db);
  });

  await step('orphan_companies', async () => {
    report.cleaned.companies = await deleteOrphanCompanies(deps.db, ORPHAN_COMPANY_DAYS);
  });

  await step('subscriptions', async () => {
    report.expired.subscriptions = await expireSubscriptions(deps.db);
  });

  await step('technical', async () => {
    const t = await cleanupTechnical(deps.db);
    report.cleaned.systemEvents = t.systemEvents;
    report.cleaned.webhookPayloads = t.webhookPayloads;
    report.cleaned.rateLimits = await deleteRateLimitsBefore(
      deps.db,
      new Date(now - RATE_LIMIT_DAYS * 86_400_000),
    );
  });

  return report;
}
