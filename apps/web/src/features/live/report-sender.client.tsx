'use client';

import { Check, Copy, Loader2, Send } from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// Screen 8 in /app: "Mandar para meu contador" (ARCHITECTURE §4.7 sendReport). The e-mail goes only to the address
// typed here, and only when sending is on in this deploy (D6); the link is always created and can be copied
// (WhatsApp fallback). The status follows the light SSE `GET /api/relatorios/[id]/status`.

type Status = 'created' | 'sent' | 'opened' | 'approved' | 'adjustments';
type Result<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } };

const STATUS_TEXT: Record<Status, string> = {
  created: 'Link criado. Mande para o seu contador.',
  sent: 'Enviado por e-mail. Esperando o contador abrir.',
  opened: 'O contador abriu o relatório.',
  approved: 'O contador aprovou.',
  adjustments: 'O contador pediu ajustes.',
};

export function ReportSender({
  send,
  emailOn,
  last,
}: {
  send: (input: {
    accountantEmail: string;
    message: string;
    include: { calculations: boolean; laws: boolean; transactions: boolean };
  }) => Promise<Result<{ reportId: string; approvalLink: string; emailed: boolean }>>;
  emailOn: boolean;
  /** The newest report of this analysis (its link cannot be shown again: only its hash is stored). */
  last: { reportId: string; status: Status } | null;
}) {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(last?.reportId ?? null);
  const [status, setStatus] = useState<Status | null>(last?.status ?? null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, begin] = useTransition();

  useEffect(() => {
    if (!reportId || status === 'approved' || status === 'adjustments') return;
    const es = new EventSource(`/api/relatorios/${reportId}/status`);
    es.addEventListener('status', (e) => {
      try {
        const data = JSON.parse((e as MessageEvent<string>).data) as { status: Status };
        setStatus(data.status);
        if (data.status === 'approved' || data.status === 'adjustments') es.close();
      } catch {
        // A malformed frame is ignored; the next one carries the status again.
      }
    });
    return () => es.close();
  }, [reportId, status]);

  return (
    <section
      aria-labelledby="enviar-titulo"
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5 print:hidden"
      data-testid="report-sender"
    >
      <h2 id="enviar-titulo" className="type-h4 text-foreground">
        Mandar para meu contador
      </h2>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          begin(async () => {
            setError(null);
            const r = await send({
              accountantEmail: emailOn ? email.trim() : '',
              message: message.trim(),
              include: { calculations: true, laws: true, transactions: false },
            });
            if (!r.ok) {
              setError(r.error.message);
              return;
            }
            setLink(r.value.approvalLink);
            setReportId(r.value.reportId);
            setStatus(r.value.emailed ? 'sent' : 'created');
            setCopied(false);
          });
        }}
      >
        {/* M3: without e-mail in this deploy the field is not offered; the link leads (copy and send it). */}
        {emailOn ? (
          <label htmlFor="accountant-email" className="flex flex-col gap-1">
            <span className="type-small font-medium text-foreground">
              E-mail do contador (opcional)
            </span>
            <Input
              id="accountant-email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              data-testid="accountant-email"
              placeholder="e-mail do seu contador"
            />
            <span className="type-caption text-muted-foreground">
              Mandamos só para este endereço. Ele fica guardado cifrado.
            </span>
          </label>
        ) : (
          <p className="type-small text-muted-foreground" data-testid="report-link-howto">
            Gere o link e copie: mande para o seu contador pelo WhatsApp ou e-mail. Ele abre sem
            cadastro e aprova por lá.
          </p>
        )}
        <label className="flex flex-col gap-1">
          <span className="type-small font-medium text-foreground">Mensagem (opcional)</span>
          <textarea
            value={message}
            maxLength={1000}
            onChange={(e) => setMessage(e.target.value)}
            className="min-h-20 rounded-md border border-border bg-background p-3 text-base"
          />
        </label>
        <Button type="submit" size="lg" disabled={pending} data-testid="create-report-link">
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="size-4" strokeWidth={1.5} aria-hidden="true" />
          )}
          {emailOn && email.trim() !== '' ? 'Enviar e gerar o link' : 'Gerar link'}
        </Button>
      </form>
      {error ? (
        <p role="alert" className="type-small text-risk">
          {error}
        </p>
      ) : null}
      {link ? (
        <div className="flex flex-col gap-2">
          <p className="type-small text-foreground">Link para o contador (vale 30 dias):</p>
          <div className="flex flex-wrap items-center gap-2">
            <code
              className="max-w-full truncate rounded-md bg-surface-2 px-2 py-1 text-[13px]"
              data-testid="report-link"
            >
              {link}
            </code>
            <Button
              type="button"
              data-testid="copy-report-link"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? (
                <Check className="size-4" aria-hidden="true" />
              ) : (
                <Copy className="size-4" aria-hidden="true" />
              )}
              {copied ? 'Copiado' : 'Copiar link'}
            </Button>
          </div>
        </div>
      ) : null}
      {status ? (
        <p
          role="status"
          className="type-small font-medium text-foreground"
          data-testid="report-status"
          data-status={status}
        >
          {STATUS_TEXT[status]}
        </p>
      ) : null}
    </section>
  );
}
