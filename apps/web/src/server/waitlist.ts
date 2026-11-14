import 'server-only';
import { addToWaitlist, type Db } from '@refund/db';
import { z } from 'zod';
import { requireCapability } from './capabilities.ts';
import { encrypt, hashEmail, type Secrets, serverSecrets } from './crypto.ts';
import { getDb } from './db.ts';
import { logger } from './log.ts';
import { ipKey, rateLimit } from './rate-limit.ts';
import { type ActionResult, fail, ok } from './result.ts';

// Landing waitlist (E4; SCHEMA §2.9). Public: no session (whoever joins has none). Order of
// ARCHITECTURE §4.7 without getSession: capability → rate limit → zod. E11 wires the form.

export const WAITLIST_RATE = { limit: 5, windowMs: 60 * 60_000 } as const;

export const waitlistInput = z.object({
  email: z.email().max(254),
  hasCnpj: z.boolean(),
  origin: z
    .string()
    .trim()
    .regex(/^[a-z0-9_-]{1,40}$/)
    .default('landing'),
  consent: z.literal(true),
});
export type WaitlistInput = z.input<typeof waitlistInput>;

export interface WaitlistDeps {
  db: Db;
  secrets: Secrets;
  headers: Headers;
  nowMs?: number;
}

/** Same answer for a new and a repeated e-mail: the response never reveals who is on the list. */
export async function joinWaitlistWith(
  input: unknown,
  deps: WaitlistDeps,
): Promise<ActionResult<{ joined: true }>> {
  const limited = await rateLimit(
    { key: ipKey('waitlist', deps.headers, deps.secrets.pepper), ...WAITLIST_RATE },
    deps.db,
    deps.nowMs,
  );
  if (!limited.ok) return limited;
  const parsed = waitlistInput.safeParse(input);
  if (!parsed.success) {
    return fail('INVALID_INPUT', 'Confira o e-mail e marque o consentimento para entrar na lista.');
  }
  const { email, hasCnpj, origin } = parsed.data;
  const added = await addToWaitlist(deps.db, {
    emailEncrypted: encrypt(email.trim(), deps.secrets.encryption),
    emailHash: hashEmail(email, deps.secrets.pepper),
    hasCnpj,
    origin,
    consentedAt: new Date(deps.nowMs ?? Date.now()),
  });
  logger.info('waitlist.joined', { added, origin, hasCnpj });
  return ok({ joined: true });
}

export async function joinWaitlist(
  input: unknown,
  headers: Headers,
): Promise<ActionResult<{ joined: true }>> {
  const capability = requireCapability('database');
  if (!capability.ok) return capability;
  const secrets = serverSecrets();
  const handle = secrets ? await getDb() : null;
  if (!secrets || !handle) {
    return fail('NOT_CONFIGURED', 'O modo ao vivo não está ativo neste deploy. Veja a demo.');
  }
  try {
    return await joinWaitlistWith(input, { db: handle.db, secrets, headers });
  } catch (err) {
    logger.error('waitlist.error', { error: err });
    return fail('UNAVAILABLE', 'Não conseguimos salvar agora. Tente de novo em instantes.');
  }
}
