import 'server-only';
import {
  type Db,
  decideReportRow,
  findOwnedAnalysis,
  findOwnedReport,
  findReportByTokenHash,
  insertReport,
  listFindings,
  markReportSent,
  type ReportRow,
} from '@refund/db';
import { z } from 'zod';
import type { Capabilities } from '../capabilities.ts';
import { encrypt, hashEmail, randomToken, type Secrets, sha256Hex } from '../crypto.ts';
import { readEnv } from '../env.ts';
import { logger } from '../log.ts';
import { rateLimit } from '../rate-limit.ts';
import { type ActionResult, fail, ok } from '../result.ts';
import { type ReportEmail, sendReportEmail } from './email.ts';

// Report to the accountant (ARCHITECTURE §4.7 sendReport/decideReport; §9.4 limits; INFRA-CI §7: the e-mail goes only
// to the address the user typed). The token is shown once and only its sha256 is stored. Without the e-mail
// capability (D6: no verified Resend domain yet) the link is still created: "Copiar link" always works.

const DAY_MS = 24 * 60 * 60_000;
/** §9.4: 3 e-mails/day per user (only when one is actually sent; code review E14, L3). */
export const REPORT_USER_RATE = { limit: 3, windowMs: DAY_MS } as const;
/** Link-only reports (no e-mail): a looser cap, they cost nothing outside our database. */
export const REPORT_LINK_RATE = { limit: 20, windowMs: DAY_MS } as const;
/** Resend Free: 100/day; we keep 60 for reports. */
export const REPORT_GLOBAL_RATE = { limit: 60, windowMs: DAY_MS } as const;
export const REPORT_TTL_DAYS = 30;

export interface ReportDeps {
  db: Db;
  userId: string;
  secrets: Secrets;
  caps: Capabilities;
  /** Origin for the link: NEXT_PUBLIC_SITE_URL, else the request's own origin. */
  origin: string;
  nowMs?: number;
  /** Injectable in tests. */
  send?: (email: ReportEmail) => Promise<{ ok: true; id: string } | { ok: false }>;
}

export const sendInput = z.object({
  analysisId: z.uuid(),
  accountantEmail: z.union([z.email().max(254), z.literal('')]).optional(),
  message: z.string().max(1000).optional(),
  include: z.object({ calculations: z.boolean(), laws: z.boolean(), transactions: z.boolean() }),
});

export interface SentReport {
  reportId: string;
  approvalLink: string;
  /** True only when the e-mail was handed to Resend. */
  emailed: boolean;
}

export function siteOrigin(headers: Headers): string {
  const configured = readEnv().values.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/+$/, '');
  const host = headers.get('x-forwarded-host') ?? headers.get('host') ?? 'localhost:3000';
  const proto =
    headers.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

export async function sendReportWith(
  input: unknown,
  deps: ReportDeps,
): Promise<ActionResult<SentReport>> {
  const { db, userId } = deps;
  const parsed = sendInput.safeParse(input);
  if (!parsed.success) return fail('INVALID_INPUT', 'Confira o e-mail do contador.');
  const analysis = await findOwnedAnalysis(db, userId, parsed.data.analysisId);
  if (!analysis) return fail('NOT_FOUND', 'Análise não encontrada.');
  if (analysis.status !== 'completed' && analysis.status !== 'awaiting_confirmation')
    return fail('FORBIDDEN', 'O relatório fica pronto quando a análise termina.');
  const email = parsed.data.accountantEmail?.trim().toLowerCase() ?? '';
  const wantsEmail = email !== '' && deps.caps.email;
  const mine = wantsEmail
    ? await rateLimit({ key: `report:u:${userId}`, ...REPORT_USER_RATE }, db, deps.nowMs)
    : await rateLimit({ key: `report-link:u:${userId}`, ...REPORT_LINK_RATE }, db, deps.nowMs);
  if (!mine.ok) return mine;
  if (wantsEmail) {
    const global = await rateLimit({ key: 'report:global', ...REPORT_GLOBAL_RATE }, db, deps.nowMs);
    if (!global.ok) return global;
  }
  const token = randomToken(32);
  const row = await insertReport(db, {
    analysisId: analysis.id,
    tokenHash: sha256Hex(token),
    // The typed address is kept only encrypted (and as an HMAC), never in clear (ARCHITECTURE §9.3).
    accountantEmailEncrypted: email === '' ? '' : encrypt(email, deps.secrets.encryption),
    accountantEmailHash: email === '' ? '' : hashEmail(email, deps.secrets.pepper),
    message: parsed.data.message?.trim() || null,
    include: parsed.data.include,
    expiresAt: new Date((deps.nowMs ?? Date.now()) + REPORT_TTL_DAYS * DAY_MS),
  });
  const approvalLink = `${deps.origin}/r/${token}`;
  let emailed = false;
  if (wantsEmail) {
    const findings = await listFindings(db, analysis.id);
    const send = deps.send ?? sendReportEmail;
    const r = await send({
      to: email,
      link: approvalLink,
      findings: findings.length,
    });
    if (r.ok) {
      emailed = true;
      await markReportSent(db, row.id, r.id);
    } else logger.warn('report.email_failed', {});
  }
  logger.info('report.created', { emailed });
  return ok({ reportId: row.id, approvalLink, emailed });
}

export const decideInput = z.object({
  token: z.string().regex(/^[\w-]{20,128}$/),
  decisions: z
    .array(
      z.object({
        findingId: z.uuid(),
        decision: z.enum(['approved', 'adjustment']),
        comment: z.string().max(500).optional(),
      }),
    )
    .max(50),
  final: z.enum(['approved', 'adjustments']),
});

export async function reportByToken(
  db: Db,
  token: string,
): Promise<{ report: ReportRow; userId: string } | null> {
  if (!/^[\w-]{20,128}$/.test(token)) return null;
  return findReportByTokenHash(db, sha256Hex(token));
}

/** Public, authenticated by the token. The final decision is written once (a second one changes nothing). */
export async function decideReportWith(
  input: unknown,
  deps: { db: Db },
): Promise<ActionResult<void>> {
  const parsed = decideInput.safeParse(input);
  if (!parsed.success) return fail('INVALID_INPUT', 'Decisão inválida.');
  const found = await reportByToken(deps.db, parsed.data.token);
  if (!found) return fail('NOT_FOUND', 'Este link expirou ou não existe.');
  const known = new Set((await listFindings(deps.db, found.report.analysisId)).map((f) => f.id));
  const items = parsed.data.decisions
    .filter((d) => known.has(d.findingId))
    .map((d) => ({
      findingId: d.findingId,
      decision: d.decision,
      ...(d.comment ? { comment: d.comment } : {}),
    }));
  const done = await decideReportRow(deps.db, found.report.id, parsed.data.final, items);
  if (!done) return fail('FORBIDDEN', 'Este relatório já foi respondido.');
  logger.info('report.decided', { final: parsed.data.final });
  return ok(undefined);
}

export type ReportStatus = 'created' | 'sent' | 'opened' | 'approved' | 'adjustments';

/** The accountant's comment on a decided report (bug bash 20/11: the owner sees it), or null. */
export function accountantComment(r: ReportRow): string | null {
  return r.decisionsByFinding?.find((d) => d.comment)?.comment ?? null;
}

export function reportStatusOf(r: ReportRow): ReportStatus {
  if (r.decision === 'approved') return 'approved';
  if (r.decision === 'adjustments') return 'adjustments';
  if (r.openedAt) return 'opened';
  if (r.sentAt) return 'sent';
  return 'created';
}

/** `GET /api/relatorios/[id]/status` frames: one `status` event per change, 3 s polling, at most 5 minutes. */
export async function* reportStatusFrames(o: {
  db: Db;
  userId: string;
  reportId: string;
  wait: (ms: number) => Promise<void>;
  aborted: () => boolean;
  deadlineMs: number;
  now?: () => number;
}): AsyncGenerator<string, void, void> {
  const now = o.now ?? Date.now;
  let last: ReportStatus | null = null;
  let seq = 0;
  while (!o.aborted() && now() < o.deadlineMs) {
    const r = await findOwnedReport(o.db, o.userId, o.reportId);
    if (!r) return;
    const status = reportStatusOf(r);
    if (status !== last) {
      last = status;
      seq += 1;
      const comment = accountantComment(r);
      yield `id: ${seq}\nevent: status\ndata: ${JSON.stringify({ type: 'status', status, ...(comment ? { comment } : {}) })}\n\n`;
    }
    if (status === 'approved' || status === 'adjustments') return;
    await o.wait(3000);
  }
}
