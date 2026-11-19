import 'server-only';
import type { Db } from '@refund/db';
import {
  type ApplicableRule,
  estimateByProfile,
  type ProfileAnswers,
  type ProfileEstimate,
} from '@refund/engine';
import {
  type CnpjProvider,
  type DataMode,
  type ProviderError,
  type PublicCompany,
  validateCnpj,
} from '@refund/sources';
import { z } from 'zod';
import type { Secrets } from '../crypto.ts';
import { logger } from '../log.ts';
import { ipKey, rateLimit } from '../rate-limit.ts';
import { type ActionResult, fail, ok } from '../result.ts';
import { trackLimit } from '../track/limits.ts';
import { linkCompany, trackCompany } from '../track/state.ts';
import {
  DONT_KNOW_ANSWERS,
  type ProfileQuestions,
  profileQuestions,
  todayBrt,
  toPublicProfile,
} from './profile.ts';
import { cnpjProvider } from './providers.ts';

// ARCHITECTURE §4.7 `lookupCnpj` and `estimateByRevenue` (live). The web calculates nothing: the rules,
// the questions and the range all come from the engine's estimateByProfile (ENGINE-SPEC C.11).

/**
 * 07 §3.5 `cnpj_estimate` (ARCHITECTURE §9.4), adjusted in the E11 code review (M4): 5 per day per
 * session + IP (visitors may share the venue's NAT at the final), plus a coarse 50 per day per IP so
 * rotating anonymous sessions cannot scrape the public APIs. Live data only; replay lookups never
 * leave the process and are bounded by the per-session track limit.
 */
export const CNPJ_RATE = { limit: 5, windowMs: 24 * 60 * 60_000 } as const;
export const CNPJ_IP_RATE = { limit: 50, windowMs: 24 * 60 * 60_000 } as const;

export interface CompanyDeps {
  db: Db;
  secrets: Secrets;
  headers: Headers;
  dataMode: DataMode;
  /** Injectable in tests; defaults to the chain of ARCHITECTURE §4.3 for `dataMode`. */
  provider?: CnpjProvider;
  nowMs?: number;
}

export interface LookupResult {
  company: PublicCompany;
  applicableRules: ApplicableRule[];
  questions: ProfileQuestions;
}

export const lookupInput = z.object({
  cnpj: z.string().trim().min(1).max(32),
  // /demo computes its estimate at build time and never calls a server action (ARCHITECTURE §4.7).
  context: z.literal('live'),
});

const answersSchema = z.object({
  monthlyRevenueBracket: z.enum([
    'up_to_15k',
    'from_15k_to_30k',
    'from_30k_to_60k',
    'from_60k_to_150k',
    'from_150k_to_300k',
    'from_300k_to_400k',
    'above_400k',
    'dont_know',
  ]),
  hasEmployees: z.enum(['yes', 'no', 'dont_know']),
  receivesFromAbroad: z.enum(['no', 'less_than_half', 'half_or_more', 'dont_know']),
}) satisfies z.ZodType<ProfileAnswers>;

export const estimateInput = z.object({
  cnpj: z.string().trim().min(1).max(32),
  answers: answersSchema,
  context: z.literal('live'),
});

const MESSAGES = {
  invalid: 'Esse CNPJ não confere. Confere os números?',
  notFound: 'Não achamos esse CNPJ na Receita. Confere os números?',
  unavailable:
    'Os dados públicos da Receita estão fora do ar agora. Tente em instantes ou veja a demo.',
  notLinked: 'Comece pelo CNPJ da sua empresa.',
} as const;

function providerFailure(error: ProviderError) {
  if (error.code === 'NOT_FOUND' || error.code === 'FIXTURE_MISSING') {
    return fail('NOT_FOUND', MESSAGES.notFound);
  }
  if (error.code === 'INVALID') return fail('INVALID_INPUT', MESSAGES.invalid);
  return fail('UNAVAILABLE', MESSAGES.unavailable, {
    ...(error.retryInMs ? { detail: { retryAfterMs: error.retryInMs } } : {}),
  });
}

/** Applicable rules with the reason and the `§` = estimateByProfile with every answer at `dont_know`. */
export function applicableRulesOf(company: PublicCompany, nowMs?: number): ApplicableRule[] {
  const r = estimateByProfile(toPublicProfile(company), DONT_KNOW_ANSWERS, {
    analysisDate: todayBrt(nowMs),
  });
  return r.ok ? r.value.rules : [];
}

/**
 * Steps after getSession/requireCapability: zod → check digits → limits → provider → save. The CNPJ
 * limit counts only a well-formed CNPJ (a typo does not spend the user's daily lookups).
 */
export async function lookupCnpjWith(
  userId: string,
  input: unknown,
  deps: CompanyDeps,
): Promise<ActionResult<LookupResult>> {
  const parsed = lookupInput.safeParse(input);
  if (!parsed.success) return fail('INVALID_INPUT', MESSAGES.invalid);
  const cnpj = validateCnpj(parsed.data.cnpj);
  if (!cnpj.ok) return fail('INVALID_INPUT', MESSAGES.invalid);
  const session = await trackLimit(deps.db, userId, deps.nowMs);
  if (!session.ok) return session;
  if (deps.dataMode === 'live') {
    const ip = ipKey('cnpj', deps.headers, deps.secrets.pepper);
    for (const rule of [
      { key: `${ip}:u:${userId}`, ...CNPJ_RATE },
      { key: ip, ...CNPJ_IP_RATE },
    ]) {
      const limited = await rateLimit(rule, deps.db, deps.nowMs);
      if (!limited.ok) return limited;
    }
  }

  const provider = deps.provider ?? cnpjProvider(deps.db, deps.dataMode);
  const found = await provider.lookup(cnpj.value, {
    mode: deps.dataMode,
    log: (event, data) => logger.info(event, data),
  });
  if (!found.ok) {
    logger.info('company.lookup_failed', { code: found.error.code, source: found.error.source });
    return providerFailure(found.error);
  }
  const company = found.value;
  await linkCompany(deps.db, userId, company);
  logger.info('company.looked_up', { source: company.source, masked: company.masked });
  return ok({
    company,
    applicableRules: applicableRulesOf(company, deps.nowMs),
    questions: profileQuestions(company),
  });
}

/**
 * estimateByProfile with `analysisDate` = today in BRT (ARCHITECTURE §4.7). Only for the company of the
 * caller's own track: the CNPJ must have been looked up in this session (no free-form scraping).
 */
export async function estimateByRevenueWith(
  userId: string,
  input: unknown,
  deps: Pick<CompanyDeps, 'db' | 'nowMs'>,
): Promise<ActionResult<ProfileEstimate>> {
  const limited = await trackLimit(deps.db, userId, deps.nowMs);
  if (!limited.ok) return limited;
  const parsed = estimateInput.safeParse(input);
  if (!parsed.success) return fail('INVALID_INPUT', 'Responda as perguntas para ver a estimativa.');
  const cnpj = validateCnpj(parsed.data.cnpj);
  const linked = await trackCompany(deps.db, userId);
  if (!cnpj.ok || !linked || linked.company.cnpj !== cnpj.value) {
    return fail('FORBIDDEN', MESSAGES.notLinked);
  }
  return estimateFor(linked.company, parsed.data.answers, deps.nowMs);
}

export function estimateFor(
  company: PublicCompany,
  answers: ProfileAnswers,
  nowMs?: number,
): ActionResult<ProfileEstimate> {
  const r = estimateByProfile(toPublicProfile(company), answers, {
    analysisDate: todayBrt(nowMs),
  });
  if (!r.ok) {
    logger.error('company.estimate_failed', { code: r.error.code });
    return fail('UNAVAILABLE', 'Não conseguimos calcular a estimativa agora. Tente de novo.');
  }
  return ok(r.value);
}
