'use server';

import type { ProfileEstimate } from '@refund/engine';
import type { ConnectionStatus } from '@/features/track/steps.ts';
import {
  estimateByRevenueWith,
  type LookupResult,
  lookupCnpjWith,
} from '@/server/company/lookup.ts';
import {
  type ConnectionView,
  connectSampleWith,
  createConnectTokenWith,
  getConnectionStatusWith,
  recordConsentWith,
  registerPluggyItemWith,
  revokeConnectionWith,
} from '@/server/connection/connections.ts';
import { type LiveContext, liveContext } from '@/server/live.ts';
import { logger } from '@/server/log.ts';
import type { ActionResult } from '@/server/result.ts';
import { fail } from '@/server/result.ts';
import {
  confirmCompanyWith,
  markEstimateSeenWith,
  type Next,
  rejectCompanyWith,
  saveAnswerWith,
  skipPersonalAccountWith,
} from '@/server/track/answers.ts';
import { loadTrack } from '@/server/track/state.ts';

// ARCHITECTURE §4.7 (live): getSession → requireCapability (liveContext) → rateLimit → (entitlement)
// → zod, inside each core. Results only: nothing here throws to the client.

const FAILED = 'Algo deu errado do nosso lado. Tente de novo em instantes.';

async function run<T>(
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

const OUT_OF_SCOPE = 'Por enquanto o Refund calcula só empresas do Simples Nacional.';

/** H3: consent and the bank steps only for a company in scope (Simples or MEI). */
async function inScope<T>(
  ctx: LiveContext,
  work: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  const { progress } = await loadTrack(ctx.db, ctx.userId);
  if (progress.company?.outOfScope) return fail('FORBIDDEN', OUT_OF_SCOPE);
  return work();
}

const deps = (ctx: LiveContext) => ({
  db: ctx.db,
  userId: ctx.userId,
  secrets: ctx.secrets,
  caps: ctx.caps,
  headers: ctx.headers,
});

// ---- company ----

export async function lookupCnpj(input: {
  cnpj: string;
  context: 'live';
}): Promise<ActionResult<LookupResult & Next>> {
  return run('lookupCnpj', async (ctx) => {
    const r = await lookupCnpjWith(ctx.userId, input, { ...ctx });
    return r.ok ? { ok: true, value: { ...r.value, next: '/app/comecar/confirmar-empresa' } } : r;
  });
}

export async function estimateByRevenue(input: unknown): Promise<ActionResult<ProfileEstimate>> {
  return run('estimateByRevenue', (ctx) => estimateByRevenueWith(ctx.userId, input, ctx));
}

// ---- track ----

export async function saveTrackAnswer(input: {
  step: 'faturamento' | 'funcionarios' | 'exterior';
  value: string;
}): Promise<ActionResult<Next>> {
  return run('saveTrackAnswer', (ctx) => saveAnswerWith(ctx.db, ctx.userId, input));
}

/** Bound per step in the page (`answerStep.bind(null, 'faturamento')`): the chip passes the value. */
export async function answerStep(
  step: 'faturamento' | 'funcionarios' | 'exterior',
  value: string,
): Promise<ActionResult<Next>> {
  return saveTrackAnswer({ step, value });
}

export async function confirmCompany(): Promise<ActionResult<Next>> {
  return run('confirmCompany', (ctx) => confirmCompanyWith(ctx.db, ctx.userId));
}

export async function rejectCompany(): Promise<ActionResult<Next>> {
  return run('rejectCompany', (ctx) => rejectCompanyWith(ctx.db, ctx.userId));
}

export async function markEstimateSeen(): Promise<ActionResult<Next>> {
  return run('markEstimateSeen', (ctx) => markEstimateSeenWith(ctx.db, ctx.userId));
}

export async function skipPersonalAccount(): Promise<ActionResult<Next>> {
  return run('skipPersonalAccount', (ctx) => skipPersonalAccountWith(ctx.db, ctx.userId));
}

// ---- consent and connection ----

export async function recordConsent(input: {
  scopes: string[];
  termsVersion: string;
}): Promise<ActionResult<{ consentId: string } & Next>> {
  return run('recordConsent', (ctx) => inScope(ctx, () => recordConsentWith(input, deps(ctx))));
}

export async function connectSampleData(input: {
  holder: 'PF' | 'PJ';
}): Promise<ActionResult<ConnectionView>> {
  return run('connectSampleData', (ctx) => inScope(ctx, () => connectSampleWith(input, deps(ctx))));
}

export async function createConnectToken(input: { holder: 'PF' | 'PJ' }): Promise<
  ActionResult<{
    connectToken: string;
    includeSandbox: boolean;
    connectorTypes: string[];
    connectorIds: number[];
  }>
> {
  return run('createConnectToken', (ctx) =>
    inScope(ctx, () => createConnectTokenWith(input, deps(ctx))),
  );
}

export async function registerPluggyItem(input: {
  itemId: string;
  holder: 'PF' | 'PJ';
  companyCnpj?: string;
}): Promise<ActionResult<{ connectionId: string }>> {
  return run('registerPluggyItem', (ctx) =>
    inScope(ctx, () => registerPluggyItemWith(input, deps(ctx))),
  );
}

export async function getConnectionStatus(input: {
  connectionId: string;
}): Promise<ActionResult<{ status: ConnectionStatus; transactions: number }>> {
  return run('getConnectionStatus', (ctx) => getConnectionStatusWith(input, deps(ctx)));
}

export async function revokeConnection(input: {
  connectionId: string;
}): Promise<ActionResult<void>> {
  return run('revokeConnection', (ctx) => revokeConnectionWith(input, deps(ctx)));
}
