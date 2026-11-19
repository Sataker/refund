import Link from 'next/link';
import { Logo } from './logo';

// The Portuguese 404 (UX review G2 M11): the default Next.js page is in English and leads nowhere. Every unknown URL
// offers the way back to the demo, which works without any variable.

export function NotFoundPage() {
  return (
    <main
      id="conteudo"
      data-testid="not-found"
      className="mx-auto flex min-h-dvh w-full max-w-[640px] flex-col justify-center gap-6 bg-background px-4 py-16"
    >
      <Link href="/" aria-label="Refund, página inicial" className="w-fit text-[22px]">
        <Logo />
      </Link>
      <h1 className="font-serif text-[36px] leading-[40px] font-normal text-foreground">
        Não achamos esta página.
      </h1>
      <p className="text-base text-muted-foreground">
        O endereço pode ter mudado ou ter sido digitado errado.
      </p>
      <Link
        href="/demo"
        className="type-small inline-flex min-h-11 w-fit items-center justify-center rounded-md bg-primary px-4 font-medium text-primary-foreground"
      >
        Voltar para a demo
      </Link>
    </main>
  );
}
