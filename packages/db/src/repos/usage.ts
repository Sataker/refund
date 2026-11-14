// Monthly usage (SCHEMA §2.8; ARCHITECTURE §8.2 "atomic count, no race").
import { sql } from 'drizzle-orm';
import type { Db } from '../client.ts';
import { monthlyUsage } from '../schema/index.ts';

export interface ConsumeInput {
  userId: string;
  /** 'YYYY-MM' in America/Sao_Paulo; the caller decides the month. */
  month: string;
  resource: string;
  n: number;
  limit: number;
}

/**
 * Adds `n` to the counter only if the total stays ≤ `limit`, in a single statement (the conditional
 * upsert serializes on the row). Returns the new quantity, or null when the limit would be exceeded.
 */
export async function consumeUsage(db: Db, input: ConsumeInput): Promise<number | null> {
  if (!Number.isSafeInteger(input.n) || input.n <= 0) throw new RangeError(`invalid n: ${input.n}`);
  // The INSERT branch has no WHERE: a first call with n > limit must be refused here.
  if (input.n > input.limit) return null;
  const rows = await db
    .insert(monthlyUsage)
    .values({
      userId: input.userId,
      month: input.month,
      resource: input.resource,
      quantity: input.n,
    })
    .onConflictDoUpdate({
      target: [monthlyUsage.userId, monthlyUsage.month, monthlyUsage.resource],
      set: { quantity: sql`${monthlyUsage.quantity} + excluded.quantity`, updatedAt: sql`now()` },
      setWhere: sql`${monthlyUsage.quantity} + excluded.quantity <= ${input.limit}`,
    })
    .returning({ quantity: monthlyUsage.quantity });
  return rows[0]?.quantity ?? null;
}
