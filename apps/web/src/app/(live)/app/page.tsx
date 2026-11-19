import { latestAnalysis } from '@refund/db';
import { ArrowRight, Check } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Disclaimer } from '@/components/brand/disclaimer';
import { Logo } from '@/components/brand/logo';
import { SandboxSeal } from '@/components/brand/sandbox-seal';
import { DisconnectButton } from '@/features/connection/disconnect-button.client';
import { ROUTES } from '@/features/landing/routes';
import { StartAnalysisButton } from '@/features/live/buttons.client';
import { LiveUnavailable } from '@/features/track/live-unavailable';
import { CONNECTION_STATUS_LABEL, currentStep, stepPath } from '@/features/track/steps';
import { liveContext } from '@/server/live.ts';
import { loadTrack } from '@/server/track/state.ts';
import { startAnalysis } from './analises/actions';
import { revokeConnection } from './comecar/actions';

// /app: while the first-access track is not over, everything leads back to the current step (shell
// lock, D19). At the end of the track this screen says what is connected and starts the live analysis
// (Screen 4, E14); a previous analysis stays one tap away.

export default async function AppHome() {
  const ctx = await liveContext();
  if (!ctx.ok) return <LiveUnavailable message={ctx.error.message} />;
  const { progress, company } = await loadTrack(ctx.value.db, ctx.value.userId);
  const current = currentStep(progress);
  if (current !== 'done') redirect(stepPath(current) as never);
  const last = await latestAnalysis(ctx.value.db, ctx.value.userId);

  const accounts = [
    { holder: 'PJ', label: 'Conta da empresa', conn: progress.pj },
    { holder: 'PF', label: 'Sua conta pessoal', conn: progress.pf },
  ] as const;

  return (
    <div className="flex min-h-dvh flex-col bg-background" data-testid="track-done">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-[1120px] items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="Refund, página inicial" className="text-xl">
            <Logo />
          </Link>
          <SandboxSeal live className="hidden sm:inline-flex" />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-[560px] flex-1 flex-col px-4 py-12">
        <h1 className="type-h1 text-foreground">Tudo pronto para a análise.</h1>
        <p className="type-body-lg mt-4 text-muted-foreground">
          {progress.company?.displayName}: perfil respondido e contas conectadas.
        </p>
        <ul className="mt-8 flex flex-col gap-3">
          {accounts.map(({ holder, label, conn }) => (
            <li
              key={holder}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4"
            >
              <span className="type-small font-medium text-foreground">{label}</span>
              <span className="type-small num inline-flex items-center gap-1.5 text-muted-foreground">
                {conn?.status === 'active' ? (
                  <>
                    <Check className="size-4 text-success" aria-hidden="true" />
                    {CONNECTION_STATUS_LABEL.active} · {conn.transactions} transações
                  </>
                ) : (
                  'não conectada'
                )}
              </span>
              {conn ? (
                <DisconnectButton
                  label={`Desconectar: ${label}`}
                  revoke={revokeConnection.bind(null, { connectionId: conn.id })}
                />
              ) : null}
            </li>
          ))}
        </ul>
        <div className="mt-8 flex flex-col gap-4">
          {company ? (
            <StartAnalysisButton
              start={startAnalysis.bind(null, { companyCnpj: company.company.cnpj })}
              label={last ? 'Fazer uma nova análise' : 'Começar a análise'}
            />
          ) : null}
          {last ? (
            <Link
              href={`/app/analises/${last.id}` as Route}
              data-testid="open-last-analysis"
              className="type-small inline-flex items-center gap-1 font-medium text-cobalt underline-offset-4 hover:underline"
            >
              Ver a última análise
              <ArrowRight className="size-4" strokeWidth={1.5} aria-hidden="true" />
            </Link>
          ) : null}
          <p className="type-small text-muted-foreground">
            Quer ver antes como fica? A{' '}
            <Link href={ROUTES.demo} className="underline underline-offset-4">
              demo
            </Link>{' '}
            mostra a análise completa da Marina. ·{' '}
            <Link
              href={'/app/conta' as Route}
              className="underline underline-offset-4"
              data-testid="open-account"
            >
              Conta e privacidade
            </Link>
          </p>
        </div>
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto max-w-[1120px] px-4 py-5 sm:px-6">
          <Disclaimer size="caption" />
        </div>
      </footer>
    </div>
  );
}
