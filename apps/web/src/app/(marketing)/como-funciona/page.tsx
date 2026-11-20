import type { Metadata } from 'next';
import { Bullets, Section, SupportPage, TextLink } from '@/features/support/page-shell';

// /como-funciona (ARCHITECTURE §7.3 and §13; EXECUTION E20, task 4): real × synthetic, the controlled pace of the demo
// analysis, what the AI may do. Every sentence maps to code: the SSE route runs the pipeline and `pace` only changes
// the wait between events (api/demo/analise, pipeline/pace.ts); /demo runs the AI port in `template` mode
// (demo/analysis.ts); model explanations in /app cross the guards of @refund/ai; citations come from the rule
// metadata (@refund/engine ref-index, @refund/law).

export const metadata: Metadata = {
  title: 'Como funciona · Refund',
  description: 'O que é real e o que é sintético no Refund, o que a IA faz e quem aprova.',
};

export default function HowItWorksPage() {
  return (
    <SupportPage
      title="Como funciona"
      lead="O que é real, o que é de teste, o que a IA faz e quem decide no fim."
      testId="how-it-works-page"
    >
      <Section title="O que é real e o que é de teste">
        <p>Real, na demonstração e no app:</p>
        <Bullets>
          <li>
            O motor de cálculo. É o mesmo código em /demo e em /app: recebe os fatos, aplica as
            regras e devolve cada valor com a conta passo a passo.
          </li>
          <li>
            As leis e as tabelas. Alíquotas, faixas e limites vêm de leis e tabelas oficiais, com a
            fonte registrada no código. O cálculo do DAS e do imposto de renda mensal é conferido
            com exemplos e tabelas oficiais, como os da Receita Federal; as outras regras são
            conferidas com casos de referência escritos a partir da lei (veja{' '}
            <TextLink href="/motor">Motor e testes</TextLink>).
          </li>
          <li>A classificação das transações e a montagem dos fatos que entram no cálculo.</li>
        </Bullets>
        <p>De teste:</p>
        <Bullets>
          <li>
            Em /demo, a pessoa, a empresa, o CNPJ e os extratos são inventados. O CNPJ da persona
            não existe na Receita.
          </li>
          <li>
            Em /app, a conexão com bancos usa só o ambiente de teste (sandbox) da Pluggy: a janela
            lista apenas bancos de teste, e se um banco real for conectado mesmo assim, a conexão é
            apagada na hora, sem copiar nenhum dado.
          </li>
          <li>
            Em /app, o CNPJ que você digita é consultado de verdade em bases públicas dos dados da
            Receita: primeiro a BrasilAPI e, se ela não responder, OpenCNPJ, CNPJá, Minha Receita,
            CNPJ.ws e ReceitaWS, uma por vez, passando à próxima quando uma não responde ou não tem
            o CNPJ. Um CNPJ consultado nos últimos 7 dias vem da cópia que guardamos.
          </li>
        </Bullets>
      </Section>

      <Section title="O ritmo é ensaiado, a conta é de verdade">
        <p>
          Na tela de análise da demonstração, os passos aparecem com pausas controladas, para dar
          tempo de ler. Só o intervalo entre um passo e outro é controlado: a cada vez que a tela
          abre, o servidor roda a análise inteira de novo (organiza as transações, classifica e
          calcula), e os números que aparecem saem do motor naquele momento.
        </p>
      </Section>

      <Section title="O que a IA faz e o que ela não faz">
        <Bullets>
          <li>
            A IA não faz conta e não escolhe artigo de lei. Todo valor sai do motor, e toda citação
            de lei vem da própria regra que gerou o valor.
          </li>
          <li>
            Ela classifica só as transações que as regras não resolveram. Se essa classificação mexe
            num valor, ela não é aplicada direto: vira uma pergunta para você confirmar.
          </li>
          <li>
            Ela escreve a explicação a partir da conta pronta. Os números e as citações são
            colocados pelo nosso código, e travas automáticas reprovam o texto se aparecer um número
            ou uma lei que não está na conta.
          </li>
          <li>
            Se a trava reprovar, se a IA falhar ou se ela estiver desligada, entra um texto-modelo
            escrito por nós, preenchido com os números da conta.
          </li>
        </Bullets>
        <p>
          Na demonstração, a IA fica desligada: as regras classificam todas as transações da persona
          e as explicações são os textos-modelo. No app, ela só entra quando está configurada.
        </p>
      </Section>

      <Section title="Quem decide é o seu contador">
        <p>
          O Refund mostra a economia com a conta aberta e a lei citada, mas não age por você. O
          relatório vai para o seu contador, que revisa, comenta e aprova antes de qualquer mudança.
          No app, ele recebe um link; na demonstração, a aprovação é simulada em outra aba.
        </p>
        <p>
          O que guardamos e como protegemos está em <TextLink href="/seguranca">Segurança</TextLink>{' '}
          e em <TextLink href="/privacidade">Privacidade</TextLink>.
        </p>
      </Section>
    </SupportPage>
  );
}
