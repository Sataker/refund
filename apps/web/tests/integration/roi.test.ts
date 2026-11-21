import { createMemoryDb, type DbHandle, schema } from '@refund/db';
import type { Total } from '@refund/engine';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EMPTY_PROGRESS } from '@/features/track/steps.ts';
import { REPLAY_COMPANIES } from '@/server/company/replay-companies.ts';
import { migrationsFolder } from '@/server/db.ts';
import { roiBasis } from '@/server/plans/roi.ts';
import { linkCompany, type TrackSnapshot } from '@/server/track/state.ts';

// D58 review H1 (PLAN §18): the plans page headline rests on the latest completed analysis of the linked company,
// with its own origin; the estimate's minimum leads only when no such analysis exists.

let h: DbHandle;
beforeAll(async () => {
  const folder = migrationsFolder();
  if (!folder) throw new Error('migrations folder not found');
  h = await createMemoryDb({ migrationsFolder: folder });
});
afterAll(() => h.close());

const [HERO, OTHER] = REPLAY_COMPANIES;

const total = (confirmed: number): Total => ({
  savings12m: confirmed as Total['savings12m'],
  annualRegimeSavings: null,
  byConfidence: {
    confirmed: confirmed as Total['savings12m'],
    estimated: 0 as Total['savings12m'],
    depends_on_regulation: 0 as Total['savings12m'],
  },
  recoveryRange: null,
});

async function setup(): Promise<{ userId: string; track: TrackSnapshot }> {
  if (!HERO) throw new Error('hero missing');
  const [u] = await h.db.insert(schema.users).values({}).returning();
  const userId = u?.id as string;
  const companyId = await linkCompany(h.db, userId, HERO);
  return {
    userId,
    track: {
      company: { id: companyId, company: HERO },
      progress: {
        ...EMPTY_PROGRESS,
        company: { displayName: 'Marina Dev', confirmed: true },
        answers: {
          monthlyRevenueBracket: 'from_30k_to_60k',
          hasEmployees: 'yes',
          receivesFromAbroad: 'half_or_more',
        },
        estimateSeen: true,
      },
    },
  };
}

async function analysis(
  userId: string,
  companyId: string,
  status: 'running' | 'completed' | 'awaiting_confirmation',
  confirmed: number | null,
): Promise<void> {
  await h.db.insert(schema.analyses).values({
    userId,
    companyId,
    origin: 'live',
    status,
    referenceMonth: '2026-11',
    ...(confirmed === null ? {} : { total: total(confirmed) }),
  });
}

describe('roiBasis', () => {
  it('without an analysis, the estimate minimum leads', async () => {
    const { userId, track } = await setup();
    const basis = await roiBasis(h.db, userId, track);
    expect(basis).toMatchObject({ kind: 'estimate', example: false });
    expect(basis?.cents).toBeGreaterThan(0);
  });

  it('a completed analysis with its confirmed total wins; its own statements are not an example', async () => {
    const { userId, track } = await setup();
    await analysis(userId, track.company?.id as string, 'completed', 6_231_892);
    expect(await roiBasis(h.db, userId, track)).toEqual({
      kind: 'confirmed',
      cents: 6_231_892,
      example: false,
    });
  });

  it('a completed analysis with nothing confirmed: no claim, never the estimate', async () => {
    const { userId, track } = await setup();
    await analysis(userId, track.company?.id as string, 'awaiting_confirmation', 0);
    expect(await roiBasis(h.db, userId, track)).toBeNull();
  });

  it('a run still going, or an analysis of another company, does not count', async () => {
    if (!OTHER) throw new Error('replay companies missing');
    const { userId, track } = await setup();
    await analysis(userId, track.company?.id as string, 'running', null);
    // The same user analysed another company before linking this one (a company row of its own).
    const [someone] = await h.db.insert(schema.users).values({}).returning();
    const otherId = await linkCompany(h.db, someone?.id as string, OTHER);
    await analysis(userId, otherId, 'completed', 9_000_000);
    expect(await roiBasis(h.db, userId, track)).toMatchObject({ kind: 'estimate' });
  });

  it('sandbox statements make it an example (C1)', async () => {
    const { userId, track } = await setup();
    const companyId = track.company?.id as string;
    await h.db
      .insert(schema.connections)
      .values({ userId, companyId, provider: 'pluggy', holder: 'PJ', status: 'active' });
    await analysis(userId, companyId, 'completed', 6_231_892);
    expect(await roiBasis(h.db, userId, track)).toEqual({
      kind: 'confirmed',
      cents: 6_231_892,
      example: true,
    });
  });
});
