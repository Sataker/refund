import 'server-only';
import { type EnvProblem, type ParsedEnv, readEnv } from './env.ts';
import { type ActionResult, fail, ok } from './result.ts';

// ARCHITECTURE §4.10. Derived from env only; the Pluggy probe (ADR-012) is applied on top of
// `pluggy` by financial/availability.ts (`pluggyAvailable`, 10-min cache).

export interface Capabilities {
  /** DATABASE_URL && SESSION_SECRET && ENCRYPTION_KEY && PII_PEPPER. */
  database: boolean;
  /** No DATABASE_URL and NODE_ENV !== 'production' → PGlite (dev/test). */
  memoryDatabase: boolean;
  /** DATA_MODE === 'live'. */
  liveData: boolean;
  /** AI_GATEWAY_API_KEY || VERCEL_OIDC_TOKEN. */
  ai: boolean;
  /** PLUGGY_CLIENT_ID && PLUGGY_CLIENT_SECRET && liveData (+ probe: `pluggyAvailable`). */
  pluggy: boolean;
  /** RESEND_API_KEY && RESEND_FROM && NEXT_PUBLIC_SITE_URL (the e-mailed link needs a fixed origin). */
  email: boolean;
  /** ABACATEPAY_API_KEY && ABACATEPAY_WEBHOOK_SECRET. */
  payments: boolean;
  /** FIRECRAWL_WEBHOOK_SECRET. */
  lawMonitor: boolean;
  /** WORKOS_CLIENT_ID && WORKOS_COOKIE_PASSWORD && NEXT_PUBLIC_WORKOS_REDIRECT_URI. */
  login: boolean;
  /** CRON_SECRET. */
  cron: boolean;
}

export function capabilitiesFrom({ values: e, present }: ParsedEnv): Capabilities {
  const liveData = e.DATA_MODE === 'live';
  return {
    database: Boolean(e.DATABASE_URL && e.SESSION_SECRET && e.ENCRYPTION_KEY && e.PII_PEPPER),
    // A DATABASE_URL that failed validation still counts as "configured": never fall back to
    // PGlite silently when someone meant a real database.
    memoryDatabase: !present.has('DATABASE_URL') && e.NODE_ENV !== 'production',
    liveData,
    ai: Boolean(e.AI_GATEWAY_API_KEY || e.VERCEL_OIDC_TOKEN),
    pluggy: Boolean(e.PLUGGY_CLIENT_ID && e.PLUGGY_CLIENT_SECRET && liveData),
    // Code review E14, L2: never build an e-mailed link from the request's Host header.
    email: Boolean(e.RESEND_API_KEY && e.RESEND_FROM && e.NEXT_PUBLIC_SITE_URL),
    payments: Boolean(e.ABACATEPAY_API_KEY && e.ABACATEPAY_WEBHOOK_SECRET),
    lawMonitor: Boolean(e.FIRECRAWL_WEBHOOK_SECRET),
    login: Boolean(
      e.WORKOS_CLIENT_ID && e.WORKOS_COOKIE_PASSWORD && e.NEXT_PUBLIC_WORKOS_REDIRECT_URI,
    ),
    cron: Boolean(e.CRON_SECRET),
  };
}

/** Recomputed on each call from `process.env` (a dozen string checks; nothing worth caching). */
export function capabilities(): Capabilities {
  return capabilitiesFrom(readEnv());
}

/** Malformed variables, for health (`degraded`). Names and reasons only, never values. */
export function envProblems(): EnvProblem[] {
  return readEnv().problems;
}

const OFF_MESSAGE: Record<keyof Capabilities, string> = {
  database: 'O modo ao vivo não está ativo neste deploy. Veja a demo.',
  memoryDatabase: 'O modo ao vivo não está ativo neste deploy. Veja a demo.',
  liveData: 'Os dados ao vivo não estão ativos neste deploy.',
  ai: 'A explicação por IA não está ativa neste deploy.',
  pluggy: 'A conexão com banco real não está ativa agora. Use os dados de exemplo.',
  email: 'O envio de e-mail não está ativo neste deploy. Copie o link e envie você mesmo.',
  payments: 'O pagamento por Pix não está ativo neste deploy.',
  lawMonitor: 'O monitor de leis não está ativo neste deploy.',
  login: 'O login não está ativo neste deploy.',
  cron: 'Rotina não configurada.',
};

/** `database` is satisfied by PGlite outside production too (`/app` needs either one). */
export function requireCapability(
  c: keyof Capabilities,
  caps: Capabilities = capabilities(),
): ActionResult<void> {
  const on = c === 'database' ? caps.database || caps.memoryDatabase : caps[c];
  return on ? ok(undefined) : fail('NOT_CONFIGURED', OFF_MESSAGE[c]);
}
