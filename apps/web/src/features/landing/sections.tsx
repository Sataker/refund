import {
  ArrowRight,
  BadgeCheck,
  FileCheck2,
  Landmark,
  Link2,
  Play,
  Scale,
  ShieldCheck,
  Undo2,
  UserRoundCheck,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { joinWaitlist } from '@/app/(marketing)/actions';
import { CalcTrace } from '@/components/brand/calc-trace';
import { ConfidenceBadge } from '@/components/brand/confidence-badge';
import { DISCLAIMER_TEXT } from '@/components/brand/disclaimer';
import { Highlight } from '@/components/brand/highlight';
import { LawSeal } from '@/components/brand/law-seal';
import { Logo } from '@/components/brand/logo';
import { SandboxSeal } from '@/components/brand/sandbox-seal';
import { ThemeToggle } from '@/components/brand/theme-toggle.client';
import { formatBRLWhole } from '@/lib/format';
import { cn } from '@/lib/utils';
import { CnpjForm } from './cnpj-form.client';
import { fatorRProvision, hero, heroR01Trace, lawChanges, lawProvisionCount } from './hero-data';
import { HeroMockup } from './hero-mockup';
import { ROUTES } from './routes';
import { WaitlistForm } from './waitlist-form.client';

/** §4.6: landing container 1280, 1px vertical "ledger" lines at its edges, 1px rule between sections. */
function Section({
  id,
  className,
  inner,
  children,
  labelledBy,
}: {
  id?: string;
  className?: string;
  inner?: string;
  children: ReactNode;
  labelledBy?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cn('border-t border-border', className)}
    >
      <div
        className={cn(
          'mx-auto max-w-[1280px] border-border px-4 py-16 sm:px-6 lg:border-x lg:px-12 lg:py-24',
          inner,
        )}
      >
        {children}
      </div>
    </section>
  );
}

function DemoLink({ className }: { className?: string }) {
  return (
    <Link
      href={ROUTES.demo}
      data-testid="landing/demo-link"
      className={cn(
        'type-small inline-flex min-h-11 items-center gap-2 font-medium text-cobalt underline-offset-4 hover:underline',
        className,
      )}
    >
      <span className="flex size-6 items-center justify-center rounded-full border border-current">
        <Play className="size-3 fill-current" strokeWidth={1.5} aria-hidden="true" />
      </span>
      Ver demo com a {hero.firstName}, dev que exporta
    </Link>
  );
}

export function SiteHeader() {
  return (
    <header className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 border-border px-4 py-4 sm:px-6 lg:border-x lg:px-12">
      <Link
        href="/"
        aria-label="Refund, página inicial"
        className="inline-flex min-h-11 items-center rounded-sm text-[26px]"
      >
        <Logo descriptor />
      </Link>
      <nav aria-label="Principal" className="flex items-center gap-1 sm:gap-6">
        <a
          href="#como-funciona"
          className="type-small hidden text-muted-foreground hover:text-foreground md:inline"
        >
          Como funciona
        </a>
        <a
          href="#seguranca"
          className="type-small hidden text-muted-foreground hover:text-foreground md:inline"
        >
          Segurança
        </a>
        <a
          href="#perguntas"
          className="type-small hidden text-muted-foreground hover:text-foreground md:inline"
        >
          Perguntas
        </a>
        <Link
          href={ROUTES.demo}
          className="type-small inline-flex h-11 items-center rounded-md border border-strong-border bg-surface px-4 font-medium text-foreground transition-colors duration-(--dur-fast) hover:bg-muted"
        >
          Ver demo
        </Link>
      </nav>
    </header>
  );
}

/** Bug bash 20/11 (H6): the live product reads a real company's public data with example statements. */
const LANDING_SEAL = 'Dados públicos da Receita · extrato de exemplo';

const PILLS = [
  { icon: Scale, text: 'Lei citada em cada centavo' },
  { icon: Link2, text: 'PF + PJ juntos' },
  { icon: UserRoundCheck, text: 'Contador aprova' },
];

export function HeroSection() {
  return (
    <Section inner="pt-10 lg:pt-16" labelledBy="hero-title">
      <div className="grid gap-12 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-7">
          <SandboxSeal label={LANDING_SEAL} />
          <p className="type-small mt-4">
            <Link
              href={ROUTES.demo}
              data-testid="landing/hero-line"
              data-cents={hero.savings12m}
              className="inline-flex min-h-11 flex-wrap items-center gap-x-1.5 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {hero.firstName}, persona sintética:
              <span className="num font-semibold text-found-ink">
                {formatBRLWhole(hero.savings12m)}
              </span>
              a menos em 12 meses
              <ArrowRight className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
            </Link>
          </p>
          <h1
            id="hero-title"
            className="type-display mt-4 max-w-[13em] text-balance text-foreground lg:mt-6"
          >
            Ache o dinheiro que o governo te deve.
          </h1>
          <p className="type-body-lg mt-4 max-w-md text-muted-foreground">
            Com a conta aberta e o artigo da lei.
          </p>
          <CnpjForm id="hero" className="mt-10" />
          <DemoLink className="mt-2" />
          <ul className="mt-8 flex flex-wrap gap-2" aria-label="Por que confiar">
            {PILLS.map(({ icon: Icon, text }) => (
              <li
                key={text}
                className="type-caption inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-muted-foreground"
              >
                <Icon className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
                {text}
              </li>
            ))}
          </ul>
        </div>
        <div className="lg:col-span-5 lg:pt-4">
          <HeroMockup />
        </div>
      </div>
    </Section>
  );
}

export function ProofSection() {
  const items = [
    {
      value: formatBRLWhole(hero.savings12m),
      testId: 'landing/proof-savings',
      cents: hero.savings12m,
      text: `a menos para a ${hero.firstName}, persona sintética, em 12 meses`,
    },
    // TODO(E8): show the engine's rule count (rulesByRef) once the rules exist.
    {
      value: String(lawProvisionCount),
      testId: 'landing/proof-provisions',
      text: 'dispositivos de lei capturados da fonte oficial, com data e hash',
    },
    { value: '< 10 s', text: 'do CNPJ à primeira estimativa (meta da demo)' },
    { value: '100%', text: 'dos cálculos com a conta aberta, passo a passo' },
  ];
  return (
    <Section inner="py-12 lg:py-16" labelledBy="proof-title">
      <h2 id="proof-title" className="sr-only">
        Números da demo
      </h2>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-4">
        {items.map((it) => (
          <div key={it.text} className="flex flex-col bg-background p-5 lg:p-6">
            <dt className="type-small order-2 mt-2 text-muted-foreground">{it.text}</dt>
            <dd
              className="type-money-md num text-foreground"
              data-testid={it.testId}
              data-cents={it.cents}
            >
              {it.value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="type-small mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-subtle">
        <span>Construído com</span>
        {/* Add AbacatePay, WorkOS etc. when their stage lands (E11, E17). */}
        {['Open Finance (Pluggy, sandbox)', 'Claude'].map((n) => (
          <span key={n} className="font-medium text-muted-foreground">
            {n}
          </span>
        ))}
      </p>
    </Section>
  );
}

export function ProblemSection() {
  const changes = [
    {
      when: 'jan/2026',
      title: 'Dividendos',
      text: 'Acima de R$ 50 mil por mês da mesma empresa, 10% ficam retidos na fonte.',
      ref: lawChanges.dividends,
      level: 'confirmed' as const,
    },
    {
      when: 'jan/2027',
      title: 'CBS',
      text: 'Começa a CBS. A exportação de serviços é imune a ela e ao IBS.',
      ref: lawChanges.cbsExport,
      level: 'confirmed' as const,
    },
    {
      when: '2027',
      title: 'Novo MEI',
      text: 'Em 2027, o limite do MEI pode subir para R$ 110 mil, se a LOA 2027 prever a renúncia.',
      ref: lawChanges.mei,
      condition: lawChanges.meiCondition,
      level: 'depends_on_regulation' as const,
    },
  ];
  return (
    <Section labelledBy="problem-title">
      <h2 id="problem-title" className="type-h1 max-w-3xl text-foreground">
        A maior reforma em 60 anos começou. Quem tem tributarista são as grandes.
      </h2>
      <ul className="mt-12 grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-3">
        {changes.map((c) => (
          <li key={c.title} className="flex flex-col gap-3 bg-background p-6">
            <p className="type-small num font-mono text-muted-foreground">{c.when}</p>
            <h3 className="type-h3 text-foreground">{c.title}</h3>
            <p className="text-muted-foreground">{c.text}</p>
            <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 pt-2">
              <LawSeal lawRef={c.ref} />
              {'condition' in c && c.condition ? <LawSeal lawRef={c.condition} /> : null}
              {c.level === 'depends_on_regulation' ? <ConfidenceBadge level={c.level} /> : null}
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function HowItWorksSection() {
  const steps = [
    {
      icon: Landmark,
      title: 'Digite o CNPJ',
      text: 'Pelo que a Receita mostra, o motor diz quais regras podem valer para a sua empresa.',
    },
    {
      icon: Link2,
      title: 'Conecte as contas PF e PJ',
      text: 'Open Finance, só leitura. Pró-labore e dividendos ligam as duas contas: sem a PF, a conta fica pela metade.',
    },
    {
      icon: FileCheck2,
      title: 'Veja o R$ com a lei',
      text: 'Cada valor vem com a conta aberta e o artigo citado. Seu contador revisa e aprova antes de você agir.',
    },
  ];
  return (
    <Section id="como-funciona" labelledBy="how-title">
      <h2 id="how-title" className="type-h1 text-foreground">
        Como funciona
      </h2>
      <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
        {steps.map((s, i) => (
          <li key={s.title} className="flex flex-col gap-3 border-t border-strong-border pt-5">
            <span className="type-small num font-mono text-muted-foreground">
              Passo {i + 1} de {steps.length}
            </span>
            <h3 className="type-h3 flex items-center gap-2 text-foreground">
              <s.icon className="size-5" strokeWidth={1.5} aria-hidden="true" />
              {s.title}
            </h3>
            <p className="text-muted-foreground">{s.text}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

/** Splits the provision text around the 28% threshold so the highlight marks exactly what the rule tests. */
function ProvisionExcerpt() {
  const needle = 'igual ou superior a 28% (vinte e oito por cento)';
  const { text } = fatorRProvision;
  const at = text.indexOf(needle);
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <Highlight variant="text">{needle}</Highlight>
      {text.slice(at + needle.length)}
    </>
  );
}

export function CalcSection() {
  return (
    // §5.12 section 5: dark in both themes (visual rhythm). `.dark` redefines the tokens for this block.
    <section
      aria-labelledby="calc-title"
      className="dark border-t border-border bg-background text-foreground"
    >
      <div className="mx-auto grid max-w-[1280px] gap-12 border-border px-4 py-16 sm:px-6 lg:grid-cols-12 lg:border-x lg:px-12 lg:py-24">
        <div className="lg:col-span-5">
          <h2 id="calc-title" className="type-h1">
            A IA lê. O motor calcula. A lei assina embaixo.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Nenhum número sai de um modelo de linguagem. As contas são feitas em centavos por regras
            escritas a partir da lei, e cada passo mostra de onde veio.
          </p>
          <blockquote className="mt-8 rounded-lg border border-border bg-surface p-5">
            <p className="font-serif text-xl leading-8 text-foreground">
              <ProvisionExcerpt />
            </p>
            <footer className="mt-4">
              <LawSeal lawRef={fatorRProvision} />
            </footer>
          </blockquote>
        </div>
        <div className="lg:col-span-7">
          <div className="rounded-xl border border-border bg-surface p-5 sm:p-6">
            <p className="type-small text-muted-foreground">
              Pró-labore da {hero.firstName}: a conta do achado, passo a passo
            </p>
            <CalcTrace trace={heroR01Trace} open testIdPrefix="landing/trace" className="mt-3" />
          </div>
        </div>
      </div>
    </section>
  );
}

export function SecuritySection() {
  const items = [
    {
      icon: BadgeCheck,
      title: 'Open Finance regulado pelo Banco Central',
      text: 'Você autoriza no seu banco. Nada de senha com a gente.',
    },
    {
      icon: ShieldCheck,
      title: 'Só leitura',
      text: 'Lemos extratos e saldos dos últimos 12 meses. Nunca movimentamos dinheiro.',
    },
    {
      icon: Undo2,
      title: 'LGPD e revogação em um toque',
      text: 'Você revoga o acesso quando quiser, e os dados saem junto.',
    },
    {
      icon: FileCheck2,
      title: 'Empresa real, extrato de exemplo',
      text: 'A empresa vem dos dados públicos da Receita. Os extratos bancários desta versão são de exemplo (persona sintética).',
    },
  ];
  return (
    <Section id="seguranca" labelledBy="security-title">
      <h2 id="security-title" className="type-h1 text-foreground">
        O que lemos e o que nunca fazemos
      </h2>
      <ul className="mt-12 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {items.map((it) => (
          <li key={it.title} className="flex flex-col gap-2 bg-background p-6">
            <it.icon className="size-5 text-foreground" strokeWidth={1.5} aria-hidden="true" />
            <h3 className="type-h4 mt-2 text-foreground">{it.title}</h3>
            <p className="type-small text-muted-foreground">{it.text}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

const FAQ = [
  {
    q: 'É legal?',
    a: 'Sim. O Refund só aponta economia prevista em lei, com o artigo citado. O que parece economia, mas é risco, aparece como alerta, e a gente não recomenda.',
  },
  {
    q: 'Substitui meu contador?',
    a: 'Não. O Refund faz a conta e mostra a lei; seu contador revisa e aprova antes de qualquer mudança.',
  },
  {
    q: 'E se a lei mudar?',
    a: 'Cada cálculo guarda a versão da norma que usou. Quando a lei muda, a conta é refeita com a regra nova.',
  },
  {
    q: 'Vocês veem minha senha?',
    a: 'Não. A conexão é pelo Open Finance: você autoriza no app do seu banco, só para leitura, e revoga quando quiser.',
  },
  {
    q: 'De onde vem a estimativa?',
    a: 'De um motor de regras: as contas são determinísticas, em centavos, e cada passo cita o artigo. A IA lê o extrato e explica; quem calcula é o motor.',
  },
  {
    q: 'Funciona para MEI e PF?',
    a: 'Por enquanto, o Refund calcula empresas do Simples Nacional e a pessoa física dos sócios. No MEI o imposto é fixo por mês; o que vale acompanhar é o limite de faturamento.',
  },
];

export function FaqSection() {
  return (
    <Section id="perguntas" labelledBy="faq-title">
      <div className="grid gap-10 lg:grid-cols-12">
        <h2 id="faq-title" className="type-h1 text-foreground lg:col-span-4">
          Perguntas
        </h2>
        <div className="divide-y divide-border border-y border-border lg:col-span-8">
          {FAQ.map((item) => (
            <details key={item.q} className="group py-1">
              <summary className="type-h4 flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-3 text-foreground [&::-webkit-details-marker]:hidden">
                {item.q}
                <span
                  aria-hidden="true"
                  className="font-mono text-muted-foreground transition-transform duration-(--dur-base) group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="max-w-2xl pb-5 text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </Section>
  );
}

export function FinalCtaSection() {
  return (
    <section
      aria-labelledby="cta-title"
      className="dark border-t border-border bg-surface text-foreground"
    >
      <div className="mx-auto grid max-w-[1280px] gap-12 border-border px-4 py-16 sm:px-6 lg:grid-cols-12 lg:border-x lg:px-12 lg:py-24">
        <div className="lg:col-span-6">
          <h2 id="cta-title" className="type-display text-balance">
            Quanto o governo te deve?
          </h2>
          <p className="type-body-lg mt-4 text-muted-foreground">
            A {hero.firstName} pode pagar {formatBRLWhole(hero.savings12m)} a menos nos próximos 12
            meses. Veja a conta dela, passo a passo.
          </p>
        </div>
        <div className="flex flex-col gap-8 lg:col-span-6">
          <div>
            <CnpjForm id="cta" />
            <DemoLink className="mt-1" />
          </div>
        </div>
        {/* Bug bash 20/11: the waitlist sits below the working CNPJ input, not beside it. */}
        <div className="border-t border-border pt-8 lg:col-span-12">
          <WaitlistForm join={joinWaitlist} />
        </div>
      </div>
    </section>
  );
}

const FOOTER_LINKS = [
  { href: ROUTES.demo, label: 'Demonstração' },
  { href: ROUTES.howItWorks, label: 'Como funciona' },
  { href: ROUTES.security, label: 'Segurança' },
  { href: ROUTES.engine, label: 'Motor e testes' },
  { href: ROUTES.status, label: 'Status' },
  { href: ROUTES.privacy, label: 'Privacidade' },
  { href: ROUTES.terms, label: 'Termos' },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto grid max-w-[1280px] gap-10 border-border px-4 py-12 sm:px-6 lg:grid-cols-12 lg:border-x lg:px-12">
        <div className="space-y-3 lg:col-span-5">
          <span className="text-[24px]">
            <Logo />
          </span>
          <p className="type-small text-muted-foreground">imposto com a conta aberta</p>
          <p className="type-small text-muted-foreground">Feito no Hack Brasil 2026.</p>
        </div>
        <nav aria-label="Rodapé" className="lg:col-span-4">
          <ul className="grid grid-cols-2 gap-x-6 gap-y-1">
            {FOOTER_LINKS.map((l) => (
              <li key={l.label}>
                <Link
                  href={l.href}
                  className="type-small inline-flex min-h-11 items-center text-muted-foreground hover:text-foreground"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex flex-col items-start gap-3 lg:col-span-3 lg:items-end">
          <ThemeToggle />
          <SandboxSeal label={LANDING_SEAL} />
        </div>
        <p className="type-small border-t border-border pt-6 text-muted-foreground lg:col-span-12">
          {DISCLAIMER_TEXT} O Refund mostra planejamento tributário lícito, com base na lei vigente;
          não é consultoria jurídica nem contábil. A empresa vem dos dados públicos da Receita. Os
          extratos bancários desta versão são de exemplo (persona sintética).
        </p>
      </div>
    </footer>
  );
}
