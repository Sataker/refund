'use client';

import { ArrowRight, Check, ExternalLink, Landmark } from 'lucide-react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import type { ClientResult } from '@/features/track/client-types';
import {
  CONNECTION_STATUS_LABEL,
  type ConnectionStatus,
  type ConnectionSummary,
} from '@/features/track/steps';
import { cn } from '@/lib/utils';

// Steps `conta-pj` / `conta-pf` (Screen 3; ADR-012 / A11). With the `pluggy` capability: "Conectar banco
// real (sandbox)" opens Pluggy Connect. Without it, that button does not exist: "Integração com Open
// Finance demonstrada no vídeo" + the synthetic persona. Any widget error offers the sample data; never
// an error screen.

type Holder = 'PF' | 'PJ';
type Status = {
  connectionId: string;
  status: ConnectionStatus;
  transactions: number;
  connectorName: string | null;
};

export interface ConnectActions {
  connectSample: (input: { holder: Holder }) => Promise<ClientResult<Status>>;
  createConnectToken: (input: { holder: Holder }) => Promise<
    ClientResult<{
      connectToken: string;
      includeSandbox: boolean;
      connectorTypes: string[];
      connectorIds: number[];
    }>
  >;
  registerItem: (input: {
    itemId: string;
    holder: Holder;
    companyCnpj?: string;
  }) => Promise<ClientResult<{ connectionId: string }>>;
  getStatus: (input: {
    connectionId: string;
  }) => Promise<ClientResult<{ status: ConnectionStatus; transactions: number }>>;
  revoke: (input: { connectionId: string }) => Promise<ClientResult<void>>;
  skip?: () => Promise<ClientResult<{ next: string }>>;
}

interface ConnectStepProps {
  holder: Holder;
  pluggyOn: boolean;
  existing: ConnectionSummary | null;
  nextHref: string;
  companyCnpj?: string;
  actions: ConnectActions;
}

const PLUGGY_SANDBOX_DOCS = 'https://docs.pluggy.ai/docs/sandbox';
const POLL_MS = 2_000;
const TIMEOUT_MS = 30_000;

const COPY: Record<Holder, { label: string; title: string }> = {
  PJ: { label: 'PJ', title: 'Conta da empresa' },
  PF: { label: 'PF', title: 'Sua conta pessoal' },
};

export function ConnectStep({
  holder,
  pluggyOn,
  existing,
  nextHref,
  companyCnpj,
  actions,
}: ConnectStepProps) {
  const router = useRouter();
  const [conn, setConn] = useState<{
    id: string;
    status: ConnectionStatus;
    transactions: number;
    name: string | null;
  } | null>(
    existing && existing.status !== 'revoked'
      ? {
          id: existing.id,
          status: existing.status,
          transactions: existing.transactions,
          name: existing.connectorName,
        }
      : null,
  );
  const [phase, setPhase] = useState<'idle' | 'widget' | 'waiting'>(
    existing?.status === 'syncing' ? 'waiting' : 'idle',
  );
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const startedAt = useRef<number>(0);

  // Polling every 2 s: the fallback when the webhook is late (ARCHITECTURE §2.4, §12).
  useEffect(() => {
    if (phase !== 'waiting' || !conn) return;
    startedAt.current ||= Date.now();
    const id = setInterval(async () => {
      const r = await actions.getStatus({ connectionId: conn.id });
      if (!r.ok) return;
      setConn((c) => (c ? { ...c, ...r.value } : c));
      if (r.value.status === 'active') setPhase('idle');
      else if (r.value.status === 'error' || Date.now() - startedAt.current > TIMEOUT_MS) {
        setPhase('idle');
        setProblem('Seu banco não respondeu. Tente de novo ou use os dados de exemplo.');
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [phase, conn, actions]);

  function connectSample() {
    setProblem(null);
    start(async () => {
      const r = await actions.connectSample({ holder });
      if (r.ok) {
        setConn({
          id: r.value.connectionId,
          status: r.value.status,
          transactions: r.value.transactions,
          name: r.value.connectorName,
        });
        router.refresh();
      } else setProblem(r.error.message);
    });
  }

  function connectReal() {
    setProblem(null);
    start(async () => {
      const token = await actions.createConnectToken({ holder });
      if (!token.ok) {
        setProblem(token.error.message);
        return;
      }
      setPhase('widget');
      try {
        const { PluggyConnect } = await import('pluggy-connect-sdk');
        const widget = new PluggyConnect({
          connectToken: token.value.connectToken,
          includeSandbox: token.value.includeSandbox,
          connectorTypes: token.value.connectorTypes as never,
          // Only the sandbox connectors: no real bank in this version (compliance C1).
          connectorIds: token.value.connectorIds,
          onSuccess: async ({ item }) => {
            const r = await actions.registerItem({
              itemId: item.id,
              holder,
              ...(companyCnpj ? { companyCnpj } : {}),
            });
            if (!r.ok) {
              setPhase('idle');
              setProblem(r.error.message);
              return;
            }
            startedAt.current = Date.now();
            setConn({ id: r.value.connectionId, status: 'syncing', transactions: 0, name: null });
            setPhase('waiting');
          },
          onError: () => {
            setPhase('idle');
            setProblem('Não deu certo com o banco agora.');
          },
          onClose: () => setPhase((p) => (p === 'widget' ? 'idle' : p)),
        });
        await widget.init();
      } catch {
        setPhase('idle');
        setProblem('Não deu certo com o banco agora.');
      }
    });
  }

  function disconnect() {
    if (!conn) return;
    start(async () => {
      const r = await actions.revoke({ connectionId: conn.id });
      if (r.ok) {
        setConn(null);
        router.refresh();
      } else setProblem(r.error.message);
    });
  }

  function skip() {
    const action = actions.skip;
    if (!action) return;
    start(async () => {
      const r = await action();
      if (r.ok) router.push(r.value.next as Route);
      else setProblem(r.error.message);
    });
  }

  const active = conn?.status === 'active';
  const waiting = phase === 'waiting' || conn?.status === 'syncing';

  return (
    <div className="flex flex-col gap-6">
      <section
        className={cn(
          'rounded-lg border bg-surface p-5 shadow-sm transition-colors duration-(--dur-base)',
          active ? 'border-success' : 'border-border',
        )}
        data-testid={`account-card-${holder}`}
        aria-live="polite"
      >
        <div className="flex items-start gap-3">
          <span className="type-caption grid h-7 min-w-9 place-items-center rounded-sm bg-surface-2 px-2 font-semibold text-foreground">
            {COPY[holder].label}
          </span>
          <div className="min-w-0 flex-1">
            <p className="type-h4 text-foreground">{COPY[holder].title}</p>
            {conn ? (
              <p className="type-small mt-1 text-muted-foreground">
                {conn.name ?? 'Banco conectado'}
              </p>
            ) : null}
          </div>
          {active ? (
            <span className="grid size-7 place-items-center rounded-full bg-success text-background">
              <Check className="size-4" strokeWidth={2.5} aria-hidden="true" />
            </span>
          ) : null}
        </div>

        {conn && (active || waiting || conn.status === 'error') ? (
          <p
            className="type-small num mt-4 text-foreground"
            data-testid="connection-status"
            data-status={conn.status}
          >
            <span className="font-semibold">{CONNECTION_STATUS_LABEL[conn.status]}</span>
            {active ? ` · ${conn.transactions.toLocaleString('pt-BR')} transações` : null}
          </p>
        ) : null}
        {waiting ? (
          <div className="mt-3">
            <div className="h-1 overflow-hidden rounded-full bg-surface-2">
              <div className="hatch h-full w-full text-cobalt" />
            </div>
            <p className="type-small mt-2 text-muted-foreground">Esperando o seu banco…</p>
          </div>
        ) : null}

        {!active && !waiting ? (
          <div className="mt-5 flex flex-col gap-3">
            {pluggyOn ? (
              <>
                <Button
                  type="button"
                  size="xl"
                  onClick={connectReal}
                  disabled={pending || phase === 'widget'}
                  data-testid="connect-real-bank"
                >
                  <Landmark className="size-4" strokeWidth={1.5} aria-hidden="true" />
                  Conectar banco real (sandbox)
                </Button>
                <p className="type-small text-muted-foreground">
                  É o ambiente de testes da Pluggy: use as{' '}
                  <a
                    href={PLUGGY_SANDBOX_DOCS}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-cobalt underline underline-offset-4"
                  >
                    credenciais de teste da Pluggy
                    <ExternalLink className="size-3" aria-hidden="true" />
                  </a>
                  .
                </p>
              </>
            ) : (
              <p className="type-small text-muted-foreground" data-testid="open-finance-video-note">
                Nesta versão a conexão com o banco está desligada. Siga com o extrato de exemplo da
                Marina para ver como a análise funciona.
              </p>
            )}
            <Button
              type="button"
              size={pluggyOn ? 'lg' : 'xl'}
              variant={pluggyOn ? 'outline' : 'default'}
              onClick={connectSample}
              disabled={pending}
              aria-busy={pending}
              data-testid="use-sample-data"
            >
              Usar dados de exemplo
            </Button>
          </div>
        ) : null}

        {problem ? (
          <p className="type-small mt-4 text-risk" role="alert">
            {problem}
          </p>
        ) : null}
        {active ? (
          <button
            type="button"
            onClick={disconnect}
            disabled={pending}
            className="type-small mt-4 text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Desconectar esta conta
          </button>
        ) : null}
      </section>

      {holder === 'PF' && !active ? (
        <div className="rounded-lg border border-dashed border-border p-4">
          <p className="type-small text-muted-foreground">
            Só a PJ? Dá para seguir, mas a conta de pró-labore fica estimada.
          </p>
          <Button
            type="button"
            variant="link"
            onClick={skip}
            disabled={pending}
            className="mt-1 h-auto px-0"
            data-testid="skip-pf"
          >
            Pular: só a PJ
          </Button>
        </div>
      ) : null}

      {active ? (
        <Button
          type="button"
          size="xl"
          className="w-full sm:w-auto sm:self-start"
          onClick={() => router.push(nextHref as Route)}
          data-testid="track-continue"
        >
          Continuar
          <ArrowRight className="size-4" strokeWidth={1.5} aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}
