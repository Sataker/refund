import type { Metadata } from 'next';
import { ENGINE_STATS } from '@/features/engine-page/stats.generated';
import { RULE_NAMES } from '@/features/law/alert-model';
import { Bullets, Section, SupportPage, TextLink } from '@/features/support/page-shell';

// /motor (IDENTITY-AND-UI §5.14; ARCHITECTURE §13; EXECUTION E20, task 4). Every number comes from
// stats.generated.ts, written by scripts/generate-engine-page.ts from a real run of the golden project and checked
// against the repository by scripts/test/engine-page.unit.test.ts. Nothing here is typed by hand.

export const metadata: Metadata = {
  title: 'Motor e testes · Refund',
  description: 'As regras do motor de cálculo do Refund e os testes que conferem cada uma.',
};

const S = ENGINE_STATS;
const fmt = (n: number) => n.toLocaleString('pt-BR');
const plural = (n: number, one: string, many: string) => `${fmt(n)} ${n === 1 ? one : many}`;

const GROUPS = [
  {
    key: 'oracle',
    label: 'Conferência com fontes oficiais',
    text: 'O motor refaz exemplos publicados pela Receita Federal e pelo governo federal (manual do PGDAS-D, exemplos da Lei 15.270, tabela do simulador de IR) e precisa chegar ao mesmo centavo. Um dos exemplos vem de fonte secundária (COAD). Onde as fontes oficiais divergem entre si ou têm erro de impressão, a escolha e o motivo ficam registrados no próprio teste.',
  },
  {
    key: 'golden',
    label: 'Casos de referência das regras',
    text: 'Para cada regra, casos com o valor esperado calculado à mão a partir da lei, incluindo as fronteiras (por exemplo, Fator R em 27,99% e em 28%).',
  },
  {
    key: 'property',
    label: 'Propriedades',
    text: 'De 25 a 200 entradas geradas ao acaso em cada teste (até 1.000 na integração contínua): imposto nunca negativo, mais receita nunca reduz o DAS, todo valor é um número inteiro de centavos.',
  },
  {
    key: 'invariant',
    label: 'Invariantes da análise completa',
    text: 'Na análise da persona de ponta a ponta: a soma das economias é igual ao total, sem contar nada duas vezes.',
  },
] as const;

function Stat({ value, label, testId }: { value: number; label: string; testId: string }) {
  return (
    <div className="flex flex-col gap-1 bg-background p-5">
      <dt className="type-small text-muted-foreground">{label}</dt>
      <dd className="type-h2 num text-foreground" data-testid={testId} data-count={value}>
        {fmt(value)}
      </dd>
    </div>
  );
}

export default function EnginePage() {
  return (
    <SupportPage
      title="Motor e testes"
      lead="O motor é o código que faz todas as contas do Refund. Os números desta página são contados direto do repositório, rodando os testes."
      testId="engine-page"
      disclaimer={false}
    >
      <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
        <Stat value={S.rules.length} label="regras no motor" testId="engine/rules" />
        <Stat value={S.totals.passed} label="testes do motor passando" testId="engine/tests" />
        <Stat
          value={S.totals.oracle}
          label="testes de conferência com fontes publicadas"
          testId="engine/oracle-tests"
        />
      </dl>

      <Section title="Como o motor trabalha">
        <Bullets>
          <li>
            Ele não acessa a internet, banco de dados nem IA. Recebe os fatos e as tabelas da lei e
            devolve cada valor com a conta passo a passo.
          </li>
          <li>
            Dinheiro é sempre um número inteiro de centavos; as contas intermediárias usam
            aritmética decimal exata, sem os arredondamentos escondidos do ponto flutuante.
          </li>
          <li>
            A mesma entrada dá sempre a mesma saída, e o mesmo código roda no servidor e no seu
            navegador (é ele que recalcula quando você mexe num controle).
          </li>
          <li>
            Cada citação de lei vem da própria regra, e um teste confere que todo artigo citado
            existe no acervo de leis do Refund.
          </li>
        </Bullets>
      </Section>

      <Section title="As regras">
        <div className="overflow-x-auto">
          <table className="w-full text-left" data-testid="engine/rules-table">
            <thead>
              <tr className="type-small border-b border-border text-muted-foreground">
                <th scope="col" className="py-2 pr-4 font-normal">
                  Regra
                </th>
                <th scope="col" className="py-2 pr-4 font-normal">
                  Código
                </th>
                <th scope="col" className="py-2 text-right font-normal">
                  Referências legais
                </th>
              </tr>
            </thead>
            <tbody>
              {S.rules.map((r) => (
                <tr key={r.id} className="border-b border-border">
                  <td className="py-2 pr-4">{RULE_NAMES[r.id] ?? r.id}</td>
                  <td className="whitespace-nowrap py-2 pr-4 font-mono text-muted-foreground">
                    {r.id}
                  </td>
                  <td className="num py-2 text-right">{fmt(r.refs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Os testes">
        <dl className="flex flex-col gap-4">
          {GROUPS.map((g) => (
            <div key={g.key} className="flex flex-col gap-1">
              <dt className="flex items-baseline justify-between gap-4">
                <span className="font-medium">{g.label}</span>
                <span className="num" data-testid={`engine/group-${g.key}`}>
                  {fmt(S.totals[g.key])}
                </span>
              </dt>
              <dd className="type-small text-muted-foreground">{g.text}</dd>
            </div>
          ))}
        </dl>
        <p className="type-small text-muted-foreground">
          {S.totals.todo > 0
            ? `${plural(S.totals.todo, 'caso marcado como pendente', 'casos marcados como pendentes')}, sem código ainda, fora da contagem. `
            : ''}
          Fontes registradas para a conferência:{' '}
          {plural(S.oracleSources.primary, 'primária', 'primárias')} e{' '}
          {plural(S.oracleSources.secondary, 'secundária', 'secundárias')}.
        </p>
      </Section>

      <Section title="De onde vêm estes números">
        <p>
          O script scripts/generate-engine-page.ts roda os testes do motor e grava as contagens. Um
          teste automático falha se algum arquivo de teste mudar sem que a contagem seja refeita.
          Motor versão {S.engineVersion}, parâmetros {S.parametersVersion}, impressão digital dos
          testes <span className="font-mono">{S.inputsHash.slice(0, 12)}</span>.
        </p>
        <p>
          O que é real e o que é de teste no Refund está em{' '}
          <TextLink href="/como-funciona">Como funciona</TextLink>.
        </p>
      </Section>
    </SupportPage>
  );
}
