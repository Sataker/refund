import 'server-only';
import type { Db } from '@refund/db';
import type { DataMode } from '@refund/sources';
import { cookies, headers } from 'next/headers';
import { type Capabilities, capabilities, requireCapability } from './capabilities.ts';
import { type Secrets, serverSecrets } from './crypto.ts';
import { getDb } from './db.ts';
import { logger } from './log.ts';
import { type ActionResult, fail, ok } from './result.ts';
import { resolveSession } from './session.ts';

// The first two steps of every live server action (ARCHITECTURE §4.7: getSession → requireCapability)
// and of every /app page, with the handles the next steps need. /app requires `database` or
// `memoryDatabase` (§4.10); without them the page shows "modo ao vivo indisponível".

export interface LiveContext {
  userId: string;
  /** D58: the session user is linked to a WorkOS account (only a sign-in with the `login` capability sets it). */
  isLoggedIn: boolean;
  db: Db;
  secrets: Secrets;
  caps: Capabilities;
  dataMode: DataMode;
  headers: Headers;
}

export const LIVE_OFF = 'O modo ao vivo não está ativo neste deploy. Veja a demo.';

/**
 * `create: true` only in server actions (they may set the cookie); pages read the one the proxy minted.
 */
export async function liveContext(
  options: { create?: boolean } = {},
): Promise<ActionResult<LiveContext>> {
  const caps = capabilities();
  const capability = requireCapability('database', caps);
  const secrets = serverSecrets();
  if (!capability.ok || !secrets) return fail('NOT_CONFIGURED', LIVE_OFF);
  let handle: Awaited<ReturnType<typeof getDb>>;
  try {
    handle = await getDb();
  } catch (err) {
    logger.error('session.error', { error: err });
    return fail(
      'UNAVAILABLE',
      'O modo ao vivo está fora do ar agora. Tente em instantes ou veja a demo.',
    );
  }
  if (!handle) return fail('NOT_CONFIGURED', LIVE_OFF);
  const session = await resolveSession(
    await cookies(),
    { db: handle.db, secret: secrets.session },
    options,
  );
  if (!session.ok) return session;
  return ok({
    userId: session.value.userId,
    isLoggedIn: !session.value.anonymous,
    db: handle.db,
    secrets,
    caps,
    dataMode: caps.liveData ? 'live' : 'replay',
    headers: await headers(),
  });
}
