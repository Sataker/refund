import 'server-only';
import { type EmailBody, escapeHtml } from '../report/email.ts';

// "Law changed" alert e-mail (ARCHITECTURE §2.6 "Alert e-mail via Resend"). No number and no finding detail goes by
// e-mail: it names the regulation (public) and sends the user to the app, where the outdated finding shows.

export interface LawAlertEmail {
  /** "LC 123/2006" */
  regulationLabel: string;
  /** Absolute link to /app (built from NEXT_PUBLIC_SITE_URL, never from the request). */
  link: string;
}

export function lawAlertEmailBody(e: LawAlertEmail): EmailBody {
  const subject = 'Uma lei que o Refund usa nos seus cálculos mudou';
  const intro = `O texto de ${e.regulationLabel} mudou. Os achados que dependem dessa norma foram marcados para revisão.`;
  const calm =
    'Nada muda nos seus números até a nova regra ser conferida por uma pessoa e publicada no Refund.';
  const text = [intro, calm, `Veja no Refund: ${e.link}`].join('\n\n');
  const html = `<p>${escapeHtml(intro)}</p><p>${escapeHtml(calm)}</p><p><a href="${escapeHtml(e.link)}">Abrir o Refund</a></p>`;
  return { subject, html, text };
}
