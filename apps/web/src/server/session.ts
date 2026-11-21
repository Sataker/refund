import 'server-only';
import { type Db, ensureAnonymousUser } from '@refund/db';
import { cookies } from 'next/headers';
import { serverSecrets } from './crypto.ts';
import { getDb } from './db.ts';
import { logger } from './log.ts';
import { type ActionResult, fail, ok } from './result.ts';
import {
  newSession,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  verifySession,
} from './session-cookie.ts';

// ARCHITECTURE §9.2 and ADR-008: anonymous session. The proxy mints `rf_sid` on the first visit to
// /app/**; the users row is created lazily by the first server action (getSession). With the `login` capability,
// a WorkOS sign-in at payment intent links the same row to an account (D58, server/auth/link.ts).

const UNAVAILABLE = 'Não conseguimos abrir sua sessão agora. Tente de novo em instantes.';
const EXPIRED = 'Sua sessão expirou. Recarregue a página para continuar.';

export interface CookieJar {
  get(name: string): { value: string } | undefined;
  set?(name: string, value: string, options: typeof SESSION_COOKIE_OPTIONS): unknown;
}

export interface Session {
  userId: string;
  /** False once a WorkOS sign-in linked this user to an account (D58). */
  anonymous: boolean;
}

/**
 * Core of getSession, with its dependencies passed in (tested on PGlite). `create` mints a new
 * session when there is none (server actions may set cookies; Server Components may not).
 */
export async function resolveSession(
  jar: CookieJar,
  deps: { db: Db; secret: Buffer },
  options: { create?: boolean } = {},
): Promise<ActionResult<Session>> {
  const payload = verifySession(jar.get(SESSION_COOKIE)?.value, deps.secret);
  if (payload) {
    let row: Awaited<ReturnType<typeof ensureAnonymousUser>>;
    try {
      row = await ensureAnonymousUser(deps.db, payload.userId);
    } catch (err) {
      logger.error('session.error', { error: err });
      return fail('UNAVAILABLE', UNAVAILABLE);
    }
    // D58 (security review, item 2): an account is granted only to the session its sign-in signed (`wid`). A copy of
    // the cookie from before the sign-in (session fixation) or for another WorkOS user falls back to a new session.
    if (row.anonymous || (row.workosUserId !== null && row.workosUserId === payload.wid)) {
      return ok({ userId: payload.userId, anonymous: row.anonymous });
    }
    logger.info('session.account_not_bound');
  }
  if (!options.create || !jar.set) {
    return fail('UNAUTHENTICATED', EXPIRED);
  }
  const fresh = newSession(deps.secret);
  jar.set(SESSION_COOKIE, fresh.value, SESSION_COOKIE_OPTIONS);
  try {
    await ensureAnonymousUser(deps.db, fresh.payload.userId);
  } catch (err) {
    logger.error('session.error', { error: err });
    return fail('UNAVAILABLE', UNAVAILABLE);
  }
  return ok({ userId: fresh.payload.userId, anonymous: true });
}

/** First step of every server action (ARCHITECTURE §4.7). */
export async function getSession(
  options: { create?: boolean } = {},
): Promise<ActionResult<Session>> {
  const secrets = serverSecrets();
  let handle: Awaited<ReturnType<typeof getDb>> = null;
  try {
    handle = secrets ? await getDb() : null;
  } catch (err) {
    logger.error('session.error', { error: err });
    return fail('UNAVAILABLE', UNAVAILABLE);
  }
  if (!secrets || !handle) {
    return fail('NOT_CONFIGURED', 'O modo ao vivo não está ativo neste deploy. Veja a demo.');
  }
  return resolveSession(await cookies(), { db: handle.db, secret: secrets.session }, options);
}
