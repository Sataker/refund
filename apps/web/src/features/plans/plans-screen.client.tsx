'use client';

import { Check, Copy, Loader2, ShieldCheck, Sparkles, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FakeQr } from './fake-qr';
import {
  type Period,
  PLAN_NAME,
  type PlansModel,
  perMonthOfYear,
  priceLabel,
  type SellablePlan,
} from './model';

// Screen 10 (IDENTITY-AND-UI): 4 cards (D3: Grátis · Pessoal with MEI inside · Empresa · Contador), annual
// preselected, 30-day guarantee, the success fee as an honest line (D4: roadmap), and the Pix modal (QR, copia e cola,
// "Esperando o pagamento…" → "Pago. Boas-vindas ao Empresa."). The same screen serves /app (real Pix through the server
// actions) and /demo (simulated, labelled, no network): the caller hands in the checkout port.

type Result<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } };

export interface CheckoutCharge {
  chargeId: string;
  brCode: string;
  /** PNG data URI from AbacatePay; empty on /demo (a simulated QR is drawn instead). */
  brCodeBase64: string;
  expiresAt: string;
  devMode: boolean;
  amountCents: number;
}

export type ChargeStatus = 'pending' | 'paid' | 'expired' | 'cancelled' | 'refunded';

export interface CheckoutPort {
  start(plan: SellablePlan, period: Period | 'validation'): Promise<Result<CheckoutCharge>>;
  poll(chargeId: string): Promise<Result<{ status: ChargeStatus }>>;
  /** Present only when a simulated payment is possible (Test Mode key, or /demo). */
  simulate?: (chargeId: string) => Promise<Result<void>>;
  /** After "paid" (the live page refreshes its server data). */
  onPaid?: (plan: SellablePlan) => void;
}

export interface PlansScreenProps {
  model: PlansModel;
  /** The plan in force (any other id, e.g. a B2B one, shows no "Plano atual" on the B2C cards). */
  current: string;
  /** "Até 12/12/2026", when a paid period is running. */
  currentUntil?: string | null;
  port: CheckoutPort | null;
  /** /demo: every step carries "simulação". */
  simulated: boolean;
  /** Hidden R$ 1,00 offer (`?oferta=validacao`). */
  validationOffer?: boolean;
  contactEmail: string | null;
  /** Why Pix is off (capability), shown instead of the checkout. */
  offMessage?: string;
  /**
   * The company of the live track: 'mei' (an MEI CNPJ), 'other' (any other CNPJ) or null (none, and always on /demo).
   * It only picks the hint on the Pessoal card: since D41, Pessoal keeps Grátis's CNPJ and is sold to every session.
   */
  linkedCompany?: 'mei' | 'other' | null;
  /** Where the paid state leads (a same-origin /app path checked on the server). */
  returnTo?: string | null;
}

const POLL_MS = 2_000;
const POLL_MAX_MS = 15 * 60_000;

export function PlansScreen(props: PlansScreenProps) {
  const { model, current, simulated } = props;
  const [period, setPeriod] = useState<Period>('yearly');
  const [mei, setMei] = useState(current === 'mei');
  const [checkout, setCheckout] = useState<{
    plan: SellablePlan;
    period: Period | 'validation';
  } | null>(null);
  const [paidPlan, setPaidPlan] = useState<SellablePlan | null>(null);
  const effective = paidPlan ?? current;
  const personalPlan: SellablePlan = mei ? 'mei' : 'personal';
  const personalPrice = mei ? model.mei : model.personal;

  const buy = (plan: SellablePlan, p: Period | 'validation') => setCheckout({ plan, period: p });
  // D41: Pessoal keeps Grátis's CNPJ, so it runs any analysis the user already has and is always sold. The hint only
  // points to the plan that fits the linked company better.
  const personalHint =
    props.linkedCompany === 'other'
      ? `Sua análise usa o CNPJ de uma empresa do Simples. O Pessoal cobre ${model.personalCnpjs} CNPJ, como o Grátis; com sócios ou mais contas da empresa, o Empresa serve melhor.`
      : props.linkedCompany === 'mei' && !mei
        ? 'Sua análise usa um CNPJ MEI: marque “Tenho MEI” para ter o alerta contínuo do limite do MEI.'
        : null;

  return (
    <div className="flex flex-col gap-8" data-testid="plans-screen" data-simulated={simulated}>
      {simulated ? (
        <p
          className="type-small rounded-md border border-cobalt/40 bg-cobalt/5 px-3 py-2 text-foreground"
          data-testid="simulation-label"
        >
          Simulação: nesta demo nenhum Pix é cobrado. O QR Code, o pagamento e o plano são
          fictícios, só para mostrar o caminho. No resto da demo você já vê tudo, como no plano
          Empresa.
        </p>
      ) : null}

      <CurrentPlan
        plan={effective}
        until={paidPlan ? null : props.currentUntil}
        simulated={simulated}
      />

      {effective !== 'free' && !simulated ? (
        <p className="type-small text-muted-foreground" data-testid="change-plan-note">
          Ao trocar de plano, o novo período começa no dia do pagamento. O que sobrou do plano atual
          não é descontado. Se mudar de ideia, você pode desistir do novo pagamento em até{' '}
          {model.withdrawalDays} dias e receber tudo de volta (Código de Defesa do Consumidor, art.
          49).
        </p>
      ) : null}

      {props.validationOffer ? (
        <section
          aria-labelledby="validacao-titulo"
          className="flex flex-col gap-3 rounded-lg border border-cobalt/50 bg-surface p-5"
          data-testid="validation-offer"
        >
          <h2 id="validacao-titulo" className="type-h4 text-foreground">
            Oferta de validação: Empresa por {model.validation.days} dias
          </h2>
          <p className="type-small text-muted-foreground">
            Um Pix de {priceLabel(model.validation.amountCents)} libera o plano Empresa por{' '}
            {model.validation.days} dias. Oferta limitada.
          </p>
          <SubscribeButton
            port={props.port}
            offMessage={props.offMessage}
            onClick={() => buy('business', 'validation')}
            testId="subscribe-validation"
          >
            Pagar {priceLabel(model.validation.amountCents)} no Pix
          </SubscribeButton>
        </section>
      ) : null}

      <fieldset className="flex flex-col gap-2">
        <legend className="type-small mb-2 font-medium text-foreground">Como pagar</legend>
        <div className="inline-flex w-fit rounded-md border border-border bg-surface p-1">
          {(['yearly', 'monthly'] as const).map((p) => (
            <label
              key={p}
              className={cn(
                'type-small flex min-h-11 cursor-pointer items-center rounded px-4 font-medium transition-colors duration-(--dur-fast) has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-(--ring)',
                period === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
              )}
            >
              <input
                type="radio"
                name="period"
                value={p}
                checked={period === p}
                onChange={() => setPeriod(p)}
                className="sr-only"
                data-testid={`period-${p}`}
              />
              {p === 'yearly' ? 'Anual (até 33% de desconto)' : 'Mensal'}
            </label>
          ))}
        </div>
      </fieldset>

      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" data-testid="plan-cards">
        <Card
          id="free"
          name={PLAN_NAME.free}
          price={<PriceLine main="R$ 0" />}
          features={[
            'Todos os achados com o valor em R$',
            `${model.freeOpenTraces} cálculo aberto (o maior achado)`,
            `${model.freeAnalysesPerMonth} análises por mês`,
            'Resumo para o contador',
          ]}
          action={
            effective === 'free' ? (
              <CurrentBadge />
            ) : (
              <p className="type-caption text-muted-foreground">Sempre disponível</p>
            )
          }
        />
        <Card
          id="personal"
          name={mei ? PLAN_NAME.mei : PLAN_NAME.personal}
          price={<PeriodPrice price={personalPrice} period={period} />}
          features={
            mei
              ? [
                  `Sua pessoa física + ${model.meiCnpjs} CNPJ MEI`,
                  'Todos os cálculos abertos',
                  'Plano de ação passo a passo',
                  'Alerta contínuo do limite do MEI',
                ]
              : [
                  'IRPF: completa × simplificada e PGBL',
                  'Todos os cálculos abertos',
                  'Plano de ação passo a passo',
                  `Pessoa física + ${model.personalCnpjs} CNPJ, como no Grátis`,
                ]
          }
          extra={
            <label className="type-small flex min-h-11 items-center gap-2 text-foreground">
              <input
                type="checkbox"
                checked={mei}
                onChange={(e) => setMei(e.target.checked)}
                className="size-4 accent-(--primary)"
                data-testid="toggle-mei"
              />
              Tenho MEI ({priceLabel(model.mei.yearlyCents)}/ano ou{' '}
              {priceLabel(model.mei.monthlyCents)}/mês)
            </label>
          }
          action={
            effective === personalPlan ? (
              <CurrentBadge />
            ) : (
              <div className="flex flex-col gap-2">
                {personalHint ? (
                  <p className="type-caption text-muted-foreground" data-testid="personal-hint">
                    {personalHint}
                  </p>
                ) : null}
                <SubscribeButton
                  port={props.port}
                  offMessage={props.offMessage}
                  onClick={() => buy(personalPlan, period)}
                  testId={`subscribe-${personalPlan}`}
                  variant="outline"
                >
                  Assinar {mei ? 'Pessoal + MEI' : 'Pessoal'}
                </SubscribeButton>
              </div>
            )
          }
        />
        <Card
          id="business"
          name={PLAN_NAME.business}
          recommended
          price={<PeriodPrice price={model.business} period={period} />}
          features={[
            `Pessoa física e empresa (${model.businessCpfs} sócios + 1 CNPJ)`,
            'Todos os cálculos abertos',
            'Otimizador de pró-labore interativo',
            'Recuperação DAS a DAS, com prazos',
            `${model.paidAnalysesPerMonth} análises por mês`,
          ]}
          action={
            effective === 'business' ? (
              <CurrentBadge />
            ) : (
              <SubscribeButton
                port={props.port}
                offMessage={props.offMessage}
                onClick={() => buy('business', period)}
                testId="subscribe-business"
              >
                Assinar Empresa
              </SubscribeButton>
            )
          }
        />
        <Card
          id="accountant"
          name="Contador"
          price={
            <div className="flex flex-col gap-1">
              <span className="type-small text-foreground">
                <strong className="font-semibold">Parceiro: R$ 0</strong> · até{' '}
                {model.accountantPartnerCnpjs} CNPJs, só diagnóstico
              </span>
              <span className="type-small text-foreground">
                <strong className="font-semibold">
                  Pro: {priceLabel(model.accountantPro.monthlyCents)}/mês
                </strong>{' '}
                ou {priceLabel(model.accountantPro.yearlyCents)}/ano · {model.accountantProCnpjs}{' '}
                CNPJs
              </span>
            </div>
          }
          features={['Carteira de clientes com R$ por cliente', 'Aprovar e assinar relatórios']}
          action={
            props.contactEmail ? (
              <a
                href={`mailto:${props.contactEmail}?subject=Refund%20para%20contadores`}
                className="type-small inline-flex min-h-11 items-center justify-center rounded-md border border-strong-border bg-surface px-4 font-medium text-foreground hover:bg-muted"
                data-testid="contact-accountant"
              >
                Começar: fale com a gente
              </a>
            ) : (
              <p className="type-caption text-muted-foreground" data-testid="contact-accountant">
                Em breve.
              </p>
            )
          }
        />
      </ul>

      <div className="flex flex-col gap-2 border-t border-border pt-5">
        <p className="type-small text-foreground" data-testid="contact-firms">
          Escritório e API (banco PJ, ERP, fintech): fale com a gente
          <ContactTail email={props.contactEmail} />
        </p>
        <p className="type-small text-foreground" data-testid="success-fee">
          Taxa de sucesso: {model.successFeePct.monthly}% só sobre o que for recuperado (
          {model.successFeePct.yearly}% no anual do Empresa e do Pessoal + MEI), cobrada quando o
          dinheiro entra e devolvida se a Receita glosar. Em breve: hoje o Refund mostra o valor e o
          caminho; o pedido à Receita fica com você e o seu contador.
        </p>
        <p
          className="type-small inline-flex items-start gap-1.5 text-muted-foreground"
          data-testid="guarantee"
        >
          <ShieldCheck className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
          <span>
            Garantia de {model.guaranteeDays} dias a partir do pagamento: devolvemos o primeiro
            pagamento, sem perguntas, por Pix, em até {model.refundWithinDays} dias depois do pedido
            {props.contactEmail ? (
              <>
                . É só pedir em{' '}
                <a
                  href={`mailto:${props.contactEmail}`}
                  className="text-cobalt underline underline-offset-4"
                >
                  {props.contactEmail}
                </a>
              </>
            ) : null}
            . Em qualquer pagamento, você também pode desistir em até {model.withdrawalDays} dias e
            receber tudo de volta (Código de Defesa do Consumidor, art. 49). Um Pix libera o período
            (anual: 12 meses; mensal: 31 dias). Sem renovação automática. Detalhes nos{' '}
            <Link href="/termos" className="text-cobalt underline underline-offset-4">
              Termos
            </Link>
            .
          </span>
        </p>
      </div>

      {checkout && props.port ? (
        <PixDialog
          key={`${checkout.plan}-${checkout.period}`}
          plan={checkout.plan}
          period={checkout.period}
          port={props.port}
          simulated={simulated}
          returnTo={props.returnTo ?? null}
          onClose={() => setCheckout(null)}
          onPaid={(plan) => {
            setPaidPlan(plan);
            props.port?.onPaid?.(plan);
          }}
        />
      ) : null}
    </div>
  );
}

function ContactTail({ email }: { email: string | null }) {
  if (!email) return <>.</>;
  return (
    <>
      {' '}
      em{' '}
      <a href={`mailto:${email}`} className="text-cobalt underline underline-offset-4">
        {email}
      </a>
      .
    </>
  );
}

function CurrentPlan({
  plan,
  until,
  simulated,
}: {
  plan: string;
  until: string | null | undefined;
  simulated: boolean;
}) {
  const name = plan in PLAN_NAME ? PLAN_NAME[plan as keyof typeof PLAN_NAME] : 'Plano de contador';
  return (
    <p className="type-small text-muted-foreground" data-testid="current-plan" data-plan={plan}>
      Seu plano:{' '}
      <strong className="font-semibold text-foreground">
        {name}
        {simulated && plan !== 'free' ? ' (simulado)' : ''}
      </strong>
      {until ? ` · até ${until}` : ''}
    </p>
  );
}

function Card({
  id,
  name,
  price,
  features,
  extra,
  action,
  recommended = false,
}: {
  id: string;
  name: string;
  price: ReactNode;
  features: string[];
  extra?: ReactNode;
  action: ReactNode;
  recommended?: boolean;
}) {
  const titleId = useId();
  return (
    <li
      aria-labelledby={titleId}
      data-testid={`plan-card-${id}`}
      className={cn(
        'relative flex flex-col gap-4 rounded-lg border bg-surface p-5',
        recommended ? 'border-primary shadow-sm' : 'border-border',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id={titleId} className="type-h4 text-foreground">
          {name}
        </h2>
        {recommended ? (
          <span className="type-caption inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 font-medium text-primary-foreground">
            <Sparkles className="size-3" aria-hidden="true" />
            Recomendado
          </span>
        ) : null}
      </div>
      <div>{price}</div>
      <ul className="flex flex-1 flex-col gap-1.5">
        {features.map((f) => (
          <li key={f} className="type-small flex items-start gap-2 text-foreground">
            <Check className="mt-0.5 size-4 shrink-0 text-cobalt" aria-hidden="true" />
            {f}
          </li>
        ))}
      </ul>
      {extra}
      <div>{action}</div>
    </li>
  );
}

function PriceLine({ main, sub }: { main: string; sub?: string }) {
  return (
    <div className="flex flex-col">
      <span className="num font-serif text-[32px] leading-[36px] text-foreground">{main}</span>
      {sub ? <span className="type-caption text-muted-foreground">{sub}</span> : null}
    </div>
  );
}

function PeriodPrice({
  price,
  period,
}: {
  price: { monthlyCents: number; yearlyCents: number };
  period: Period;
}) {
  return period === 'yearly' ? (
    <PriceLine
      main={`${priceLabel(price.yearlyCents)}/ano`}
      sub={`= ${priceLabel(perMonthOfYear(price.yearlyCents))}/mês · ou ${priceLabel(price.monthlyCents)}/mês no mensal`}
    />
  ) : (
    <PriceLine
      main={`${priceLabel(price.monthlyCents)}/mês`}
      sub={`ou ${priceLabel(price.yearlyCents)}/ano no anual`}
    />
  );
}

function CurrentBadge() {
  return (
    <span
      className="type-small inline-flex min-h-11 items-center rounded-md border border-border px-4 font-medium text-muted-foreground"
      data-testid="plan-current-badge"
    >
      Plano atual
    </span>
  );
}

function SubscribeButton({
  port,
  offMessage,
  onClick,
  testId,
  children,
  variant = 'default',
}: {
  port: CheckoutPort | null;
  offMessage: string | undefined;
  onClick: () => void;
  testId: string;
  children: ReactNode;
  variant?: 'default' | 'outline';
}) {
  if (!port) {
    return (
      <p className="type-caption text-muted-foreground" data-testid="payments-off">
        {offMessage ?? 'Pagamento por Pix em breve.'}
      </p>
    );
  }
  return (
    <Button
      type="button"
      size="lg"
      variant={variant}
      className="w-full"
      onClick={onClick}
      data-testid={testId}
    >
      {children} →
    </Button>
  );
}

type DialogState =
  | { kind: 'creating' }
  | { kind: 'waiting'; charge: CheckoutCharge }
  | { kind: 'paid'; charge: CheckoutCharge }
  | { kind: 'expired' }
  | { kind: 'refunded' }
  | { kind: 'error'; message: string };

const PAID_TEXT: Record<SellablePlan, string> = {
  business:
    'Os cálculos, a recuperação DAS a DAS e o otimizador de pró-labore abrem agora nas suas análises.',
  personal: 'Todos os cálculos e o plano de ação passo a passo abrem agora nas suas análises.',
  mei: 'Todos os cálculos e o plano de ação passo a passo abrem agora nas suas análises.',
};

const TIME = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit',
});

function PixDialog({
  plan,
  period,
  port,
  simulated,
  returnTo,
  onClose,
  onPaid,
}: {
  plan: SellablePlan;
  period: Period | 'validation';
  port: CheckoutPort;
  simulated: boolean;
  returnTo: string | null;
  onClose: () => void;
  onPaid: (plan: SellablePlan) => void;
}) {
  const [state, setState] = useState<DialogState>({ kind: 'creating' });
  const [copied, setCopied] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);

  // The port may be re-created when the page data refreshes; one dialog creates one charge (per attempt).
  const portRef = useRef(port);
  portRef.current = port;

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // Exactly one charge per attempt, even when React runs the effect twice in development.
  const startedAttempt = useRef(-1);
  useEffect(() => {
    if (startedAttempt.current === attempt) return;
    startedAttempt.current = attempt;
    setState({ kind: 'creating' });
    portRef.current.start(plan, period).then((r) => {
      if (!mounted.current) return;
      setState(
        r.ok ? { kind: 'waiting', charge: r.value } : { kind: 'error', message: r.error.message },
      );
    });
  }, [plan, period, attempt]);

  const waitingCharge = state.kind === 'waiting' ? state.charge : null;
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;
  const handlePaid = useCallback(
    (charge: CheckoutCharge) => {
      setState({ kind: 'paid', charge });
      onPaidRef.current(plan);
    },
    [plan],
  );

  useEffect(() => {
    if (!waitingCharge) return;
    let alive = true;
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const r = await portRef.current.poll(waitingCharge.chargeId);
      if (!alive) return;
      if (r.ok && r.value.status === 'paid') return handlePaid(waitingCharge);
      if (r.ok && (r.value.status === 'expired' || r.value.status === 'cancelled'))
        return setState({ kind: 'expired' });
      if (r.ok && r.value.status === 'refunded') return setState({ kind: 'refunded' });
      if (Date.now() - started > POLL_MAX_MS) return setState({ kind: 'expired' });
      timer = setTimeout(tick, POLL_MS);
    };
    timer = setTimeout(tick, POLL_MS);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [waitingCharge, handlePaid]);

  // Native modal dialog: focus trapped, page behind inert, Esc closes; focus goes back to the button that opened it.
  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (dialog && !dialog.open) dialog.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      if (dialog?.open) dialog.close();
      opener?.focus();
    };
  }, []);

  const name = PLAN_NAME[plan];
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      data-testid="pix-dialog"
      data-state={state.kind}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="m-0 mt-auto max-h-dvh w-full max-w-none overflow-y-auto rounded-t-xl bg-background p-0 text-foreground shadow-lg backdrop:bg-foreground/40 sm:m-auto sm:max-w-[420px] sm:rounded-xl"
    >
      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="type-h4 text-foreground">
            {state.kind === 'paid' ? 'Pagamento confirmado' : `Pix · ${name}`}
            {simulated ? ' (simulação)' : ''}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="inline-flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
            data-testid="pix-close"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        {state.kind === 'creating' ? (
          <p className="type-small inline-flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Gerando o Pix…
          </p>
        ) : null}

        {state.kind === 'error' ? (
          <div className="flex flex-col gap-3" role="alert" data-testid="pix-error">
            <p className="type-small text-foreground">{state.message}</p>
            <Button
              type="button"
              size="lg"
              variant="outline"
              onClick={() => setAttempt((a) => a + 1)}
            >
              Tentar de novo
            </Button>
          </div>
        ) : null}

        {state.kind === 'expired' ? (
          <div className="flex flex-col gap-3" data-testid="pix-expired">
            <p className="type-small text-foreground">
              Este QR Code expirou sem pagamento. Nada foi cobrado.
            </p>
            <Button type="button" size="lg" onClick={() => setAttempt((a) => a + 1)}>
              Gerar outro Pix
            </Button>
          </div>
        ) : null}

        {state.kind === 'refunded' ? (
          <p className="type-small text-foreground" data-testid="pix-refunded">
            Este pagamento foi devolvido. Nada mais será cobrado.
          </p>
        ) : null}

        {state.kind === 'waiting' ? (
          <div className="flex flex-col items-center gap-4">
            <p
              className="num type-small text-foreground"
              data-testid="pix-amount"
              data-cents={state.charge.amountCents}
            >
              {priceLabel(state.charge.amountCents)}
              {period === 'yearly'
                ? ' por 12 meses'
                : period === 'monthly'
                  ? ' por 31 dias'
                  : ' por 7 dias'}
            </p>
            {state.charge.brCodeBase64 ? (
              <Image
                src={state.charge.brCodeBase64}
                alt="QR Code do Pix"
                width={240}
                height={240}
                unoptimized
                className="rounded-md border border-border bg-white"
                data-testid="pix-qr"
              />
            ) : (
              <div className="flex flex-col items-center gap-1">
                <FakeQr
                  seed={state.charge.chargeId}
                  className="size-60 rounded-md border border-border"
                />
                <span className="type-caption text-muted-foreground">
                  QR simulado: não pode ser pago.
                </span>
              </div>
            )}
            <div className="flex w-full flex-col gap-1.5">
              <label htmlFor="pix-copia-cola" className="type-caption text-muted-foreground">
                Pix copia e cola
              </label>
              <div className="flex gap-2">
                <input
                  id="pix-copia-cola"
                  readOnly
                  value={state.charge.brCode}
                  className="type-caption min-w-0 flex-1 rounded-md border border-border bg-surface px-2 font-mono"
                  data-testid="pix-brcode"
                />
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(state.charge.brCode);
                      setCopied(true);
                    } catch {
                      setCopied(false);
                    }
                  }}
                  data-testid="pix-copy"
                >
                  <Copy className="size-4" aria-hidden="true" />
                  {copied ? 'Copiado' : 'Copiar'}
                </Button>
              </div>
            </div>
            <p
              className="type-small inline-flex items-center gap-2 text-muted-foreground"
              role="status"
              data-testid="pix-status"
              data-status="pending"
            >
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Esperando o pagamento…
            </p>
            <p className="type-caption text-center text-muted-foreground">
              Válido até {TIME.format(new Date(state.charge.expiresAt))}. Se você já pagou, o plano
              abre sozinho em alguns segundos.
              {simulated ? null : (
                <>
                  {' '}
                  <a
                    href={`/app/plano/pix/${state.charge.chargeId}`}
                    target="_blank"
                    rel="noopener"
                    className="text-cobalt underline underline-offset-4"
                    data-testid="pix-follow"
                  >
                    Acompanhar este Pix em outra aba
                  </a>
                </>
              )}
            </p>
            {state.charge.devMode && port.simulate ? (
              <div className="flex w-full flex-col gap-2 rounded-md border border-dashed border-border p-3">
                <p className="type-caption text-muted-foreground" data-testid="test-mode-label">
                  {simulated
                    ? 'Simulação: toque para simular o pagamento do Pix.'
                    : 'Modo de teste da AbacatePay: nenhum dinheiro de verdade.'}
                </p>
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  disabled={simulating}
                  data-testid="simulate-payment"
                  onClick={async () => {
                    if (!port.simulate) return;
                    setSimulating(true);
                    const r = await port.simulate(state.charge.chargeId);
                    setSimulating(false);
                    if (!r.ok) setState({ kind: 'error', message: r.error.message });
                  }}
                >
                  {simulating ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : null}
                  Simular pagamento
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {state.kind === 'paid' ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <span className="inline-flex size-12 items-center justify-center rounded-full bg-cobalt/10">
              <Check className="size-7 text-cobalt" aria-hidden="true" />
            </span>
            <p
              className="type-h4 text-foreground"
              role="status"
              data-testid="pix-status"
              data-status="paid"
            >
              Pago. Boas-vindas ao <strong className="font-semibold">{name}</strong>
              {simulated ? ' (simulado)' : ''}.
            </p>
            <p className="type-small text-muted-foreground">
              {simulated
                ? 'Na demo tudo já fica aberto. No app de verdade, os cálculos e o plano de ação completos abrem agora.'
                : PAID_TEXT[plan]}
            </p>
            {returnTo && !simulated ? (
              <a
                href={returnTo}
                className="type-small inline-flex min-h-11 items-center rounded-md bg-primary px-5 font-medium text-primary-foreground"
                data-testid="pix-done"
              >
                Ver o cálculo completo →
              </a>
            ) : (
              <Button type="button" size="lg" onClick={onClose} data-testid="pix-done">
                Continuar
              </Button>
            )}
          </div>
        ) : null}
      </div>
    </dialog>
  );
}
