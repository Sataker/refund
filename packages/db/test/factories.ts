// Test factories (SCHEMA §5): each test creates what it needs on its own PGlite; no seed.
import { fileURLToPath } from 'node:url';
import type { PublicCompany } from '@refund/sources';
import { createMemoryDb, type Db, type DbHandle } from '../src/client.ts';
import { analyses, companies, findings, subscriptions, users } from '../src/schema/index.ts';
import { companyRow } from '../src/seed.ts';

export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../migrations', import.meta.url));

export function memoryDb(): Promise<DbHandle> {
  return createMemoryDb({ migrationsFolder: MIGRATIONS_FOLDER });
}

export async function makeUser(db: Db, over: Partial<typeof users.$inferInsert> = {}) {
  const [row] = await db
    .insert(users)
    .values({ anonymous: true, ...over })
    .returning();
  if (!row) throw new Error('makeUser');
  return row;
}

/** Synthetic company (CNPJ of the persona catalog's shape; does not exist at the Receita). */
export async function makeCompany(db: Db, cnpj = 'RFTEST01000199') {
  const [row] = await db
    .insert(companies)
    .values(
      companyRow({
        cnpj: cnpj as PublicCompany['cnpj'],
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
  if (!row) throw new Error('makeCompany');
  return row;
}

export async function makeAnalysis(
  db: Db,
  userId: string,
  companyId: string,
  over: Partial<typeof analyses.$inferInsert> = {},
) {
  const [row] = await db
    .insert(analyses)
    .values({ userId, companyId, origin: 'live', referenceMonth: '2026-10', ...over })
    .returning();
  if (!row) throw new Error('makeAnalysis');
  return row;
}

export async function makeFinding(db: Db, analysisId: string, ruleId: string, refIds: string[]) {
  const [row] = await db
    .insert(findings)
    .values({
      analysisId,
      ruleId,
      ruleVersion: '1',
      order: 1,
      type: 'savings',
      title: 'Achado de teste',
      marginalValue12mCents: 100_00,
      confidence: 'confirmed',
      countsInTotal: true,
      trace: [],
      refs: [],
      refIds,
    })
    .returning();
  if (!row) throw new Error('makeFinding');
  return row;
}

export async function makeSubscription(
  db: Db,
  userId: string,
  planId: string,
  endsAt: Date,
  status: 'active' | 'expired' = 'active',
) {
  const [row] = await db
    .insert(subscriptions)
    .values({ userId, planId, status, origin: 'courtesy', startsAt: new Date(0), endsAt })
    .returning();
  if (!row) throw new Error('makeSubscription');
  return row;
}
