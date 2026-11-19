'use client';

import { Check, MessageSquareWarning } from 'lucide-react';
import { useEffect, useState } from 'react';
import { LawSeal } from '@/components/brand/law-seal';
import { Button } from '@/components/ui/button';
import { demoSession, updatePersonaState } from '@/demo/demo-session';
import { cn } from '@/lib/utils';
import { statusOf, useReport } from './report-status.client';
import { DEMO_ACCOUNTANT_FULL } from './text';

// The accountant's view on /demo (ARCHITECTURE §13 `/demo/[persona]/contador`; §4.7 note): opened in another tab
// from Screen 8, no login, no e-mail. Each decision is written to the visitor session and announced on the
// BroadcastChannel, so the owner's tab changes status without reloading.

export interface AccountantItem {
  ruleId: string;
  title: string;
  /** Already formatted on the server from the engine's value ("R$ 28.316,52 nos próximos 12 meses"). */
  value: string;
  /** Alerts and risks: shown for reading, outside the total; nothing to approve (engine review L1). */
  readOnly?: boolean;
  /** The finding's first LegalRef (rule metadata), as the § chip of the row (UX review G2 M10). */
  lawRef?: { label: string; url: string };
}

export function AccountantReview({ persona, items }: { persona: string; items: AccountantItem[] }) {
  const report = useReport(persona);
  const status = statusOf(report);
  const [comment, setComment] = useState('');

  // Opening the page marks the report as opened (once).
  useEffect(() => {
    const current = demoSession().personas[persona]?.report;
    if (current?.openedAt === undefined)
      updatePersonaState(persona, { report: { ...current, openedAt: Date.now() } });
  }, [persona]);

  const save = (patch: Parameters<typeof updatePersonaState>[1]['report']) =>
    updatePersonaState(persona, {
      report: { ...demoSession().personas[persona]?.report, ...patch },
    });

  const decide = (ruleId: string, decision: 'approved' | 'adjust') => {
    const current = demoSession().personas[persona]?.report ?? {};
    const next = { ...current, findings: { ...current.findings, [ruleId]: decision } };
    if (decision === 'adjust') {
      delete next.approvedAt;
      next.comment = comment.trim() || 'Rever este achado.';
    }
    updatePersonaState(persona, { report: next });
  };

  return (
    <div className="flex flex-col gap-6">
      <ul className="flex flex-col gap-3">
        {items
          .filter((it) => !it.readOnly)
          .map((it) => {
            const d = report?.findings?.[it.ruleId];
            return (
              <li
                key={it.ruleId}
                data-testid={`review-${it.ruleId}`}
                data-decision={d ?? 'pending'}
                className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="flex flex-col gap-1.5">
                  <span className="text-base font-medium text-foreground">{it.title}</span>
                  <span className="type-small num text-muted-foreground">{it.value}</span>
                  {it.lawRef ? <LawSeal lawRef={it.lawRef} /> : null}
                </span>
                <span className="flex gap-2">
                  <Button
                    type="button"
                    variant={d === 'approved' ? 'default' : 'outline'}
                    aria-pressed={d === 'approved'}
                    onClick={() => decide(it.ruleId, 'approved')}
                  >
                    {d === 'approved' ? (
                      'Aprovado ✓'
                    ) : (
                      <>
                        <Check className="size-4" strokeWidth={1.5} aria-hidden="true" />
                        Aprovar
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant={d === 'adjust' ? 'secondary' : 'ghost'}
                    aria-pressed={d === 'adjust'}
                    onClick={() => decide(it.ruleId, 'adjust')}
                  >
                    <MessageSquareWarning className="size-4" strokeWidth={1.5} aria-hidden="true" />
                    Pedir ajuste
                  </Button>
                </span>
              </li>
            );
          })}
      </ul>

      {items.some((it) => it.readOnly) ? (
        <section aria-label="Riscos e alertas, fora do total" className="flex flex-col gap-2">
          <h2 className="type-small font-medium text-muted-foreground">
            Riscos e alertas · fora do total (só leitura)
          </h2>
          <ul className="flex flex-col gap-2">
            {items
              .filter((it) => it.readOnly)
              .map((it) => (
                <li
                  key={it.ruleId}
                  data-testid={`review-${it.ruleId}`}
                  className="flex flex-col gap-0.5 rounded-lg border border-border bg-surface-2 p-4"
                >
                  <span className="text-base text-foreground">{it.title}</span>
                  <span className="type-small num text-muted-foreground">{it.value}</span>
                  {it.lawRef ? <LawSeal lawRef={it.lawRef} className="mt-1" /> : null}
                </li>
              ))}
          </ul>
        </section>
      ) : null}

      <label className="flex flex-col gap-2">
        <span className="type-small text-muted-foreground">
          Comentário (opcional, vai junto com um pedido de ajuste)
        </span>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          maxLength={500}
          className="rounded-md border border-strong-border bg-surface px-3 py-2 text-base text-foreground"
        />
      </label>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button
          type="button"
          size="lg"
          data-testid="approve-report"
          disabled={status === 'approved'}
          onClick={() =>
            save({
              approvedAt: Date.now(),
              findings: Object.fromEntries(
                items.filter((i) => !i.readOnly).map((i) => [i.ruleId, 'approved' as const]),
              ),
            })
          }
        >
          <Check className="size-4" strokeWidth={1.5} aria-hidden="true" />
          {status === 'approved' ? 'Relatório aprovado' : 'Aprovar relatório'}
        </Button>
        <p
          className={cn(
            'type-small',
            status === 'approved' ? 'text-success' : 'text-muted-foreground',
          )}
          role="status"
          data-testid="accountant-status"
        >
          {status === 'approved'
            ? `Aprovado por ${DEMO_ACCOUNTANT_FULL}. A outra aba já mostra a aprovação.`
            : 'A aprovação aparece na hora na aba de quem mandou o relatório.'}
        </p>
      </div>
    </div>
  );
}
