import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/brand/logo';

// After "Apagar meus dados" (ARCHITECTURE §9.6): outside /app on purpose, so no new session cookie is minted here.

export const metadata: Metadata = {
  title: 'Dados apagados · Refund',
  robots: { index: false, follow: false },
};

export default function DataDeletedPage() {
  return (
    <main
      id="conteudo"
      className="mx-auto flex min-h-dvh max-w-[560px] flex-col justify-center gap-4 px-4"
      data-testid="data-deleted"
    >
      <Logo />
      <h1 className="type-h1 text-foreground">Pronto. Seus dados foram apagados.</h1>
      <p className="text-base text-muted-foreground">
        Apagamos a empresa vinculada, as contas, as transações, as análises, os relatórios e as
        respostas, e encerramos a sessão. Se havia uma conexão na Pluggy, pedimos que ela fosse
        removida.
      </p>
      <p className="type-small">
        <Link href="/" className="text-cobalt underline underline-offset-4">
          Voltar ao início
        </Link>{' '}
        ·{' '}
        <Link href={'/privacidade' as Route} className="text-cobalt underline underline-offset-4">
          Privacidade
        </Link>
      </p>
    </main>
  );
}
