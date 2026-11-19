'use client';

import { Check, Loader2 } from 'lucide-react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';

// Small /app action buttons. The server actions come in as props (bound on the server), so these client files never
// import `src/server/**` (ARCHITECTURE §3.3).

type Result<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      error: { code: string; message: string; upgrade?: { url: string } };
    };

/** "Começar a análise" / "Refazer a análise": starts a run and opens Screen 4. */
export function StartAnalysisButton({
  start,
  label,
  testId = 'start-analysis',
  variant = 'default',
}: {
  start: () => Promise<Result<{ analysisId: string }>>;
  label: string;
  testId?: string;
  variant?: 'default' | 'outline';
}) {
  const router = useRouter();
  const [pending, begin] = useTransition();
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        size="lg"
        variant={variant}
        data-testid={testId}
        disabled={pending}
        onClick={() =>
          begin(async () => {
            setError(null);
            const r = await start();
            if (r.ok) router.push(`/app/analises/${r.value.analysisId}` as Route);
            else setError(r.error);
          })
        }
      >
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        {label}
      </Button>
      {error ? (
        <p
          role="alert"
          data-testid={error.code === 'PLAN_LIMIT' ? 'paywall-plan-limit' : 'action-error'}
          data-code={error.code}
          className="type-small max-w-[48ch] rounded-md border border-warning bg-warning-soft px-3 py-2 text-foreground"
        >
          {error.code === 'PLAN_LIMIT'
            ? 'Você usou as 3 análises do plano Grátis neste mês. No plano Empresa são 30 por mês.'
            : error.message}
        </p>
      ) : null}
    </div>
  );
}

/** "Marcar para o contador" (markFinding). */
export function MarkFindingButton({
  mark,
  initial,
}: {
  mark: (status: 'marked' | 'new') => Promise<Result<void>>;
  initial: boolean;
}) {
  const [marked, setMarked] = useState(initial);
  const [pending, begin] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      aria-pressed={marked}
      data-testid="mark-finding"
      disabled={pending}
      onClick={() =>
        begin(async () => {
          const next = !marked;
          const r = await mark(next ? 'marked' : 'new');
          if (r.ok) setMarked(next);
        })
      }
    >
      {marked ? <Check className="size-4" aria-hidden="true" /> : null}
      {marked ? 'Marcado para o contador' : 'Marcar para o contador'}
    </Button>
  );
}
