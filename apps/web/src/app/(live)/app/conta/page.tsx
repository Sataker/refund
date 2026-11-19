import { schema } from '@refund/db';
import { count, eq } from 'drizzle-orm';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { Disclaimer } from '@/components/brand/disclaimer';
import { Logo } from '@/components/brand/logo';
import { SandboxSeal } from '@/components/brand/sandbox-seal';
import { DisconnectButton } from '@/features/connection/disconnect-button.client';
import { DeleteData } from '@/features/live/delete-data.client';
import { LiveUnavailable } from '@/features/track/live-unavailable';
import { CONNECTION_STATUS_LABEL } from '@/features/track/steps';
import { activePlanWith } from '@/server/entitlements.ts';
import { liveContext } from '@/server/live.ts';
import { activeConsent, loadTrack } from '@/server/track/state.ts';
import { revokeConnection } from '../comecar/actions';
import { deleteMyData } from './actions';

// /app/conta (ARCHITECTURE §13 "Account and LGPD"; §9.6): what we keep about this session, how to disconnect each
// account (consent revocation) and "Apagar meus dados" (deleteMyData). Nothing here needs a login.

export const metadata: Metadata = {
  title: 'Conta e privacidade · Refund',
  robots: { index: false },
};

const DATE = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'long' });

export default async function AccountPage() {
  const ctx = await liveContext();
  if (!ctx.ok) return <LiveUnavailable message={ctx.error.message} />;
  const { db, userId } = ctx.value;
  const { progress } = await loadTrack(db, userId);
  const consent = await activeConsent(db, userId);
  const [consentRow] = consent
    ? await db
        .select({ grantedAt: schema.consents.grantedAt })
        .from(schema.consents)
        .where(eq(schema.consents.id, consent.id))
    : [];
  const [analyses] = await db
    .select({ n: count() })
    .from(schema.analyses)
    .where(eq(schema.analyses.userId, userId));
  const { plan } = await activePlanWith(db, userId);
  const accounts = [
    { holder: 'PJ', label: 'Conta da empresa', conn: progress.pj },
    { holder: 'PF', label: 'Sua conta pessoal', conn: progress.pf },
  ] as const;

  return (
    <div className="flex min-h-dvh flex-col bg-background" data-testid="account-page">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-[1120px] items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="Refund, página inicial" className="text-xl">
            <Logo />
          </Link>
          <SandboxSeal live className="hidden sm:inline-flex" />
        </div>
      </header>
      <main
        id="conteudo"
        className="mx-auto flex w-full max-w-[640px] flex-1 flex-col gap-8 px-4 py-10"
      >
        <div className="flex flex-col gap-2">
          <h1 className="type-h1 text-foreground">Conta e privacidade</h1>
          <p className="text-base text-muted-foreground">
            Você usa o Refund sem cadastro: um cookie desta navegação identifica sua sessão. Plano:{' '}
            {plan === 'free' ? 'Grátis' : plan}.
          </p>
        </div>

        <section aria-labelledby="dados-titulo" className="flex flex-col gap-3">
          <h2 id="dados-titulo" className="type-h4 text-foreground">
            O que guardamos desta sessão
          </h2>
          <ul className="type-small flex list-disc flex-col gap-1.5 pl-5 text-foreground">
            <li>
              Empresa: {progress.company?.displayName ?? 'nenhuma'} (dados públicos do CNPJ, sem a
              lista de sócios).
            </li>
            <li>
              Consentimento para ler as contas:{' '}
              {consentRow ? `dado em ${DATE.format(consentRow.grantedAt)}` : 'nenhum em vigor'}.
            </li>
            <li>Análises feitas: {analyses?.n ?? 0}.</li>
          </ul>
          <ul className="flex flex-col gap-3">
            {accounts.map(({ holder, label, conn }) => (
              <li
                key={holder}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4"
              >
                <span className="type-small font-medium text-foreground">{label}</span>
                <span className="type-small num text-muted-foreground">
                  {conn
                    ? `${CONNECTION_STATUS_LABEL[conn.status]} · ${conn.transactions} transações`
                    : 'não conectada'}
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
          <p className="type-caption text-muted-foreground">
            Desconectar apaga as transações copiadas daquela conta. Desconectar a última conta
            retira o consentimento.
          </p>
        </section>

        <section
          aria-labelledby="apagar-titulo"
          className="flex flex-col gap-3 rounded-lg border border-risk/40 p-5"
        >
          <h2 id="apagar-titulo" className="type-h4 text-foreground">
            Apagar meus dados
          </h2>
          <p className="type-small text-muted-foreground">
            Apaga agora a empresa vinculada, as contas e transações copiadas, as análises, os
            relatórios e as respostas. Pedimos à Pluggy para remover a conexão. Não dá para
            desfazer.
          </p>
          <DeleteData remove={deleteMyData} />
        </section>

        <p className="type-small">
          <Link href={'/privacidade' as Route} className="text-cobalt underline underline-offset-4">
            Como tratamos seus dados
          </Link>{' '}
          ·{' '}
          <Link href={'/app' as Route} className="text-cobalt underline underline-offset-4">
            Voltar
          </Link>
        </p>
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto max-w-[1120px] px-4 py-5 sm:px-6">
          <Disclaimer size="caption" />
        </div>
      </footer>
    </div>
  );
}
