// Connections (SCHEMA §6 "Pluggy webhook → connection"). The caller computes the HMAC.
import { eq } from 'drizzle-orm';
import type { Db } from '../client.ts';
import { connections } from '../schema/index.ts';

export type ConnectionRow = typeof connections.$inferSelect;

export async function findConnectionByItemHash(
  db: Db,
  itemIdHash: string,
): Promise<ConnectionRow | null> {
  const [row] = await db
    .select()
    .from(connections)
    .where(eq(connections.itemIdHash, itemIdHash))
    .limit(1);
  return row ?? null;
}
