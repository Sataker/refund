import 'server-only';
import {
  cleanupTechnical,
  clearRevokedItem,
  connectionsOlderThan,
  connectionsWithItem,
  consentsOlderThan,
  type Db,
  deleteOrphanCompanies,
  deleteRateLimitsBefore,
  deleteUser,
  expireSubscriptions,
  inactiveAnonymousUserIds,
  revokePendingConnections,
  schema,
  touchHeartbeat,
  withdrawConsent,
} from '@refund/db';
import { and, eq, isNull } from 'drizzle-orm';
import type { Capabilities } from '../capabilities.ts';
import {
  deleteItemAtPluggy,
  type PluggyPort,
  REVOKE_PENDING,
  retireConnection,
} from '../connection/connections.ts';
import { type Secrets, safeEqual } from '../crypto.ts';
import { activePlanWith } from '../entitlements.ts';
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
    } catch {
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
      if (await deleteItemAtPluggy(deps, row)) {
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

  // §9.6 retention: anonymous users inactive for 30 days. Their Pluggy items go first; a user whose item could
  // not be deleted is kept until the next run (the encrypted id would be lost with the row).
  await step('inactive_users', async () => {
    for (const userId of await inactiveAnonymousUserIds(deps.db, INACTIVE_DAYS)) {
      let blocked = false;
      for (const row of await connectionsWithItem(deps.db, [userId]))
        if (!(await deleteItemAtPluggy(deps, row))) blocked = true;
      if (blocked) {
        report.cleaned.usersKeptForPluggy += 1;
        continue;
      }
      if (await deleteUser(deps.db, userId)) report.cleaned.users += 1;
    }
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
