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
// /app/**; the users row is created lazily by the first server action (getSession). WorkOS joins in
// E18 when the `login` capability exists.

const UNAVAILABLE = 'Não conseguimos abrir sua sessão agora. Tente de novo em instantes.';

export interface CookieJar {
  get(name: string): { value: string } | undefined;
  set?(name: string, value: string, options: typeof SESSION_COOKIE_OPTIONS): unknown;
}

export interface Session {
  userId: string;
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
  let payload = verifySession(jar.get(SESSION_COOKIE)?.value, deps.secret);
  if (!payload) {
    if (!options.create || !jar.set) {
      return fail('UNAUTHENTICATED', 'Sua sessão expirou. Recarregue a página para continuar.');
    }
    const fresh = newSession(deps.secret);
    jar.set(SESSION_COOKIE, fresh.value, SESSION_COOKIE_OPTIONS);
    payload = fresh.payload;
  }
  try {
    await ensureAnonymousUser(deps.db, payload.userId);
  } catch (err) {
    logger.error('session.error', { error: err });
    return fail('UNAVAILABLE', UNAVAILABLE);
  }
  return ok({ userId: payload.userId });
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
