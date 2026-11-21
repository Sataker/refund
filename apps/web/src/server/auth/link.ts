import 'server-only';
import { randomUUID } from 'node:crypto';
import {
  type Db,
  ensureAnonymousUser,
  findUserByEmailHash,
  findUserByWorkosId,
  type IdentityInput,
  linkIdentity,
  mergeUsers,
  type UserRow,
} from '@refund/db';
import { encrypt, hashEmail, type Secrets } from '../crypto.ts';
import { recordFunnelWith } from '../funnel.ts';
import { logger } from '../log.ts';
import { type ActionResult, fail, ok } from '../result.ts';
import type { CookieJar } from '../session.ts';
import {
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  signSession,
  verifySession,
  WORKOS_ID,
} from '../session-cookie.ts';

// ARCHITECTURE §9.2 and ADR-008, as implemented in D58: the WorkOS sign-in (at payment intent) turns the anonymous
// `rf_sid` user into an account. The e-mail is stored only as HMAC (lookup) and AES-GCM (display); it is never logged.
//
// Matching (security review D58, items 1 and 5): the WorkOS user id first; the e-mail hash only for an e-mail WorkOS
// has verified (an unverified e-mail that another account holds is refused, never linked). Only a verified e-mail is
// stored as a lookup key, so nobody can pre-claim someone else's address.
//
// - No account holds this identity yet: the session user is linked in place (same id, so everything stays attached).
// - An account already holds it (returning owner on a new device): the anonymous session user is merged into it.
// - The session user is already another account (a second person on the same browser): nothing is merged.
// Every successful sign-in rotates `rf_sid` and binds it to the WorkOS user (`wid`): no session fixation, and the
// proxy drops the account's session once the WorkOS session ends.

/** The fields of the WorkOS `User` this core reads (no name: `display_name` is never stored). */
export interface WorkosIdentity {
  id: string;
  email: string;
  emailVerified?: boolean;
}

export interface LinkDeps {
  db: Db;
  secrets: Secrets;
  /** The request cookies: `rf_sid` is read here and rotated on success. */
  jar: CookieJar;
  nowMs?: number;
}

export interface LinkOutcome {
  userId: string;
  /** The anonymous session was merged into an existing account. */
  merged: boolean;
  /** `rf_sid` now points to a different user than before the sign-in. */
  switched: boolean;
}

/** An unverified e-mail that already belongs to another account (the callback maps it to `?login=confirme-email`). */
export const EMAIL_UNVERIFIED = 'EMAIL_UNVERIFIED';

const FAILED = 'Não conseguimos concluir o login agora. Tente de novo em instantes.';
const UNVERIFIED =
  'Este e-mail já tem uma conta no Refund. Confirme o e-mail no login para entrar nela.';

interface Identity {
  workosUserId: string;
  email: { hash: string; encrypted: string };
  verified: boolean;
}

function identityOf(user: WorkosIdentity, secrets: Secrets): Identity | null {
  const email = user.email.trim();
  if (!email.includes('@') || !WORKOS_ID.test(user.id)) return null;
  return {
    workosUserId: user.id,
    email: {
      hash: hashEmail(email, secrets.pepper),
      encrypted: encrypt(email, secrets.encryption),
    },
    verified: user.emailVerified === true,
  };
}

type Resolved = { ok: true; target: UserRow | null; write: IdentityInput } | { ok: false };

/** Which account this identity is, and what may be written on it. */
async function resolve(db: Db, identity: Identity): Promise<Resolved> {
  const bare: IdentityInput = { workosUserId: identity.workosUserId };
  const withEmail: IdentityInput = identity.verified ? { ...bare, email: identity.email } : bare;
  const byWorkos = await findUserByWorkosId(db, identity.workosUserId);
  const holder = await findUserByEmailHash(db, identity.email.hash);
  if (byWorkos) {
    // A changed e-mail that another row already holds: keep this account's e-mail and let the sign-in through.
    if (holder && holder.id !== byWorkos.id) {
      logger.warn('auth.email_kept');
      return { ok: true, target: byWorkos, write: bare };
    }
    return { ok: true, target: byWorkos, write: withEmail };
  }
  if (holder)
    return identity.verified ? { ok: true, target: holder, write: withEmail } : { ok: false };
  return { ok: true, target: null, write: withEmail };
}

export async function linkWorkosUserWith(
  user: WorkosIdentity,
  deps: LinkDeps,
): Promise<ActionResult<LinkOutcome>> {
  const { db, secrets, jar } = deps;
  const identity = identityOf(user, secrets);
  if (!identity) return fail('INVALID_INPUT', FAILED);
  const nowMs = deps.nowMs ?? Date.now();
  const sessionUserId = verifySession(
    jar.get(SESSION_COOKIE)?.value,
    secrets.session,
    nowMs,
  )?.userId;

  let outcome: LinkOutcome;
  try {
    const resolved = await resolve(db, identity);
    if (!resolved.ok) {
      logger.info('auth.email_unverified');
      return fail(EMAIL_UNVERIFIED, UNVERIFIED);
    }
    const sessionUser: UserRow | null = sessionUserId
      ? await ensureAnonymousUser(db, sessionUserId)
      : null;
    let target: string;
    let merged = false;
    if (resolved.target) {
      target = resolved.target.id;
      if (sessionUser?.anonymous && sessionUser.id !== target) {
        merged = await mergeUsers(db, sessionUser.id, target);
      }
    } else if (sessionUser?.anonymous) {
      target = sessionUser.id;
    } else {
      // No session, or the session is somebody else's account: a fresh account for this identity.
      target = (await ensureAnonymousUser(db, randomUUID())).id;
    }
    const linked = await linkIdentity(db, target, resolved.write);
    if (!linked) return fail('UNAVAILABLE', FAILED);
    outcome = { userId: target, merged, switched: target !== sessionUserId };
  } catch (err) {
    logger.error('auth.link_failed', { error: err });
    return fail('UNAVAILABLE', FAILED);
  }

  jar.set?.(
    SESSION_COOKIE,
    signSession(
      { userId: outcome.userId, issuedAt: Math.floor(nowMs / 1000), wid: identity.workosUserId },
      secrets.session,
    ),
    SESSION_COOKIE_OPTIONS,
  );
  await recordFunnelWith(db, outcome.userId, 'funnel.login_completed', { merged: outcome.merged });
  logger.info('auth.linked', { merged: outcome.merged, switched: outcome.switched });
  return ok(outcome);
}
