'use server';

import { headers } from 'next/headers';
import { getDb } from '@/server/db.ts';
import { logger } from '@/server/log.ts';
import { ipKey, memoryRateLimit } from '@/server/rate-limit.ts';
import { decideReportWith } from '@/server/report/report.ts';
import { type ActionResult, fail } from '@/server/result.ts';

// ARCHITECTURE §4.7 decideReport: public, authenticated by the token (the accountant has no account). Limited per IP.

export async function decideReport(input: {
  token: string;
  decisions: { findingId: string; decision: 'approved' | 'adjustment'; comment?: string }[];
  final: 'approved' | 'adjustments';
}): Promise<ActionResult<void>> {
  if (!memoryRateLimit({ key: ipKey('decide', await headers()), limit: 20, windowMs: 60 * 60_000 }))
    return fail('RATE_LIMITED', 'Muitas tentativas. Espere alguns minutos.');
  try {
    const handle = await getDb();
    if (!handle) return fail('NOT_CONFIGURED', 'O modo ao vivo não está ativo neste deploy.');
    return await decideReportWith(input, { db: handle.db });
  } catch (err) {
    logger.error('action.error', { action: 'decideReport', error: err });
    return fail('UNAVAILABLE', 'Algo deu errado do nosso lado. Tente de novo em instantes.');
  }
}
