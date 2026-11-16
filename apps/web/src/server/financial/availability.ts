import 'server-only';
import type { Capabilities } from '../capabilities.ts';
import type { Secrets } from '../crypto.ts';
import { readEnv } from '../env.ts';
import { logger } from '../log.ts';
import { PluggyFinancial } from './pluggy.ts';

// ADR-012 / A11: `pluggy` = variables present AND the probe ok, cached 10 min. When it is off, the
// "Conectar banco real" button disappears and the synthetic persona takes over; never an error screen.

const PROBE_TTL_MS = 10 * 60_000;

type GlobalWithPluggy = typeof globalThis & {
  __refundPluggy?: { provider: PluggyFinancial; key: string } | undefined;
  __refundPluggyProbe?: { ok: boolean; at: number } | undefined;
};
const g = globalThis as GlobalWithPluggy;

/** The process Pluggy client when the env capability is on (one per process: it caches the key). */
export function pluggyProvider(caps: Capabilities, secrets: Secrets): PluggyFinancial | null {
  const e = readEnv().values;
  if (!caps.pluggy || !e.PLUGGY_CLIENT_ID || !e.PLUGGY_CLIENT_SECRET) return null;
  const key = e.PLUGGY_CLIENT_ID;
  if (g.__refundPluggy?.key !== key) {
    g.__refundPluggy = {
      key,
      provider: new PluggyFinancial({
        clientId: e.PLUGGY_CLIENT_ID,
        clientSecret: e.PLUGGY_CLIENT_SECRET,
        pepper: secrets.pepper,
      }),
    };
  }
  return g.__refundPluggy.provider;
}

/** Env capability + cached probe. Any failure turns it off for 10 minutes. */
export async function pluggyAvailable(
  caps: Capabilities,
  secrets: Secrets,
  nowMs: number = Date.now(),
): Promise<boolean> {
  const provider = pluggyProvider(caps, secrets);
  if (!provider) return false;
  const cached = g.__refundPluggyProbe;
  if (cached && nowMs - cached.at < PROBE_TTL_MS) return cached.ok;
  const r = await provider.probe({ mode: 'live', signal: AbortSignal.timeout(4_000) });
  const ok = r.ok && r.value.sandboxAvailable;
  if (!ok) logger.warn('pluggy.probe_failed', { code: r.ok ? 'NO_SANDBOX' : r.error.code });
  g.__refundPluggyProbe = { ok, at: nowMs };
  return ok;
}

/** An error in createConnectToken also counts as a failed probe (ARCHITECTURE §12). */
export function markPluggyDown(nowMs: number = Date.now()): void {
  g.__refundPluggyProbe = { ok: false, at: nowMs };
}

/** Tests only. */
export function resetPluggyProbe(): void {
  g.__refundPluggyProbe = undefined;
  g.__refundPluggy = undefined;
}
