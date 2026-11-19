import 'server-only';
import { type LiveContext, liveContext } from './live.ts';
import { logger } from './log.ts';
import { type ActionResult, fail } from './result.ts';

// ARCHITECTURE §4.7: getSession → requireCapability (liveContext) here; rateLimit → entitlement → zod inside each core.
// A thrown error becomes a Result (nothing throws to the client).

const FAILED = 'Algo deu errado do nosso lado. Tente de novo em instantes.';

export async function runLive<T>(
  name: string,
  work: (ctx: LiveContext) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  const ctx = await liveContext({ create: true });
  if (!ctx.ok) return ctx;
  try {
    return await work(ctx.value);
  } catch (err) {
    logger.error('action.error', { action: name, error: err });
    return fail('UNAVAILABLE', FAILED);
  }
}
