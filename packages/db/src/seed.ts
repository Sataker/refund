// Idempotent seed (SCHEMA §5). The data comes from outside (@refund/law, @refund/personas) so this
// package keeps its dependency rules (ARCHITECTURE §3.2); the CLI is `packages/db/seed.ts`.
import type { PublicCompany } from '@refund/sources';
import { sql } from 'drizzle-orm';
import type { Db } from './client.ts';
import { touchHeartbeat } from './repos/system.ts';
import { companies, companyLinks, monitoredRegulations, users } from './schema/index.ts';

export interface RegulationRef {
  id: string;
  url: string;
}

/** `reference` profile: every environment with a database, production included. */
export async function seedReference(db: Db, regulations: readonly RegulationRef[]): Promise<void> {
  await touchHeartbeat(db, 'migration');
  if (regulations.length === 0) return;
  await db
    .insert(monitoredRegulations)
    .values(regulations.map((r) => ({ regulationId: r.id, url: r.url })))
    .onConflictDoUpdate({
      target: monitoredRegulations.regulationId,
      set: { url: sql`excluded.url` }, // firecrawl_monitor_id is filled by the monitor script
    });
}

/** Fixed id of the anonymous test user of the `dev` profile (synthetic; never in production). */
export const DEV_USER_ID = '00000000-0000-4000-8000-00000000d001';

export type CompanyInsert = typeof companies.$inferInsert;

/** Maps the whitelisted public company to the `companies` row (no field outside the whitelist). */
export function companyRow(company: PublicCompany): CompanyInsert {
  return {
    cnpj: company.cnpj,
    displayLegalName: company.displayLegalName,
    displayTradeName: company.displayTradeName,
    masked: company.masked,
    legalNatureCode: company.legalNature.code.replace(/\D/g, '').slice(0, 4),
    size: company.size,
    primaryCnae: company.primaryCnae.code.replace(/\D/g, '').slice(0, 7),
    secondaryCnaes: company.secondaryCnaes.map((c) => c.code.replace(/\D/g, '')),
    // Registry status only: the regime the engine uses comes from the analysis, not from here.
    regime: company.mei.optedIn ? 'MEI' : company.simples.optedIn ? 'SIMPLES' : 'OTHER',
    optedIntoSimples: company.simples.optedIn,
    optedIntoMei: company.mei.optedIn,
    openedOn: company.activityStartDate,
    uf: company.uf,
    ibgeMunicipality: company.ibgeMunicipality,
    publicData: company,
    source: company.source,
  };
}

/**
 * `dev` profile: reference + one anonymous test user + the catalog personas' companies, linked to
 * that user. The hero's completed analysis needs the pipeline (E9) and lands with E14.
 */
export async function seedDev(
  db: Db,
  input: { regulations: readonly RegulationRef[]; companies: readonly PublicCompany[] },
): Promise<void> {
  await seedReference(db, input.regulations);
  await db
    .insert(users)
    .values({ id: DEV_USER_ID, anonymous: true, displayName: 'Teste (dev)' })
    .onConflictDoUpdate({ target: users.id, set: { lastAccessAt: sql`now()` } });
  for (const company of input.companies) {
    const row = companyRow(company);
    const { cnpj: _key, ...update } = row;
    const [saved] = await db
      .insert(companies)
      .values(row)
      .onConflictDoUpdate({ target: companies.cnpj, set: { ...update, updatedAt: sql`now()` } })
      .returning({ id: companies.id });
    if (!saved) throw new Error('seedDev: company not saved');
    await db
      .insert(companyLinks)
      .values({ userId: DEV_USER_ID, companyId: saved.id, role: 'partner' })
      .onConflictDoNothing();
  }
}
