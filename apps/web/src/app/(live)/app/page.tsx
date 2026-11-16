import { ArrowRight, Check } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Disclaimer } from '@/components/brand/disclaimer';
import { Logo } from '@/components/brand/logo';
import { SandboxSeal } from '@/components/brand/sandbox-seal';
import { DisconnectButton } from '@/features/connection/disconnect-button.client';
import { ROUTES } from '@/features/landing/routes';
import { LiveUnavailable } from '@/features/track/live-unavailable';
import { CONNECTION_STATUS_LABEL, currentStep, stepPath } from '@/features/track/steps';
import { liveContext } from '@/server/live.ts';
import { loadTrack } from '@/server/track/state.ts';
import { revokeConnection } from './comecar/actions';

// /app: while the first-access track is not over, everything leads back to the current step (shell
// lock, D19). At the end of the track the live analysis (Screen 4) starts: it arrives with E14, so for
// now this screen says what is connected and points to the full analysis in the demo.

export default async function AppHome() {
  const ctx = await liveContext();
  if (!ctx.ok) return <LiveUnavailable message={ctx.error.message} />;
  const { progress } = await loadTrack(ctx.value.db, ctx.value.userId);
  const current = currentStep(progress);
  if (current !== 'done') redirect(stepPath(current) as never);

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
        <p className="type-body-lg mt-8 text-foreground">
          A análise ao vivo das suas contas abre em breve. Enquanto isso, veja a análise completa da
          Marina, do extrato ao relatório para o contador.
        </p>
        <Link
          href={ROUTES.demo}
          className="mt-6 inline-flex h-14 items-center justify-center gap-2 self-start rounded-md bg-primary px-6 text-base font-medium text-primary-foreground hover:bg-primary/80"
        >
          Ver a análise da demo
          <ArrowRight className="size-4" strokeWidth={1.5} aria-hidden="true" />
        </Link>
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto max-w-[1120px] px-4 py-5 sm:px-6">
          <Disclaimer size="caption" />
        </div>
      </footer>
    </div>
  );
}
