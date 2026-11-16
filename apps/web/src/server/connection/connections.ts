import 'server-only';
import { type Db, schema } from '@refund/db';
import heroPersona from '@refund/personas/data/dev-exportador.json' with { type: 'json' };
import {
  type CivilDate,
  type FinancialProvider,
  type PersonaDataset,
  PersonaFinancial,
  type SourceItem,
} from '@refund/sources';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { z } from 'zod';
import { type ConnectionStatus, nextAfter, stepPath } from '@/features/track/steps.ts';
import type { Capabilities } from '../capabilities.ts';
import { todayBrt } from '../company/profile.ts';
import { decrypt, encrypt, hmac, type Secrets } from '../crypto.ts';
import { markPluggyDown, pluggyAvailable, pluggyProvider } from '../financial/availability.ts';
import { logger } from '../log.ts';
import { clientIp, rateLimit } from '../rate-limit.ts';
import { type ActionResult, fail, ok } from '../result.ts';
import {
  hasActiveConsent,
  insertConsent,
  loadTrack,
  trackCompany,
  transactionCount,
} from '../track/state.ts';
import { syncConnection } from './sync.ts';

// Consent and connection actions (ARCHITECTURE §4.7, §2.4; IDENTITY-AND-UI Screens 2–3; ADR-012).
// Everything after getSession/requireCapability: rate limit → (entitlement) → zod → work.

const { connections, accounts } = schema;

export interface ConnectionDeps {
  db: Db;
  userId: string;
  secrets: Secrets;
  caps: Capabilities;
  headers: Headers;
  /** Injectable in tests (replay/fake Pluggy); defaults to the process client when configured. */
  pluggy?: FinancialProvider | null;
  nowMs?: number;
}

/** Version of the consent text on Screen 2 (stored in `consents.terms_version`). */
export const TERMS_VERSION = '2026-11-16';
export const CONSENT_SCOPES = ['accounts', 'transactions', 'identity', 'public_cnpj'] as const;
/** ARCHITECTURE §9.4: createConnectToken 10/h per session (registering and the sample share it). */
export const CONNECT_RATE = { limit: 10, windowMs: 60 * 60_000 } as const;

const CONSENT_FIRST = 'Antes de conectar, confirme o que vamos ler na tela anterior.';
const NOT_YOURS = 'Essa conexão não é desta sessão.';
const holderSchema = z.enum(['PF', 'PJ']);

export const consentInput = z.object({
  scopes: z.array(z.enum(CONSENT_SCOPES)).min(1).max(CONSENT_SCOPES.length),
  termsVersion: z.literal(TERMS_VERSION),
});

export async function recordConsentWith(
  input: unknown,
  deps: ConnectionDeps,
): Promise<ActionResult<{ consentId: string; next: string }>> {
  const parsed = consentInput.safeParse(input);
  if (!parsed.success) return fail('INVALID_INPUT', 'Não conseguimos registrar o consentimento.');
  const consentId = await insertConsent(deps.db, {
    userId: deps.userId,
    scopes: [...new Set(parsed.data.scopes)],
    termsVersion: parsed.data.termsVersion,
    ipHash: hmac(clientIp(deps.headers), deps.secrets.pepper),
  });
  logger.info('consent.recorded', { termsVersion: parsed.data.termsVersion });
  const { progress } = await loadTrack(deps.db, deps.userId);
  return ok({ consentId, next: stepPath(nextAfter('permissoes', progress)) });
}

async function connectGuard(deps: ConnectionDeps): Promise<ActionResult<void>> {
  const limited = await rateLimit(
    { key: `connect:u:${deps.userId}`, ...CONNECT_RATE },
    deps.db,
    deps.nowMs,
  );
  if (!limited.ok) return limited;
  if (!(await hasActiveConsent(deps.db, deps.userId))) {
    return fail('CONSENT_REQUIRED', CONSENT_FIRST);
  }
  return ok(undefined);
}

type ConnectionRow = typeof connections.$inferSelect;

async function activeOf(db: Db, userId: string, holder: 'PF' | 'PJ'): Promise<ConnectionRow[]> {
  return db
    .select()
    .from(connections)
    .where(
      and(
        eq(connections.userId, userId),
        eq(connections.holder, holder),
        isNull(connections.revokedAt),
      ),
    );
}

/** Retires the holder's unfinished attempts so the new connection is the one the track reads. */
async function retireUnfinished(db: Db, userId: string, holder: 'PF' | 'PJ'): Promise<void> {
  await db
    .update(connections)
    .set({ status: 'revoked', revokedAt: new Date() })
    .where(
      and(
        eq(connections.userId, userId),
        eq(connections.holder, holder),
        isNull(connections.revokedAt),
        ne(connections.status, 'active'),
      ),
    );
}

// ---------- Fallback A11: the synthetic persona takes over (ADR-012) ----------

export const SAMPLE_DATA = heroPersona as unknown as PersonaDataset & {
  period: { from: CivilDate; to: CivilDate };
};

export const sampleInput = z.object({ holder: holderSchema });

/**
 * "Usar dados de exemplo": connects the hero persona's synthetic account for this holder, through the
 * same sync as a real connection (provider `persona`, sandbox seal on screen).
 */
export async function connectSampleWith(
  input: unknown,
  deps: ConnectionDeps,
): Promise<ActionResult<ConnectionView>> {
  const guard = await connectGuard(deps);
  if (!guard.ok) return guard;
  const parsed = sampleInput.safeParse(input);
  if (!parsed.success) return fail('INVALID_INPUT', 'Escolha a conta da empresa ou a pessoal.');
  const { holder } = parsed.data;
  const existing = (await activeOf(deps.db, deps.userId, holder)).find(
    (c) => c.status === 'active',
  );
  if (existing) return ok(await statusOf(deps.db, existing));

  const item = SAMPLE_DATA.items.find((i) => i.holder === holder);
  if (!item) return fail('NOT_FOUND', 'Não há dados de exemplo para essa conta.');
  await retireUnfinished(deps.db, deps.userId, holder);
  const company = holder === 'PJ' ? await trackCompany(deps.db, deps.userId) : null;
  const [row] = await deps.db
    .insert(connections)
    .values({
      userId: deps.userId,
      companyId: company?.id ?? null,
      provider: 'persona',
      holder,
      connectorName: item.item.connector.name.slice(0, 120),
      connectorSandbox: 1,
      status: 'syncing',
    })
    .returning();
  if (!row) throw new Error('connectSample: no row returned');
  const synced = await syncConnection(
    { id: row.id, itemId: item.item.sourceId, holder },
    {
      db: deps.db,
      provider: new PersonaFinancial(SAMPLE_DATA),
      pepper: deps.secrets.pepper,
      period: SAMPLE_DATA.period,
    },
  );
  if (!synced.ok) {
    return fail('UNAVAILABLE', 'Não conseguimos carregar os dados de exemplo. Tente de novo.');
  }
  logger.info('connection.sample', { holder });
  return ok(await statusOf(deps.db, { ...row, status: 'active' }));
}

export interface ConnectionView {
  connectionId: string;
  status: ConnectionStatus;
  transactions: number;
  connectorName: string | null;
}

async function statusOf(
  db: Db,
  row: Pick<ConnectionRow, 'id' | 'status' | 'connectorName'>,
): Promise<ConnectionView> {
  return {
    connectionId: row.id,
    status: row.status as ConnectionStatus,
    transactions: await transactionCount(db, row.id),
    connectorName: row.connectorName,
  };
}

// ---------- Pluggy (live; ARCHITECTURE §2.4) ----------

export const connectTokenInput = z.object({ holder: holderSchema });

const PLUGGY_OFF =
  'A conexão com banco real não está disponível agora. Use os dados de exemplo para seguir.';

async function availablePluggy(deps: ConnectionDeps): Promise<FinancialProvider | null> {
  if (deps.pluggy !== undefined) return deps.pluggy;
  return (await pluggyAvailable(deps.caps, deps.secrets, deps.nowMs))
    ? pluggyProvider(deps.caps, deps.secrets)
    : null;
}

function configuredPluggy(deps: ConnectionDeps): FinancialProvider | null {
  return deps.pluggy !== undefined ? deps.pluggy : pluggyProvider(deps.caps, deps.secrets);
}

export async function createConnectTokenWith(
  input: unknown,
  deps: ConnectionDeps,
): Promise<
  ActionResult<{ connectToken: string; includeSandbox: boolean; connectorTypes: string[] }>
> {
  const provider = await availablePluggy(deps);
  if (!provider?.createConnectToken) return fail('NOT_CONFIGURED', PLUGGY_OFF);
  const guard = await connectGuard(deps);
  if (!guard.ok) return guard;
  const parsed = connectTokenInput.safeParse(input);
  if (!parsed.success) return fail('INVALID_INPUT', 'Escolha a conta da empresa ou a pessoal.');
  const { holder } = parsed.data;
  // §8.2 `free`: one PF + one PJ connection (the plan catalog arrives in E14).
  if ((await activeOf(deps.db, deps.userId, holder)).some((c) => c.status === 'active')) {
    return fail(
      'PLAN_LIMIT',
      `Você já conectou a conta ${holder === 'PJ' ? 'da empresa' : 'pessoal'}.`,
      {
        upgrade: { resource: 'connections', suggestedPlan: 'business', url: '/app/plano' },
      },
    );
  }
  const token = await provider.createConnectToken(deps.userId, { mode: 'live' });
  if (!token.ok) {
    markPluggyDown(deps.nowMs);
    logger.warn('pluggy.connect_token_failed', { code: token.error.code });
    return fail('UNAVAILABLE', PLUGGY_OFF);
  }
  return ok({
    connectToken: token.value.accessToken,
    includeSandbox: true,
    connectorTypes: holder === 'PJ' ? ['BUSINESS_BANK'] : ['PERSONAL_BANK'],
  });
}

export const registerInput = z.object({
  itemId: z.uuid(),
  holder: holderSchema,
  companyCnpj: z.string().trim().max(32).optional(),
});

/** Registers the item the widget created; the item must carry this session's `clientUserId`. */
export async function registerPluggyItemWith(
  input: unknown,
  deps: ConnectionDeps,
): Promise<ActionResult<{ connectionId: string }>> {
  const provider = configuredPluggy(deps);
  if (!provider) return fail('NOT_CONFIGURED', PLUGGY_OFF);
  const guard = await connectGuard(deps);
  if (!guard.ok) return guard;
  const parsed = registerInput.safeParse(input);
  if (!parsed.success) return fail('INVALID_INPUT', 'Conexão inválida.');
  const { itemId, holder } = parsed.data;
  const item = await provider.getItem(itemId, { mode: 'live' });
  if (!item.ok) return fail('UNAVAILABLE', 'O banco não confirmou a conexão. Tente de novo.');
  if (item.value.clientUserId !== deps.userId) {
    logger.warn('pluggy.item_foreign', { holder });
    return fail('FORBIDDEN', NOT_YOURS);
  }
  const itemIdHash = hmac(itemId, deps.secrets.pepper);
  const [known] = await deps.db
    .select({ id: connections.id, userId: connections.userId })
    .from(connections)
    .where(eq(connections.itemIdHash, itemIdHash))
    .limit(1);
  if (known) {
    return known.userId === deps.userId
      ? ok({ connectionId: known.id })
      : fail('FORBIDDEN', NOT_YOURS);
  }
  const company = holder === 'PJ' ? await trackCompany(deps.db, deps.userId) : null;
  await retireUnfinished(deps.db, deps.userId, holder);
  const [row] = await deps.db
    .insert(connections)
    .values({
      userId: deps.userId,
      companyId: company?.id ?? null,
      provider: 'pluggy',
      holder,
      itemIdEncrypted: encrypt(itemId, deps.secrets.encryption),
      itemIdHash,
      connectorName: item.value.connector.name.slice(0, 120),
      connectorSandbox: item.value.connector.sandbox ? 1 : 0,
      status: 'syncing',
    })
    .onConflictDoNothing({ target: connections.itemIdHash })
    .returning({ id: connections.id });
  if (row) return ok({ connectionId: row.id });
  const [same] = await deps.db
    .select({ id: connections.id, userId: connections.userId })
    .from(connections)
    .where(eq(connections.itemIdHash, itemIdHash))
    .limit(1);
  return same?.userId === deps.userId
    ? ok({ connectionId: same.id })
    : fail('FORBIDDEN', NOT_YOURS);
}

export const connectionIdInput = z.object({ connectionId: z.uuid() });

async function ownConnection(deps: ConnectionDeps, input: unknown): Promise<ConnectionRow | null> {
  const parsed = connectionIdInput.safeParse(input);
  if (!parsed.success) return null;
  const [row] = await deps.db
    .select()
    .from(connections)
    .where(and(eq(connections.id, parsed.data.connectionId), eq(connections.userId, deps.userId)))
    .limit(1);
  return row ?? null;
}

function pluggyStatus(item: SourceItem): ConnectionStatus | 'sync' {
  if (item.status === 'UPDATED') return 'sync';
  if (item.status === 'LOGIN_ERROR' || item.status === 'OUTDATED') return 'error';
  return 'syncing';
}

/**
 * Refetches the item with our key (the webhook is only a signal, ARCHITECTURE §4.9) and syncs when it
 * is UPDATED. Shared by the webhook and by the 2 s polling (the fallback when the webhook is late).
 */
export async function refreshPluggyConnection(
  row: ConnectionRow,
  deps: Pick<ConnectionDeps, 'db' | 'secrets' | 'nowMs'> & { provider: FinancialProvider },
): Promise<ConnectionStatus> {
  if (row.provider !== 'pluggy' || !row.itemIdEncrypted) return row.status as ConnectionStatus;
  const itemId = decrypt(row.itemIdEncrypted, deps.secrets.encryption);
  if (!itemId) return row.status as ConnectionStatus;
  const item = await deps.provider.getItem(itemId, { mode: 'live' });
  if (!item.ok) return row.status as ConnectionStatus;
  const next = pluggyStatus(item.value);
  if (next === 'syncing') return 'syncing';
  if (next === 'error') {
    await deps.db
      .update(connections)
      .set({ status: 'error', errorCode: item.value.status.slice(0, 60) })
      .where(eq(connections.id, row.id));
    return 'error';
  }
  const now = deps.nowMs ?? Date.now();
  const synced = await syncConnection(
    { id: row.id, itemId, holder: row.holder },
    {
      db: deps.db,
      provider: deps.provider,
      pepper: deps.secrets.pepper,
      period: { from: todayBrt(now - 365 * 24 * 60 * 60_000), to: todayBrt(now) },
    },
  );
  return synced.ok ? 'active' : 'error';
}

export async function getConnectionStatusWith(
  input: unknown,
  deps: ConnectionDeps,
): Promise<ActionResult<{ status: ConnectionStatus; transactions: number }>> {
  const row = await ownConnection(deps, input);
  if (!row) return fail('NOT_FOUND', 'Conexão não encontrada.');
  let status = row.status as ConnectionStatus;
  if (status === 'syncing' && row.provider === 'pluggy') {
    const provider = configuredPluggy(deps);
    if (provider) status = await refreshPluggyConnection(row, { ...deps, provider });
  }
  return ok({ status, transactions: await transactionCount(deps.db, row.id) });
}

/**
 * Revokes: the item is deleted at Pluggy and the copied accounts and transactions are deleted here
 * (LGPD minimization, ARCHITECTURE §9.6). The connection row stays as `revoked` (audit of when).
 */
export async function revokeConnectionWith(
  input: unknown,
  deps: ConnectionDeps,
): Promise<ActionResult<void>> {
  const row = await ownConnection(deps, input);
  if (!row) return fail('NOT_FOUND', 'Conexão não encontrada.');
  if (row.provider === 'pluggy' && row.itemIdEncrypted) {
    const itemId = decrypt(row.itemIdEncrypted, deps.secrets.encryption);
    const provider = configuredPluggy(deps);
    if (itemId && provider?.revokeItem) {
      const r = await provider.revokeItem(itemId, { mode: 'live' });
      if (!r.ok) logger.warn('pluggy.revoke_failed', { code: r.error.code });
    }
  }
  await deps.db.transaction(async (tx) => {
    await tx.delete(accounts).where(eq(accounts.connectionId, row.id));
    await tx
      .update(connections)
      .set({ status: 'revoked', revokedAt: new Date(), itemIdEncrypted: null })
      .where(eq(connections.id, row.id));
  });
  logger.info('connection.revoked', { provider: row.provider, holder: row.holder });
  return ok(undefined);
}
