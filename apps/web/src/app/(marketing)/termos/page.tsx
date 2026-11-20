import type { Metadata } from 'next';
import { Bullets, Section, SupportPage, TextLink } from '@/features/support/page-shell';
import { CONTACT_CITY, CONTACT_EMAIL } from '@/lib/contact';
import { plansModel } from '@/server/plans/offer';

// /termos (ARCHITECTURE §13; EXECUTION E20, task 4): plain terms for the hackathon MVP. Nothing here promises more than
// the code does: the disclaimer of every R$ (components/brand/disclaimer.tsx), the sandbox (server/connection), the
// Pix grant without renewal and the guarantee (server/plans/offer.ts, features/plans), the MIT LICENSE. D37 (PLAN §18)
// set the payment terms: the guarantee refund cancels the period (refundCharge), the CDC art. 49 withdrawal and the
// refund of the unused part are commitments Enzo settles by hand, and the identification carries no CPF.

export const metadata: Metadata = {
  title: 'Termos · Refund',
  description: 'Termos de uso do Refund, em português direto.',
};

export default function TermsPage() {
  const { guaranteeDays, refundWithinDays, withdrawalDays } = plansModel();
  return (
    <SupportPage
      title="Termos de uso"
      lead="As regras para usar o Refund, sem letra miúda. Ao usar o site, você concorda com elas."
      testId="terms-page"
      disclaimer={false}
    >
      <Section title="Quem somos">
        <p>
          O Refund é um projeto de Enzo Vaccaro, feito para o Hack Brasil 2026. É uma primeira
          versão (MVP): pode mudar, ter erros ou sair do ar. Contato:{' '}
          <span data-testid="contact-email">{CONTACT_EMAIL}</span>.
        </p>
      </Section>

      <Section title="Não é consultoria">
        <p>
          O Refund mostra oportunidades de planejamento tributário lícito, com base na lei vigente,
          com a conta aberta e o artigo citado. Ele não é consultoria tributária, contábil nem
          jurídica, e não age por você: nenhum pedido é feito à Receita ou a qualquer órgão pelo
          Refund.
        </p>
      </Section>

      <Section title="Todo valor é uma estimativa">
        <Bullets>
          <li>
            Os valores são estimativas informativas. Eles dependem dos dados lidos e das respostas
            que você dá, e podem mudar quando a lei muda.
          </li>
          <li>
            Valide com o seu contador antes de agir. O relatório existe para isso: ele revisa e
            aprova antes de qualquer mudança.
          </li>
          <li>
            Não garantimos que você vai economizar o valor mostrado, nem que a Receita vai aceitar
            um pedido de restituição.
          </li>
        </Bullets>
      </Section>

      <Section title="Dados de teste">
        <Bullets>
          <li>Em /demo, pessoas, empresas, CNPJs e extratos são inventados.</li>
          <li>
            Em /app, a conexão com bancos usa só o ambiente de teste (sandbox) da Pluggy: a janela
            lista apenas bancos de teste, e se um banco real for conectado mesmo assim, a conexão é
            apagada na hora, sem copiar nenhum dado.
          </li>
        </Bullets>
      </Section>

      <Section title="Planos e pagamento">
        <Bullets>
          <li>
            Um pagamento por Pix libera o plano pelo período mostrado na tela de planos, sem
            renovação automática.
          </li>
          <li data-testid="terms-guarantee">
            Garantia de {guaranteeDays} dias a partir do pagamento: devolvemos o primeiro pagamento,
            sem perguntas, por Pix, em até {refundWithinDays} dias depois do pedido; o plano termina
            quando o valor é devolvido. É só pedir em {CONTACT_EMAIL}.
          </li>
          <li data-testid="terms-withdrawal">
            Em qualquer pagamento, você também pode desistir em até {withdrawalDays} dias e receber
            tudo de volta (Código de Defesa do Consumidor, art. 49).
          </li>
          <li>
            Se o Refund sair do ar de vez durante um período pago, devolvemos a parte que faltava.
          </li>
          <li>Na demonstração, o pagamento é simulado: nenhum dinheiro de verdade.</li>
          <li data-testid="terms-identification">
            Responsável: Enzo Vaccaro, {CONTACT_CITY}, contato: {CONTACT_EMAIL}.
          </li>
        </Bullets>
      </Section>

      <Section title="Sem garantia de funcionamento">
        <p>
          O Refund é oferecido como está. Fazemos o possível para que ele funcione e para que as
          contas estejam certas, e o cálculo do DAS e do imposto de renda mensal é conferido com
          exemplos oficiais (veja <TextLink href="/motor">Motor e testes</TextLink>), mas não
          garantimos que o serviço fique no ar o tempo todo nem que esteja livre de erros.
        </p>
      </Section>

      <Section title="Seus dados e o código">
        <p>
          O que guardamos, por quanto tempo e como apagar está em{' '}
          <TextLink href="/privacidade">Privacidade</TextLink>; como protegemos, em{' '}
          <TextLink href="/seguranca">Segurança</TextLink>. O código do Refund é distribuído sob a
          licença MIT.
        </p>
      </Section>
    </SupportPage>
  );
}
