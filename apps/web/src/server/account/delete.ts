import 'server-only';
import {
  connectionsWithItem,
  type Db,
  deleteRateLimitsOfUser,
  deleteUnusedCompanies,
  deleteUser,
  linkedCompanyIds,
  schema,
} from '@refund/db';
import { z } from 'zod';
import type { Capabilities } from '../capabilities.ts';
import { deleteItemAtPluggy, type PluggyPort } from '../connection/connections.ts';
import { hmac, type Secrets } from '../crypto.ts';
import { logger } from '../log.ts';
import { rateLimit } from '../rate-limit.ts';
import { type ActionResult, fail, ok } from '../result.ts';

// "Apagar meus dados" (ARCHITECTURE §9.6; LGPD art. 18, VI): the items at Pluggy first, then everything personal in
// cascade from `users`, the linked company rows nobody else uses, the rate-limit windows keyed by the user id, and in
// `audit_events` only `{action: 'delete_data'}` with an HMAC of the user id (no PII).

export const deleteInput = z.object({ confirmation: z.literal('APAGAR') });

export interface DeleteDeps {
  db: Db;
  userId: string;
  secrets: Secrets;
  caps: Capabilities;
  pluggy?: PluggyPort | null;
  nowMs?: number;
}

/** The deletion itself, shared with the cron (actor `system`). Returns how many Pluggy items were left behind. */
export async function eraseUser(
  deps: Omit<DeleteDeps, 'nowMs'>,
  actor: 'user' | 'system',
  /** Already asked Pluggy (the cron): how many items were left there. */
  pendingAtPluggy?: number,
): Promise<number> {
  let pending = pendingAtPluggy ?? 0;
  if (pendingAtPluggy === undefined)
    for (const row of await connectionsWithItem(deps.db, [deps.userId])) {
      if ((await deleteItemAtPluggy(deps, row)) !== 'done') pending += 1;
    }
  const companies = await linkedCompanyIds(deps.db, deps.userId);
  // The request is honoured even if Pluggy is down: the sandbox item keeps no data of ours, and the deletion here
  // cannot wait (the encrypted item id goes with the row). The count is kept without any id.
  await deleteUser(deps.db, deps.userId);
  await deleteUnusedCompanies(deps.db, companies);
  await deleteRateLimitsOfUser(deps.db, deps.userId);
  await deps.db.insert(schema.auditEvents).values({
    actorType: actor,
    actorUserId: null,
    action: 'delete_data',
    data: { userHash: hmac(deps.userId, deps.secrets.pepper), pendingAtPluggy: pending },
  });
  return pending;
}

export async function deleteMyDataWith(
  input: unknown,
  deps: DeleteDeps,
): Promise<ActionResult<{ pendingAtPluggy: number }>> {
  const limited = await rateLimit(
    { key: `delete:u:${deps.userId}`, limit: 5, windowMs: 60 * 60_000 },
    deps.db,
    deps.nowMs,
  );
  if (!limited.ok) return limited;
  if (!deleteInput.safeParse(input).success)
    return fail('INVALID_INPUT', 'Digite APAGAR para confirmar.');
  const pending = await eraseUser(deps, 'user');
  logger.info('account.deleted', { pendingAtPluggy: pending });
  return ok({ pendingAtPluggy: pending });
}
