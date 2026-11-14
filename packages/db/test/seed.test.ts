import { regulations } from '@refund/law';
import { generate, PERSONA_IDS } from '@refund/personas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DbHandle } from '../src/client.ts';
import { companies, companyLinks, monitoredRegulations, users } from '../src/schema/index.ts';
import { DEV_USER_ID, seedDev, seedReference } from '../src/seed.ts';
import { memoryDb } from './factories.ts';

describe('seed (SCHEMA §5)', () => {
  let h: DbHandle;
  beforeAll(async () => {
    h = await memoryDb();
  });
  afterAll(() => h.close());

  const refs = regulations.map((r) => ({ id: r.id, url: r.url }));

  it('reference: one monitored row per regulation, idempotent', async () => {
    await seedReference(h.db, refs);
    await seedReference(h.db, refs);
    const rows = await h.db.select().from(monitoredRegulations);
    expect(rows).toHaveLength(regulations.length);
    expect(rows.every((r) => r.firecrawlMonitorId === null)).toBe(true);
  });

  it('dev: test user + persona companies linked, idempotent and whitelisted', async () => {
    const personaCompanies = PERSONA_IDS.map((id) => generate(id).data.company);
    await seedDev(h.db, { regulations: refs, companies: personaCompanies });
    await seedDev(h.db, { regulations: refs, companies: personaCompanies });
    const saved = await h.db.select().from(companies);
    expect(saved.map((c) => c.cnpj)).toEqual(personaCompanies.map((c) => c.cnpj));
    expect(saved[0]?.primaryCnae).toMatch(/^\d{7}$/);
    expect(JSON.stringify(saved[0]?.publicData)).not.toMatch(/qsa|cnpj_cpf_do_socio/);
    expect((await h.db.select().from(users)).map((u) => u.id)).toEqual([DEV_USER_ID]);
    expect(await h.db.select().from(companyLinks)).toHaveLength(personaCompanies.length);
  });
});
