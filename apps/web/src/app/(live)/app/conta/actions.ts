'use server';

import { cookies } from 'next/headers';
import { deleteMyDataWith } from '@/server/account/delete.ts';
import { runLive } from '@/server/action.ts';
import type { ActionResult } from '@/server/result.ts';
import { SESSION_COOKIE } from '@/server/session-cookie.ts';

// ARCHITECTURE §4.7 "account and LGPD (live)": deleteMyData({ confirmation: 'APAGAR' }). After it the session cookie is
// gone too: the next visit to /app starts a new, empty anonymous session.

export async function deleteMyData(input: {
  confirmation: string;
}): Promise<ActionResult<{ pendingAtPluggy: number }>> {
  const result = await runLive('deleteMyData', (ctx) =>
    deleteMyDataWith(input, {
      db: ctx.db,
      userId: ctx.userId,
      secrets: ctx.secrets,
      caps: ctx.caps,
    }),
  );
  if (result.ok) (await cookies()).delete(SESSION_COOKIE);
  return result;
}
