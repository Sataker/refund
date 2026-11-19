import 'server-only';
import { z } from 'zod';

// INFRA-CI §1; ARCHITECTURE §4.10. Every variable is optional: a missing one turns its capability off,
// a malformed one too, and health shows the reason (never the value). The build never reads them.

const secret32 = z.string().min(32, 'precisa de pelo menos 32 caracteres');
const key32 = z.string().refine((v) => {
  const bytes = Buffer.from(v, 'base64');
  return (
    bytes.length === 32 && bytes.toString('base64').replace(/=+$/, '') === v.replace(/=+$/, '')
  );
}, 'precisa ser base64 de exatamente 32 bytes');
const text = z.string().min(1);
const url = z.url();

const fields = {
  NODE_ENV: z.enum(['development', 'production', 'test']),
  DATA_MODE: z.enum(['live', 'replay']),
  NEXT_PUBLIC_SITE_URL: url,
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'precisa começar com postgres://'),
  DB_SSL: z.literal('disable'),
  SESSION_SECRET: secret32,
  ENCRYPTION_KEY: key32,
  PII_PEPPER: secret32,
  AI_GATEWAY_API_KEY: text,
  VERCEL_OIDC_TOKEN: text,
  PLUGGY_CLIENT_ID: text,
  PLUGGY_CLIENT_SECRET: text,
  PLUGGY_WEBHOOK_SECRET: text,
  RESEND_API_KEY: text,
  RESEND_FROM: text,
  RESEND_WEBHOOK_SECRET: text,
  ABACATEPAY_API_KEY: text,
  ABACATEPAY_WEBHOOK_SECRET: text,
  /** Only honoured with a Test Mode key (`abc_dev_…`): the local fake AbacatePay of the e2e tests. */
  ABACATEPAY_API_BASE_URL: url,
  /** The hidden R$ 1,00 offer's code (`/app/plano?oferta=validacao&codigo=…`). Absent: the offer is off. */
  VALIDATION_OFFER_CODE: z.string().min(12, 'precisa de pelo menos 12 caracteres'),
  FIRECRAWL_WEBHOOK_SECRET: text,
  WORKOS_CLIENT_ID: text,
  WORKOS_API_KEY: text,
  WORKOS_COOKIE_PASSWORD: secret32,
  NEXT_PUBLIC_WORKOS_REDIRECT_URI: url,
  ADMIN_EMAILS: text,
  CRON_SECRET: text,
  VERCEL_ENV: z.enum(['production', 'preview', 'development']),
  VERCEL_GIT_COMMIT_SHA: text,
} satisfies Record<string, z.ZodType<string>>;

export type EnvName = keyof typeof fields;
export type Env = { readonly [K in EnvName]?: z.infer<(typeof fields)[K]> };

export interface EnvProblem {
  name: EnvName;
  /** PT-BR, safe to show: never contains the value. */
  reason: string;
}

export interface ParsedEnv {
  values: Env;
  problems: EnvProblem[];
  /** Variables that were set (valid or not). */
  present: ReadonlySet<EnvName>;
}

/** Validates each variable on its own, so one bad value does not take the others down. */
export function parseEnv(source: Readonly<Record<string, string | undefined>>): ParsedEnv {
  const values: Record<string, string> = {};
  const problems: EnvProblem[] = [];
  const present = new Set<EnvName>();
  for (const name of Object.keys(fields) as EnvName[]) {
    const raw = source[name];
    if (raw === undefined || raw.trim() === '') continue;
    present.add(name);
    const parsed = fields[name].safeParse(raw.trim());
    if (parsed.success) values[name] = parsed.data;
    else problems.push({ name, reason: parsed.error.issues[0]?.message ?? 'valor inválido' });
  }
  return { values: values as Env, problems, present };
}

/** Reads `process.env` now (cheap; nothing is cached, so a test can stub and re-read). */
export function readEnv(): ParsedEnv {
  return parseEnv(process.env);
}
