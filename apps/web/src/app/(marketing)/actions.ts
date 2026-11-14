'use server';

import { headers } from 'next/headers';
import type { ActionResult } from '@/server/result.ts';
import { joinWaitlist as join, type WaitlistInput } from '@/server/waitlist.ts';

/** Landing waitlist (E4). The form in features/landing calls this from E11 on. */
export async function joinWaitlist(input: WaitlistInput): Promise<ActionResult<{ joined: true }>> {
  return join(input, await headers());
}
