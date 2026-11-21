'use server';

import { runLive } from '@/server/action.ts';
import { type FunnelWhere, offerClickedWith } from '@/server/funnel.ts';
import type { ActionResult } from '@/server/result.ts';

// D58 funnel: the ROI card's CTA records where it was clicked. getSession → requireCapability (runLive) → rateLimit
// → zod inside the core. Never blocks the navigation that follows: the caller fires it and moves on.

export async function offerClicked(input: { where: FunnelWhere }): Promise<ActionResult<void>> {
  return runLive('offerClicked', (ctx) =>
    offerClickedWith(input, { db: ctx.db, userId: ctx.userId }),
  );
}
