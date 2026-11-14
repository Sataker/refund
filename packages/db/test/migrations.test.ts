import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DbHandle } from '../src/client.ts';
import { appliedMigrations, EXPECTED_MIGRATIONS } from '../src/repos/system.ts';
import { MIGRATIONS_FOLDER, memoryDb } from './factories.ts';

function rows<T>(result: unknown): T[] {
  return (result as { rows: T[] }).rows;
}

describe('migrations from scratch (PGlite)', () => {
  let h: DbHandle;
  beforeAll(async () => {
    h = await memoryDb();
  });
  afterAll(() => h.close());

  it('applies every journal entry', async () => {
    expect(await appliedMigrations(h.db)).toBe(EXPECTED_MIGRATIONS);
  });

  it('creates the 28 tables of SCHEMA §2 inside `refund` and nothing in `public`', async () => {
    const tables = rows<{ schemaname: string; tablename: string }>(
      await h.db.execute(
        sql`SELECT schemaname, tablename FROM pg_tables WHERE schemaname IN ('refund', 'public')`,
      ),
    );
    const refundTables = tables.filter((t) => t.schemaname === 'refund').map((t) => t.tablename);
    expect(refundTables).toHaveLength(28);
    expect(refundTables).toContain('waitlist');
    expect(tables.filter((t) => t.schemaname === 'public')).toEqual([]);
  });

  it('creates the logical FK findings → law_changes (0002) with ON DELETE SET NULL', async () => {
    const [fk] = rows<{ confdeltype: string }>(
      await h.db.execute(
        sql`SELECT confdeltype FROM pg_constraint WHERE conname = 'findings_law_change_fk'`,
      ),
    );
    expect(fk?.confdeltype).toBe('n');
  });

  it('seeds the heartbeat row (0003)', async () => {
    const [hb] = rows<{ id: number; origin: string }>(
      await h.db.execute(sql`SELECT id, origin FROM refund.system_heartbeat`),
    );
    expect(hb).toEqual({ id: 1, origin: 'migration' });
  });

  it('keeps money as bigint, months as char(7) and the waitlist e-mail hash unique', async () => {
    const cols = rows<{ table_name: string; column_name: string; data_type: string }>(
      await h.db.execute(sql`
        SELECT table_name, column_name, data_type FROM information_schema.columns
        WHERE table_schema = 'refund' AND (column_name LIKE '%cents' OR column_name = 'month')`),
    );
    for (const c of cols) {
      expect(c.data_type, `${c.table_name}.${c.column_name}`).toBe(
        c.column_name === 'month' ? 'character' : 'bigint',
      );
    }
    const [uk] = rows<{ indexdef: string }>(
      await h.db.execute(
        sql`SELECT indexdef FROM pg_indexes WHERE indexname = 'waitlist_email_hash_uk'`,
      ),
    );
    expect(uk?.indexdef).toContain('UNIQUE');
  });

  it('revokes everything from anon/authenticated when the Supabase roles exist (0001)', async () => {
    await h.db.execute(sql`CREATE ROLE anon`);
    await h.db.execute(sql`CREATE ROLE authenticated`);
    await h.db.execute(sql`GRANT USAGE ON SCHEMA refund TO anon, authenticated`);
    await h.db.execute(sql`GRANT SELECT ON ALL TABLES IN SCHEMA refund TO anon, authenticated`);
    expect(await canRead('anon')).toBe(true);

    const migration = readFileSync(join(MIGRATIONS_FOLDER, '0001_privileges.sql'), 'utf8');
    for (const statement of migration.split('--> statement-breakpoint')) {
      await h.db.execute(sql.raw(statement));
    }
    expect(await canRead('anon')).toBe(false);
    expect(await canRead('authenticated')).toBe(false);
  });

  async function canRead(role: string): Promise<boolean> {
    const [r] = rows<{ schema: boolean; table: boolean }>(
      await h.db.execute(sql`SELECT
        has_schema_privilege(${role}, 'refund', 'USAGE') AS schema,
        has_table_privilege(${role}, 'refund.users', 'SELECT') AS table`),
    );
    return Boolean(r?.schema || r?.table);
  }
});
