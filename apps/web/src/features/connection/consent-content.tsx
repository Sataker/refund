import { Check, RotateCcw, ShieldCheck, X } from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';

// Screen 2 (IDENTITY-AND-UI §5): what we will read and what we never do, in the language of the Open
// Finance Brasil experience guide. The version of this text is TERMS_VERSION (consents.terms_version).

interface Block {
  id: string;
  title: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  tone: string;
  items: string[];
}

const BLOCKS: Block[] = [
  {
    id: 'read',
    title: 'Vamos ler',
    Icon: Check,
    tone: 'text-success',
    items: [
      'Extratos da conta PJ e da PF dos últimos 12 meses',
      'Saldos',
      'Dados cadastrais da conta',
    ],
  },
  {
    id: 'never',
    title: 'Nunca vamos',
    Icon: X,
    tone: 'text-risk',
    items: [
      'Movimentar dinheiro ou fazer Pix',
      'Ver a sua senha do banco',
      'Vender ou compartilhar os seus dados',
    ],
  },
  {
    id: 'control',
    title: 'Você controla',
    Icon: RotateCcw,
    tone: 'text-cobalt',
    items: [
      'Desconecta quando quiser, em um toque, na tela da conta ou no fim do cadastro',
      'Ao desconectar, apagamos na hora o extrato copiado e o consentimento deixa de valer',
    ],
  },
];

export function ConsentContent() {
  return (
    <div className="flex flex-col gap-6" data-testid="consent">
      <p
        className="type-small rounded-lg border border-border bg-surface px-4 py-3 text-foreground"
        data-testid="sandbox-notice"
      >
        Nesta versão, a conexão usa o ambiente de testes da Pluggy (sandbox): a janela lista apenas
        bancos de teste, e se um banco real for conectado mesmo assim, a conexão é apagada na hora.
      </p>
      {BLOCKS.map(({ id, title, Icon, tone, items }) => (
        <section key={id} aria-labelledby={`consent-${id}`}>
          <h2 id={`consent-${id}`} className="type-h4 flex items-center gap-2 text-foreground">
            <Icon className={`size-5 ${tone}`} strokeWidth={2} aria-hidden="true" />
            {title}
          </h2>
          <ul className="mt-2 flex flex-col gap-1.5 pl-7">
            {items.map((item) => (
              <li key={item} className="type-body-lg text-muted-foreground">
                {item}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <details className="rounded-lg border border-border bg-surface">
        <summary className="type-small cursor-pointer px-4 py-3 font-medium text-foreground">
          Por que a conta PF também?
        </summary>
        <p className="type-small border-t border-border px-4 py-3 text-muted-foreground">
          Pró-labore e dividendos ligam as duas contas. Sem a PF, a conta do pró-labore fica
          estimada.
        </p>
      </details>
      <p className="type-small inline-flex items-center gap-2 self-start rounded-full border border-border bg-surface px-3 py-1.5 text-muted-foreground">
        <ShieldCheck className="size-4" strokeWidth={1.5} aria-hidden="true" />
        Open Finance Brasil · regulado pelo Banco Central
      </p>
    </div>
  );
}
