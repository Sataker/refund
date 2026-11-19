'use client';

import { ExternalLink, Printer } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  type DemoReportState,
  demoSession,
  onDemoMessage,
  updatePersonaState,
} from '@/demo/demo-session';
import { cn } from '@/lib/utils';

// Screen 8 on /demo (ARCHITECTURE §4.7 note): "Mandar para meu contador" opens the accountant view in another tab;
// the approval there reaches this tab through BroadcastChannel (demo-session.ts), with no server and no e-mail.

export type ReportStatus = 'draft' | 'sent' | 'opened' | 'adjust' | 'approved';

export function statusOf(r: DemoReportState | undefined): ReportStatus {
  if (!r) return 'draft';
  if (r.approvedAt) return 'approved';
  if (r.findings && Object.values(r.findings).includes('adjust')) return 'adjust';
  if (r.openedAt) return 'opened';
  if (r.sentAt) return 'sent';
  return 'draft';
}

function time(ms: number | undefined): string {
  if (ms === undefined) return '';
  return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function useReport(persona: string): DemoReportState | undefined {
  const [report, setReport] = useState<DemoReportState | undefined>(undefined);
  const load = useCallback(() => setReport(demoSession().personas[persona]?.report), [persona]);
  useEffect(() => {
    load();
    return onDemoMessage(load);
  }, [load]);
  return report;
}

export function ReportPanel({ persona }: { persona: string }) {
  const report = useReport(persona);
  const status = statusOf(report);
  const send = () => {
    updatePersonaState(persona, {
      report: { ...demoSession().personas[persona]?.report, sentAt: Date.now() },
    });
    window.open(`/demo/${persona}/contador`, '_blank', 'noopener');
  };
  const steps: { id: string; label: string; at: number | undefined; on: boolean }[] = [
    { id: 'sent', label: 'Enviado', at: report?.sentAt, on: report?.sentAt !== undefined },
    {
      id: 'opened',
      label: 'Aberto pelo contador',
      at: report?.openedAt,
      on: report?.openedAt !== undefined,
    },
    status === 'adjust'
      ? { id: 'adjust', label: 'Ajuste pedido', at: undefined, on: true }
      : { id: 'approved', label: 'Aprovado', at: report?.approvedAt, on: status === 'approved' },
  ];
  return (
    <aside className="flex flex-col gap-6 print:hidden" aria-label="Mandar para seu contador">
      <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5">
        <h2 className="type-h4 text-foreground">Mandar para seu contador</h2>
        <p className="type-small text-muted-foreground">
          Na demo nada sai por e-mail: o contador abre o relatório em outra aba e aprova por lá.
        </p>
        <Button type="button" size="lg" onClick={send} data-testid="open-accountant">
          <ExternalLink className="size-4" strokeWidth={1.5} aria-hidden="true" />
          Abrir a visão do contador
        </Button>
        <Button
          type="button"
          size="lg"
          variant="outline"
          onClick={() => window.print()}
          data-testid="save-pdf"
        >
          <Printer className="size-4" strokeWidth={1.5} aria-hidden="true" />
          Salvar PDF
        </Button>
      </section>
      <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5">
        <h2 className="type-small font-medium text-muted-foreground">Situação</h2>
        <ol
          className="flex flex-col gap-2"
          data-testid="report-status"
          data-status={status}
          aria-live="polite"
        >
          {steps.map((s) => (
            <li key={s.id} className="type-small flex items-center gap-2">
              <span
                aria-hidden="true"
                className={cn(
                  'size-2.5 rounded-full border',
                  s.on
                    ? s.id === 'adjust'
                      ? 'border-warning bg-warning'
                      : 'border-success bg-success'
                    : 'border-strong-border',
                )}
              />
              <span className={s.on ? 'text-foreground' : 'text-muted-foreground'}>{s.label}</span>
              {s.at ? <span className="num text-muted-foreground">{time(s.at)}</span> : null}
            </li>
          ))}
        </ol>
        {status === 'adjust' && report?.comment ? (
          <p
            className="type-small rounded-md bg-warning-soft px-3 py-2 text-foreground"
            data-testid="adjust-comment"
          >
            O contador pediu ajuste: “{report.comment}”
          </p>
        ) : null}
      </section>
    </aside>
  );
}
