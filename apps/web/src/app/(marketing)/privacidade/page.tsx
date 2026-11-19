import type { Metadata, Route } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Disclaimer } from '@/components/brand/disclaimer';
import { Logo } from '@/components/brand/logo';

// /privacidade (ARCHITECTURE §9.6 "Transparency"; EXECUTION §9 E11 C4). Written from what the code does in this
// version (E14): every sentence maps to a behaviour in apps/web/src/server/** or @refund/db. Static, zero env.

export const metadata: Metadata = {
  title: 'Privacidade · Refund',
  description: 'O que o Refund guarda, por quanto tempo e como apagar.',
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="type-h4 text-foreground">{title}</h2>
      <div className="flex flex-col gap-2 text-base text-foreground">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-[1120px] items-center px-4 sm:px-6">
          <Link href="/" aria-label="Refund, página inicial" className="text-xl">
            <Logo />
          </Link>
        </div>
      </header>
      <main
        id="conteudo"
        className="mx-auto flex w-full max-w-[720px] flex-1 flex-col gap-8 px-4 py-12"
        data-testid="privacy-page"
      >
        <div className="flex flex-col gap-3">
          <h1 className="type-h1 text-foreground">Privacidade</h1>
          <p className="type-body-lg text-muted-foreground">
            O que o Refund guarda, por quanto tempo e como você apaga. Em português direto, sem
            letra miúda.
          </p>
        </div>

        <Section title="Esta versão usa só dados de teste do Open Finance">
          <p>
            Nesta versão, a conexão de contas usa apenas o ambiente de teste (sandbox) da Pluggy ou
            os dados de exemplo de uma pessoa fictícia. Nenhum banco real é conectado. Se um banco
            real for escolhido, a conexão é apagada na Pluggy na hora e nada é guardado.
          </p>
          <p>A demonstração em /demo usa só pessoas fictícias e não guarda nada no servidor.</p>
        </Section>

        <Section title="Sem cadastro: um cookie de sessão">
          <p>
            Você não cria conta. Um cookie (rf_sid), assinado e inacessível a scripts da página,
            identifica a sua sessão por até 90 dias. A preferência de tema claro ou escuro fica só
            no seu navegador.
          </p>
        </Section>

        <Section title="O que guardamos">
          <ul className="flex list-disc flex-col gap-2 pl-5">
            <li>
              Da empresa: só dados públicos do CNPJ (razão social, CNAE, regime, município, datas).
              Nunca a lista de sócios. De MEI e empresário individual, o nome vem mascarado.
            </li>
            <li>
              Suas respostas do primeiro acesso (faixa de faturamento, funcionários, receitas do
              exterior).
            </li>
            <li>
              O consentimento para ler as contas: o que você autorizou, a versão do texto e a data.
              O IP fica só como um código irreversível (HMAC), nunca em claro.
            </li>
            <li>
              Das contas conectadas: tipo, nome do produto, instituição e saldo. Das transações:
              data, valor, descrição (sem números de documento), forma de pagamento e categoria.
              CNPJ da contraparte fica em claro (é público). CPF nunca: só um código irreversível
              (HMAC) e uma máscara como ***.456.789-**. O nome da contraparte só é guardado quando
              ela é uma empresa (CNPJ).
            </li>
            <li>O identificador da conexão na Pluggy fica cifrado (AES-256-GCM).</li>
            <li>
              A análise: a classificação de cada transação, os achados com a conta e a lei citada, e
              as respostas que você deu às perguntas.
            </li>
            <li>
              Relatório para o contador: o e-mail que você digitar fica cifrado, e o link vale 30
              dias. O link em si não é guardado, só um resumo criptográfico (SHA-256) dele.
            </li>
          </ul>
        </Section>

        <Section title="Quem processa os dados">
          <ul className="flex list-disc flex-col gap-2 pl-5">
            <li>Vercel: hospeda o site.</li>
            <li>Supabase: hospeda o banco de dados (Postgres).</li>
            <li>Pluggy: faz a conexão de Open Finance (sandbox, nesta versão).</li>
            <li>
              Vercel AI Gateway com modelos da Anthropic, quando a IA está ligada: recebe a
              descrição já mascarada das transações que as regras não classificaram e o cálculo
              pronto para escrever a explicação. A IA não faz conta nem escolhe artigo de lei.
            </li>
            <li>
              Resend: envia o e-mail do relatório, só quando o envio está ligado e só para o
              endereço digitado.
            </li>
          </ul>
        </Section>

        <Section title="Por quanto tempo">
          <ul className="flex list-disc flex-col gap-2 pl-5">
            <li>Sessão sem acesso por 30 dias: apagamos tudo dela automaticamente, todo dia.</li>
            <li>
              Plano Grátis: a conexão com o banco vale 30 dias. Depois disso ela é encerrada e as
              transações copiadas são apagadas.
            </li>
            <li>
              O consentimento vale 12 meses. Depois disso ele expira e as conexões ligadas a ele são
              encerradas.
            </li>
            <li>Registros técnicos (eventos do sistema e limites de uso): 14 dias.</li>
            <li>Dados públicos de empresa que ninguém mais usa: apagados depois de 30 dias.</li>
          </ul>
        </Section>

        <Section title="Seus direitos, sem pedir a ninguém">
          <ul className="flex list-disc flex-col gap-2 pl-5">
            <li>
              Em{' '}
              <Link
                href={'/app/conta' as Route}
                className="text-cobalt underline underline-offset-4"
              >
                Conta e privacidade
              </Link>{' '}
              você vê o que está guardado e desconecta cada conta. Desconectar apaga as transações
              copiadas; desconectar a última retira o consentimento.
            </li>
            <li>
              &ldquo;Apagar meus dados&rdquo; apaga na hora a empresa vinculada, contas, transações,
              análises, relatórios e respostas, pede à Pluggy para remover a conexão e encerra a
              sessão. Fica só um registro de que houve uma exclusão, sem nenhum dado seu.
            </li>
          </ul>
        </Section>

        <Section title="Registros do sistema">
          <p>
            Os registros técnicos do servidor passam por um filtro que remove CPF, CNPJ, e-mails e
            campos como nome, documento e token antes de serem gravados.
          </p>
        </Section>

        <Disclaimer />
      </main>
    </div>
  );
}
