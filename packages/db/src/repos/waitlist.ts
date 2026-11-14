// Landing waitlist (SCHEMA §2.9). The caller encrypts and hashes the e-mail; the repo never sees it.
import type { Db } from '../client.ts';
import { waitlist } from '../schema/index.ts';

export interface WaitlistEntryInput {
  emailEncrypted: string;
  emailHash: string;
  hasCnpj: boolean;
  origin: string;
  consentedAt: Date;
}

/** Idempotent on `email_hash`: returns true for a new entry, false if it was already there. */
export async function addToWaitlist(db: Db, input: WaitlistEntryInput): Promise<boolean> {
  const rows = await db
    .insert(waitlist)
    .values(input)
    .onConflictDoNothing({ target: waitlist.emailHash })
    .returning({ id: waitlist.id });
  return rows.length > 0;
}
