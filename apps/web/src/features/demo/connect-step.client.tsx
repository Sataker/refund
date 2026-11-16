'use client';

import { ArrowRight, Check, Landmark, Lock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { DemoAccountView } from './types';

// Steps `conta-pj` and `conta-pf` on /demo (IDENTITY-AND-UI Screen 3, "On /demo"): a replica of the Open
// Finance connection widget. No call is made: the persona's bank "connects" in 0,4 s, the check draws
// itself (220 ms) and the transaction count climbs (600 ms). The real integration runs on /app (E11).

const CONNECT_MS = 400;
const COUNT_MS = 600;

type Phase = 'connecting' | 'connected';

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Counts 0 → n in `ms` with out-expo, integers only. */
function useCountUp(target: number, run: boolean): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!run) return;
    if (prefersReducedMotion()) {
      setN(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / COUNT_MS);
      const eased = t === 1 ? 1 : 1 - 2 ** (-10 * t);
      setN(Math.round(target * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, run]);
  return n;
}

interface DemoConnectStepProps {
  holder: 'PJ' | 'PF';
  account: DemoAccountView;
  onContinue: () => void;
  /** Only on conta-pf: "Pular: só a PJ". */
  onSkip?: () => void;
}

const COPY = {
  PJ: { tag: 'PJ', title: 'Conta da empresa' },
  PF: { tag: 'PF', title: 'Sua conta pessoal' },
} as const;

export function DemoConnectStep({ holder, account, onContinue, onSkip }: DemoConnectStepProps) {
  const [phase, setPhase] = useState<Phase>('connecting');
  useEffect(() => {
    if (prefersReducedMotion()) {
      setPhase('connected');
      return;
    }
    const t = setTimeout(() => setPhase('connected'), CONNECT_MS);
    return () => clearTimeout(t);
  }, []);
  const connected = phase === 'connected';
  const count = useCountUp(account.transactions, connected);

  return (
    <div className="flex flex-col gap-6">
      <section
        className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm"
        aria-label="Réplica do widget de conexão Open Finance"
        data-testid="widget-replica"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-2 px-4 py-2.5">
          <span className="type-caption inline-flex items-center gap-1.5 text-muted-foreground">
            <Lock className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
            Conexão Open Finance
          </span>
          <span className="type-caption text-muted-foreground">réplica do widget</span>
        </div>

        <div
          className={cn(
            'm-4 rounded-md border p-4 transition-colors duration-(--dur-base)',
            connected ? 'border-success' : 'border-border',
          )}
          data-testid={`account-card-${holder}`}
          data-status={connected ? 'active' : 'syncing'}
        >
          <div className="flex items-start gap-3">
            <span className="type-caption grid h-7 min-w-9 place-items-center rounded-sm bg-surface-2 px-2 font-semibold text-foreground">
              {COPY[holder].tag}
            </span>
            <div className="min-w-0 flex-1">
              <p className="type-h4 text-foreground">{COPY[holder].title}</p>
              <p className="type-small mt-0.5 inline-flex items-center gap-1.5 text-muted-foreground">
                <Landmark className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                {account.bank} · {account.products.join(' e ')}
              </p>
            </div>
            <span
              className={cn(
                'grid size-7 shrink-0 place-items-center rounded-full transition-colors duration-(--dur-base)',
                connected ? 'bg-success text-background' : 'bg-surface-2 text-transparent',
              )}
            >
              {connected ? (
                <Check className="check-draw size-4" strokeWidth={2.5} aria-hidden="true" />
              ) : null}
            </span>
          </div>
          <div aria-live="polite" className="mt-4 min-h-12">
            {connected ? (
              <p
                className="type-small num text-foreground"
                data-testid="connection-status"
                data-status="active"
                data-transactions={account.transactions}
              >
                <span className="font-semibold">Conectada</span> · {count.toLocaleString('pt-BR')}{' '}
                transações dos últimos 12 meses
              </p>
            ) : (
              <div>
                <div className="h-1 overflow-hidden rounded-full bg-surface-2">
                  <div className="indeterminate h-full w-1/3 rounded-full bg-cobalt" />
                </div>
                <p className="type-small mt-2 text-muted-foreground">Esperando o seu banco…</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {holder === 'PF' && onSkip ? (
        <div className="rounded-lg border border-dashed border-border p-4">
          <p className="type-small text-muted-foreground">
            Só a PJ? Dá para seguir, mas a conta do pró-labore fica estimada.
          </p>
          <Button
            type="button"
            variant="link"
            onClick={onSkip}
            className="mt-1 h-auto px-0"
            data-testid="skip-pf"
          >
            Pular: só a PJ
          </Button>
        </div>
      ) : null}

      <Button
        type="button"
        size="xl"
        className={cn('w-full sm:w-auto sm:self-start', connected && 'demo-cue')}
        onClick={onContinue}
        disabled={!connected}
        data-testid="track-advance"
      >
        {holder === 'PJ' ? 'Continuar' : 'Analisar minhas contas'}
        <ArrowRight className="size-4" strokeWidth={1.5} aria-hidden="true" />
      </Button>
    </div>
  );
}
