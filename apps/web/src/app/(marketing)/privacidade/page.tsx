import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { Bullets, Section, SupportPage } from '@/features/support/page-shell';
import { CONTACT_EMAIL } from '@/lib/contact';

// /privacidade (ARCHITECTURE §9.6 "Transparency"; EXECUTION §9 E11 C4; compliance review E14). Written from what the
// code does: every sentence maps to a behaviour in apps/web/src/server/** or @refund/db. Static, zero env.

export const metadata: Metadata = {
  title: 'Privacidade · Refund',
  description: 'O que o Refund guarda, por quanto tempo e como apagar.',
};

export default function PrivacyPage() {
  return (
    <SupportPage
      title="Privacidade"
      lead="O que o Refund guarda, por quanto tempo e como você apaga. Em português direto, sem letra miúda."
      testId="privacy-page"
    >
      <Section title="Quem cuida dos seus dados">
        <p>
          O Refund, projeto de Enzo Vaccaro para o Hack Brasil 2026. Contato:{' '}
          <span data-testid="contact-email">{CONTACT_EMAIL}</span>.
        </p>
        <p>
          Usamos os dados só para calcular a economia de imposto que você vê e gerar o relatório
          para o seu contador. Base legal: o seu consentimento (LGPD, art. 7º, I), que você retira
          quando quiser.
        </p>
      </Section>

      <Section title="Esta versão usa só dados de teste do Open Finance">
        <p>
          Nesta versão, a conexão de contas usa apenas o ambiente de teste (sandbox) da Pluggy ou os
          dados de exemplo de uma pessoa fictícia. A janela de conexão lista apenas bancos de teste.
          Se um banco real for escolhido, pedimos na hora à Pluggy que apague a conexão e não
          guardamos nada dela; se a Pluggy não confirmar na hora, guardamos só o identificador
          cifrado até ela confirmar a remoção.
        </p>
        <p>
          A demonstração em /demo usa só pessoas fictícias e não guarda nada no servidor: as
          respostas que você testar lá ficam só no seu navegador.
        </p>
      </Section>

      <Section title="Sem cadastro: um cookie de sessão">
        <p>
          Você não cria conta. Um cookie (rf_sid), assinado e inacessível a scripts da página,
          identifica a sua sessão por até 90 dias.
        </p>
        <p>
          No seu navegador ficam só a preferência de tema claro ou escuro e, enquanto a aba está
          aberta, até onde a análise já foi mostrada.
        </p>
      </Section>

      <Section title="O que guardamos">
        <Bullets>
          <li>
            Da empresa: só dados públicos do CNPJ (razão social, nome fantasia, CNAE, porte,
            natureza jurídica, regime, UF, município, datas). Nunca a lista de sócios. De MEI e
            empresário individual, o nome vem mascarado.
          </li>
          <li>
            Suas respostas do primeiro acesso (faixa de faturamento, funcionários, receitas do
            exterior).
          </li>
          <li>
            O consentimento para ler as contas: o que você autorizou, a versão do texto e a data. O
            IP fica só como um código de mão única feito com uma chave secreta (HMAC), nunca em
            claro.
          </li>
          <li>Das conexões: o nome do banco, a situação e as datas.</li>
          <li>Das contas: tipo, nome do produto, instituição, moeda e saldo.</li>
          <li>
            Das transações: data, valor, descrição (sem números de documento), forma de pagamento,
            categoria e, nas compras no cartão, o código do tipo de loja (MCC) e as parcelas. CNPJ e
            CNAE da contraparte ficam em claro (são públicos). CPF nunca: só um código de mão única
            feito com uma chave secreta (HMAC) e uma máscara como ***.456.789-**. O nome da
            contraparte só é guardado quando ela é uma empresa (CNPJ).
          </li>
          <li>O identificador da conexão na Pluggy fica cifrado (AES-256-GCM).</li>
          <li>
            A análise: a classificação de cada transação, os achados com a conta e a lei citada, as
            respostas que você deu às perguntas, as cobranças repetidas que você tirou em Finanças e
            o registro do andamento da análise, com até 8 exemplos de transações já mascarados.
          </li>
          <li>
            Relatório para o contador: o e-mail que você digitar fica cifrado (e como código HMAC).
            A mensagem que você escrever fica guardada como está e aparece para quem abrir o link. A
            resposta do contador (aprovação e comentários) também fica guardada. O link vale 30
            dias; o link em si não é guardado, só um resumo criptográfico (SHA-256) dele.
          </li>
          <li>
            Lista de espera (página inicial): se você deixou o e-mail, ele fica cifrado (e como
            código HMAC), com a resposta “tem CNPJ?”, a página de onde veio e a data do aceite, só
            para avisar quando a lista abrir. Para sair, escreva para {CONTACT_EMAIL}; apagamos a
            lista até 12/03/2027.
          </li>
        </Bullets>
      </Section>

      <Section title="Quem processa os dados">
        <Bullets>
          <li>Vercel: hospeda o site.</li>
          <li>Supabase: hospeda o banco de dados (Postgres).</li>
          <li>Pluggy: faz a conexão de Open Finance (sandbox, nesta versão).</li>
          <li>
            BrasilAPI, OpenCNPJ, CNPJá, Minha Receita, CNPJ.ws e ReceitaWS: consultamos nessas bases
            públicas o CNPJ que você digita, uma por vez, passando à próxima quando uma não responde
            ou não tem o CNPJ. Elas recebem só o número do CNPJ.
          </li>
          <li>
            Vercel AI Gateway com modelos da Anthropic, quando a IA está ligada: recebe a descrição
            já mascarada das transações que as regras não classificaram e o cálculo pronto para
            escrever a explicação. A IA não faz conta nem escolhe artigo de lei.
          </li>
          <li>
            Resend: envia o e-mail do relatório, só quando o envio está ligado e só para o endereço
            digitado.
          </li>
        </Bullets>
      </Section>

      <Section title="Por quanto tempo">
        <Bullets>
          <li>
            Se a sessão ficar 30 dias sem acesso, apagamos tudo dela automaticamente (a limpeza roda
            todo dia).
          </li>
          <li>
            Plano Grátis: a conexão com o banco vale 30 dias. Depois disso ela é encerrada e as
            transações copiadas são apagadas, com os exemplos delas no registro da análise (as
            análises já feitas continuam até você apagar seus dados).
          </li>
          <li>
            O consentimento vale 12 meses. Depois disso ele expira e as conexões ligadas a ele são
            encerradas.
          </li>
          <li>
            Registros técnicos: eventos do sistema e limites de uso, 14 dias; cópia dos dados
            públicos de CNPJ consultados, até 14 dias; avisos recebidos da Pluggy, 30 dias (depois
            fica só o tipo, a data e o identificador do aviso).
          </li>
          <li>Dados públicos de empresa que ninguém mais usa: apagados depois de 30 dias.</li>
        </Bullets>
      </Section>

      <Section title="Seus direitos, sem pedir a ninguém">
        <Bullets>
          <li>
            Em{' '}
            <Link href={'/app/conta' as Route} className="text-cobalt underline underline-offset-4">
              Conta e privacidade
            </Link>{' '}
            você vê um resumo do que está guardado e desconecta cada conta. Desconectar apaga as
            transações copiadas daquela conta (as análises já feitas continuam até você apagar seus
            dados); desconectar a última retira o consentimento.
          </li>
          <li>
            &ldquo;Apagar meus dados&rdquo; apaga na hora contas, transações, análises, relatórios,
            respostas e os dados públicos da empresa vinculada (se nenhuma outra sessão usa o mesmo
            CNPJ), pede à Pluggy para remover a conexão, se houver, e encerra a sessão. Fica só um
            registro de que houve uma exclusão, sem nenhum dado seu.
          </li>
          <li>Para qualquer outro pedido, escreva para {CONTACT_EMAIL}.</li>
        </Bullets>
      </Section>

      <Section title="Registros do sistema">
        <p>
          Os registros que o nosso código grava passam por um filtro que remove CPF, CNPJ, e-mails e
          campos como nome, documento e token. A Vercel também mantém, por até 1 hora, o registro
          padrão de cada acesso (endereço da página e IP).
        </p>
      </Section>
    </SupportPage>
  );
}
