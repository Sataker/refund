import 'server-only';
import { companyRow, type Db, schema } from '@refund/db';
import type { ProfileAnswers } from '@refund/engine';
import { type PublicCompany, parsePublicCompany } from '@refund/sources';
import { and, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import {
  type ConnectionStatus,
  type ConnectionSummary,
  EMPTY_PROGRESS,
  type TrackProgress,
} from '@/features/track/steps.ts';
import { profileQuestions } from '../company/profile.ts';

// Track state from the anonymous session (ADR-008; ARCHITECTURE §13: "answers of each step are saved
// on advancing, so the user can resume"). No new table: the company is a `company_links` row, the
// answers are `user_assumptions` keyed below, consent is `consents`, accounts are `connections`.
// These queries belong in @refund/db's repos; they live here while E11 cannot touch packages (§9).

export const TRACK_KEYS = {
  confirmed: 'track.company_confirmed',
  estimateSeen: 'track.estimate_seen',
  pfSkipped: 'track.pf_skipped',
  revenue: 'profile.monthly_revenue_bracket',
  employees: 'profile.has_employees',
  abroad: 'profile.receives_from_abroad',
} as const;
export type TrackKey = (typeof TRACK_KEYS)[keyof typeof TRACK_KEYS];

const { companies, companyLinks, userAssumptions, consents, connections, accounts, transactions } =
  schema;

export interface TrackCompany {
  id: string;
  company: PublicCompany;
}

/** The company of the user's track (one at a time), or null before the CNPJ step. */
export async function trackCompany(db: Db, userId: string): Promise<TrackCompany | null> {
  const [row] = await db
    .select({ id: companies.id, publicData: companies.publicData })
    .from(companyLinks)
    .innerJoin(companies, eq(companies.id, companyLinks.companyId))
    .where(eq(companyLinks.userId, userId))
    .orderBy(desc(companyLinks.createdAt))
    .limit(1);
  if (!row) return null;
  const company = parsePublicCompany(row.publicData);
  return company ? { id: row.id, company } : null;
}

/**
 * Saves the looked-up company (whitelist fields only: `companyRow`) and makes it the user's track
 * company. A different CNPJ starts the profile over: answers belong to a company.
 */
export async function linkCompany(db: Db, userId: string, company: PublicCompany): Promise<string> {
  const row = companyRow(company);
  const { cnpj: _key, ...update } = row;
  return db.transaction(async (tx) => {
    const [saved] = await tx
      .insert(companies)
      .values(row)
      .onConflictDoUpdate({ target: companies.cnpj, set: { ...update, updatedAt: new Date() } })
      .returning({ id: companies.id });
    if (!saved) throw new Error('linkCompany: company not saved');
    const [current] = await tx
      .select({ companyId: companyLinks.companyId })
      .from(companyLinks)
      .where(eq(companyLinks.userId, userId));
    if (current?.companyId !== saved.id) {
      await tx.delete(userAssumptions).where(eq(userAssumptions.userId, userId));
      await tx.delete(companyLinks).where(eq(companyLinks.userId, userId));
      await tx
        .insert(companyLinks)
        .values({ userId, companyId: saved.id, role: 'partner' })
        .onConflictDoNothing();
    } else {
      // Same company typed again: the identity has to be confirmed again, the answers stay.
      await tx
        .delete(userAssumptions)
        .where(
          and(eq(userAssumptions.userId, userId), eq(userAssumptions.key, TRACK_KEYS.confirmed)),
        );
    }
    return saved.id;
  });
}

/** "Não é minha empresa": back to the CNPJ step with nothing left behind. */
export async function unlinkCompany(db: Db, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(userAssumptions).where(eq(userAssumptions.userId, userId));
    await tx.delete(companyLinks).where(eq(companyLinks.userId, userId));
  });
}

export async function setAssumption(
  db: Db,
  userId: string,
  companyId: string,
  key: TrackKey,
  value: string | boolean,
): Promise<void> {
  await db
    .insert(userAssumptions)
    .values({ userId, companyId, key, value })
    .onConflictDoUpdate({
      target: [userAssumptions.userId, userAssumptions.companyId, userAssumptions.key],
      set: { value, updatedAt: new Date() },
    });
}

export async function hasActiveConsent(db: Db, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: consents.id })
    .from(consents)
    .where(and(eq(consents.userId, userId), isNull(consents.revokedAt)))
    .limit(1);
  return row !== undefined;
}

export async function insertConsent(
  db: Db,
  input: { userId: string; scopes: string[]; termsVersion: string; ipHash: string | null },
): Promise<string> {
  const [row] = await db.insert(consents).values(input).returning({ id: consents.id });
  if (!row) throw new Error('insertConsent: no row returned');
  return row.id;
}

/** Latest connection per holder that was not revoked, with its transaction count. */
export async function liveConnections(
  db: Db,
  userId: string,
): Promise<{ PJ: ConnectionSummary | null; PF: ConnectionSummary | null }> {
  const rows = await db
    .select()
    .from(connections)
    .where(and(eq(connections.userId, userId), isNull(connections.revokedAt)))
    .orderBy(desc(connections.createdAt));
  const out: { PJ: ConnectionSummary | null; PF: ConnectionSummary | null } = {
    PJ: null,
    PF: null,
  };
  const picked = rows.filter((r, i) => rows.findIndex((x) => x.holder === r.holder) === i);
  for (const r of picked) {
    out[r.holder] = {
      id: r.id,
      provider: r.provider,
      status: r.status as ConnectionStatus,
      connectorName: r.connectorName,
      transactions: await transactionCount(db, r.id),
    };
  }
  return out;
}

export async function transactionCount(db: Db, connectionId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(eq(accounts.connectionId, connectionId));
  return row?.n ?? 0;
}

const REVENUE = new Set<string>([
  'up_to_15k',
  'from_15k_to_30k',
  'from_30k_to_60k',
  'from_60k_to_150k',
  'from_150k_to_300k',
  'from_300k_to_400k',
  'above_400k',
  'dont_know',
]);
const EMPLOYEES = new Set<string>(['yes', 'no', 'dont_know']);
const ABROAD = new Set<string>(['no', 'less_than_half', 'half_or_more', 'dont_know']);

function pick<T extends string>(value: unknown, allowed: Set<string>): T | undefined {
  return typeof value === 'string' && allowed.has(value) ? (value as T) : undefined;
}

export interface TrackSnapshot {
  progress: TrackProgress;
  company: TrackCompany | null;
}

/** Everything the track pages need, in one place (read-only). */
export async function loadTrack(db: Db, userId: string): Promise<TrackSnapshot> {
  const company = await trackCompany(db, userId);
  if (!company) {
    return { company: null, progress: EMPTY_PROGRESS };
  }
  const rows = await db
    .select({ key: userAssumptions.key, value: userAssumptions.value })
    .from(userAssumptions)
    .where(
      and(
        eq(userAssumptions.userId, userId),
        eq(userAssumptions.companyId, company.id),
        inArray(userAssumptions.key, Object.values(TRACK_KEYS)),
      ),
    );
  const get = (key: TrackKey) => rows.find((r) => r.key === key)?.value;
  const answers: Partial<ProfileAnswers> = {};
  const revenue = pick<ProfileAnswers['monthlyRevenueBracket']>(get(TRACK_KEYS.revenue), REVENUE);
  const employees = pick<ProfileAnswers['hasEmployees']>(get(TRACK_KEYS.employees), EMPLOYEES);
  const abroad = pick<ProfileAnswers['receivesFromAbroad']>(get(TRACK_KEYS.abroad), ABROAD);
  if (revenue) answers.monthlyRevenueBracket = revenue;
  if (employees) answers.hasEmployees = employees;
  if (abroad) answers.receivesFromAbroad = abroad;
  const [consented, conns] = await Promise.all([
    hasActiveConsent(db, userId),
    liveConnections(db, userId),
  ]);
  const c = company.company;
  return {
    company,
    progress: {
      company: {
        displayName: c.displayTradeName ?? c.displayLegalName,
        confirmed: get(TRACK_KEYS.confirmed) === true,
      },
      questions: profileQuestions(c),
      answers,
      estimateSeen: get(TRACK_KEYS.estimateSeen) === true,
      consented,
      pj: conns.PJ,
      pf: conns.PF,
      pfSkipped: get(TRACK_KEYS.pfSkipped) === true,
    },
  };
}
