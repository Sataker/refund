import 'server-only';
import { readEnv } from '../env.ts';
import { logger } from '../log.ts';

// Resend over its REST API (INFRA-CI §1.1: RESEND_API_KEY + RESEND_FROM turn sending on). One plain message with the
// approval link; the report itself opens at /r/[token], so no attachment, no personal number and not the user's own
// message (it shows on /r/[token]; code review E14, L4) goes by e-mail.

export interface ReportEmail {
  to: string;
  link: string;
  findings: number;
}

export const escapeHtml = (s: string) =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

export function reportEmailBody(e: ReportEmail): { subject: string; html: string; text: string } {
  const subject = 'Relatório do Refund para sua aprovação';
  const intro = `Seu cliente pediu para você revisar ${e.findings === 1 ? '1 achado' : `${e.findings} achados`} de economia de imposto, com a conta e a lei de cada um.`;
  const text = [intro, `Abra e aprove aqui: ${e.link}`, 'O link vale 30 dias.'].join('\n\n');
  const html = `<p>${escapeHtml(intro)}</p><p><a href="${escapeHtml(e.link)}">Abrir o relatório</a></p><p>O link vale 30 dias.</p>`;
  return { subject, html, text };
}

export async function sendReportEmail(
  e: ReportEmail,
): Promise<{ ok: true; id: string } | { ok: false }> {
  return sendEmail(e.to, reportEmailBody(e), 'report');
}

export interface EmailBody {
  subject: string;
  html: string;
  text: string;
}

/** One message through Resend (capability-gated by the caller); the report and the "law changed" alert use it. */
export async function sendEmail(
  to: string,
  body: EmailBody,
  kind: 'report' | 'law_alert',
): Promise<{ ok: true; id: string } | { ok: false }> {
  const env = readEnv().values;
  if (!env.RESEND_API_KEY || !env.RESEND_FROM) return { ok: false };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.RESEND_FROM,
        to: [to],
        subject: body.subject,
        html: body.html,
        text: body.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      logger.warn(`${kind}.resend_status`, { status: res.status });
      return { ok: false };
    }
    const json = (await res.json()) as { id?: unknown };
    return typeof json.id === 'string' ? { ok: true, id: json.id.slice(0, 80) } : { ok: false };
  } catch (err) {
    logger.warn(`${kind}.resend_error`, { error: err });
    return { ok: false };
  }
}
