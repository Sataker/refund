import type { Metadata } from 'next';
import { Bullets, Section, SupportPage, TextLink } from '@/features/support/page-shell';

// /seguranca (ARCHITECTURE §9, §6 and §13; IDENTITY-AND-UI §5.14; EXECUTION E20, task 4). Every sentence maps to code:
// sandbox-only connectors and the real-bank purge (server/connection/connections.ts), CPF as HMAC + mask
// (@refund/sources pii), the CNPJ whitelist without QSA (@refund/sources cnpj/whitelist.ts), AES-256-GCM and sha256
// tokens (server/crypto.ts, report/report.ts, waitlist.ts), the rf_sid cookie (server/session-cookie.ts), the webhook
// verifiers (server/webhooks/*), the headers (server/headers.ts), log redaction (server/log.ts), rate limits
// (server/rate-limit.ts), the repository guards (scripts/pii-guard.ts, gitleaks in ci.yml).

export const metadata: Metadata = {
  title: 'Segurança · Refund',
  description: 'O que o Refund lê, como protege e o que nunca guarda.',
};

export default function SecurityPage() {
  return (
    <SupportPage
      title="Segurança"
      lead="O que lemos, o que nunca guardamos e como cada dado é protegido. Tudo aqui descreve o que o código faz hoje."
      testId="security-page"
      disclaimer={false}
    >
      <Section title="Em resumo">
        <Bullets>
          <li>
            Nenhum banco real: só o ambiente de teste da Pluggy. A demonstração usa pessoas e
            empresas inventadas.
          </li>
          <li>
            CPF, IP e lista de sócios nunca ficam guardados em claro; o que é sensível fica cifrado.
          </li>
          <li>
            Quem vê seus dados: você, pela sua sessão. O seu contador (ou quem tiver o link que você
            mandar) vê só aquele relatório. Não existe tela de administração; quem opera o banco de
            dados do projeto tem acesso técnico a ele.
          </li>
        </Bullets>
      </Section>

      <Section title="Só dados de teste do Open Finance">
        <Bullets>
          <li>
            A conexão com bancos usa só o ambiente de teste (sandbox) da Pluggy. A janela de conexão
            lista apenas bancos de teste; se a lista de teste não vier, a janela não abre.
          </li>
          <li>
            Se mesmo assim um banco real for conectado, pedimos na hora à Pluggy que apague a
            conexão e não copiamos nenhum dado dela. Se a Pluggy não confirmar na hora, guardamos só
            o identificador cifrado até ela confirmar a remoção.
          </li>
          <li>
            A senha do banco é digitada na janela da própria Pluggy. Ela não passa pelo Refund.
          </li>
          <li>
            A demonstração em /demo usa só pessoas e empresas inventadas, funciona sem banco de
            dados e não chama nenhum serviço externo. Os testes automáticos falham se ela tentar.
          </li>
        </Bullets>
      </Section>

      <Section title="O que nunca guardamos em claro">
        <Bullets>
          <li>
            CPF: só um código de mão única feito com uma chave secreta (HMAC) e uma máscara como
            ***.456.789-**.
          </li>
          <li>
            Lista de sócios da empresa: nunca. Os dados públicos do CNPJ passam por uma lista de
            campos permitidos antes de serem guardados, e os sócios não estão nela. De MEI e
            empresário individual, o nome vem mascarado.
          </li>
          <li>
            Seu IP: no banco de dados, nos limites de uso e no registro do consentimento, ele fica
            só como um código HMAC.
          </li>
          <li>
            O link de aprovação do contador: guardamos só um resumo criptográfico (SHA-256) dele.
          </li>
        </Bullets>
      </Section>

      <Section title="O que guardamos cifrado">
        <p>Com AES-256-GCM, usando uma chave que fica só nas variáveis de ambiente do servidor:</p>
        <Bullets>
          <li>o identificador da conexão na Pluggy, que dá acesso aos dados do banco;</li>
          <li>o e-mail do contador que você digita no relatório;</li>
          <li>o e-mail deixado na lista de espera.</li>
        </Bullets>
      </Section>

      <Section title="Sessão e navegador">
        <Bullets>
          <li>
            Sem senha e sem cadastro: um cookie de sessão (rf_sid) assinado com HMAC-SHA256,
            inacessível a scripts da página, enviado só por HTTPS e válido por até 90 dias.
          </li>
          <li>
            Uma política de segurança de conteúdo (CSP) limita de onde a página carrega scripts,
            imagens e janelas: só do próprio site, com exceção da janela de conexão da Pluggy. Os
            scripts escritos dentro da própria página são permitidos, para que as páginas possam ser
            estáticas.
          </li>
          <li>
            O site não pode ser aberto dentro de outro site (contra cliques disfarçados), pede ao
            navegador que use sempre HTTPS e bloqueia câmera, microfone e localização.
          </li>
        </Bullets>
      </Section>

      <Section title="Avisos que chegam de fora">
        <Bullets>
          <li>
            Pagamentos (AbacatePay) e mudanças de lei (Firecrawl): cada aviso precisa vir com uma
            assinatura HMAC-SHA256 do conteúdo, conferida antes de qualquer ação. O de pagamento
            também precisa trazer um segredo combinado, que é o que prova a origem.
          </li>
          <li>
            Pluggy, que não assina os avisos: conferimos um segredo combinado e o identificador da
            nossa conta. O aviso serve só de sinal: os dados são buscados de novo na Pluggy, com a
            nossa chave, antes de qualquer mudança.
          </li>
          <li>
            Toda comparação de segredo é feita em tempo constante, e cada aviso é processado uma vez
            só, mesmo se chegar repetido.
          </li>
        </Bullets>
      </Section>

      <Section title="Registros, limites e código">
        <Bullets>
          <li>
            Os registros que o nosso código grava passam por um filtro que remove CPF, CNPJ, e-mails
            e campos como nome, documento e token.
          </li>
          <li>
            Consultas de CNPJ, conexões, análises, envios de relatório e pagamentos têm limite de
            uso por sessão ou por IP.
          </li>
          <li>
            A cada mudança no código, verificações automáticas procuram CPF, lista de sócios e
            segredos no repositório, e falham se acharem. As automações do repositório só podem ler
            o código: nenhuma consegue alterá-lo. A única que mexe no banco de produção (migração)
            roda à mão, com aprovação.
          </li>
        </Bullets>
      </Section>

      <Section title="Como você revoga">
        <p>
          Em <TextLink href="/app/conta">Conta e privacidade</TextLink> você desconecta cada conta
          ou apaga todos os seus dados de uma vez. Os detalhes de o que guardamos e por quanto tempo
          estão em <TextLink href="/privacidade">Privacidade</TextLink>.
        </p>
      </Section>
    </SupportPage>
  );
}
