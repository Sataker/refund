import 'server-only';
import { randomUUID } from 'node:crypto';
import {
  type Db,
  ensureAnonymousUser,
  findUserByIdentity,
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
} from '../session-cookie.ts';

// ARCHITECTURE §9.2 and ADR-008, as implemented in D58: the WorkOS sign-in (at payment intent) turns the anonymous
// `rf_sid` user into an account. The e-mail is stored only as HMAC (lookup) and AES-GCM (display); it is never logged.
//
// - No account holds this identity yet: the session user is linked in place (same id, so everything stays attached).
// - An account already holds it (returning owner on a new device): the anonymous session user is merged into that
//   account and `rf_sid` is re-signed to the account's id.
// - The session user is already another account (a second person on the same browser): nothing is merged; `rf_sid`
//   just switches to the account that signed in.

/** The fields of the WorkOS `User` this core reads. */
export interface WorkosIdentity {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}

export interface LinkDeps {
  db: Db;
  secrets: Secrets;
  /** The request cookies: `rf_sid` is read here and re-signed when the user changes. */
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

const FAILED = 'Não conseguimos concluir o login agora. Tente de novo em instantes.';

function identityOf(user: WorkosIdentity, secrets: Secrets): IdentityInput | null {
  const email = user.email.trim();
  if (!email.includes('@') || !/^[A-Za-z0-9_-]{1,80}$/.test(user.id)) return null;
  const name = [user.firstName, user.lastName]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(' ');
  return {
    workosUserId: user.id,
    emailHash: hashEmail(email, secrets.pepper),
    emailEncrypted: encrypt(email, secrets.encryption),
    displayName: name === '' ? null : name,
  };
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
    const sessionUser: UserRow | null = sessionUserId
      ? await ensureAnonymousUser(db, sessionUserId)
      : null;
    const existing = await findUserByIdentity(db, identity);
    let target: string;
    let merged = false;
    if (existing) {
      target = existing.id;
      if (sessionUser?.anonymous && sessionUser.id !== existing.id) {
        merged = await mergeUsers(db, sessionUser.id, existing.id);
      }
    } else if (sessionUser?.anonymous) {
      target = sessionUser.id;
    } else {
      // No session, or the session is somebody else's account: a fresh account for this identity.
      target = (await ensureAnonymousUser(db, randomUUID())).id;
    }
    // Also refreshes a returning account (a changed e-mail or name at WorkOS).
    const linked = await linkIdentity(db, target, identity);
    if (!linked) return fail('UNAVAILABLE', FAILED);
    outcome = { userId: target, merged, switched: target !== sessionUserId };
  } catch (err) {
    logger.error('auth.link_failed', { error: err });
    return fail('UNAVAILABLE', FAILED);
  }

  if (outcome.switched) {
    const issuedAt = Math.floor(nowMs / 1000);
    jar.set?.(
      SESSION_COOKIE,
      signSession({ userId: outcome.userId, issuedAt }, secrets.session),
      SESSION_COOKIE_OPTIONS,
    );
  }
  await recordFunnelWith(db, outcome.userId, 'funnel.login_completed', { merged: outcome.merged });
  logger.info('auth.linked', { merged: outcome.merged, switched: outcome.switched });
  return ok(outcome);
}
