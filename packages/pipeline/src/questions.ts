// Confirmation cards (ENGINE-SPEC E.1–E.3; ARCHITECTURE §4.4 `ConfirmationQuestion`). Only open cards are asked;
// an answered card is reused on the next run. Ordered by `estimatedImpact` (desc).
import { type Cents, type Facts, formatBrl } from '@refund/engine';
import type { AnswerValue, Classified } from './classify/index.ts';
import { CARD } from './classify/rules.ts';
import { estimateGrossProLabore, payrollSeriesAnswer } from './facts.ts';
import type { Category, ConfirmationQuestion } from './types.ts';

const YES_NO = [
  { value: 'yes', label: 'Sim' },
  { value: 'no', label: 'Não' },
];

/** How a category reads in a card (user-visible, PT-BR). */
export const CATEGORY_LABEL: Record<Category, string> = {
  service_revenue: 'receita de serviço',
  sales_revenue: 'receita de venda',
  export_revenue: 'receita de exportação',
  financial_income: 'rendimento financeiro',
  pro_labore: 'pró-labore',
  profit_distribution: 'distribuição de lucros',
  salary: 'salário',
  inss_charge: 'INSS',
  fgts_charge: 'FGTS',
  das_tax: 'DAS do Simples',
  darf_tax: 'DARF de imposto federal',
  other_taxes: 'outros impostos',
  deductible_health: 'despesa de saúde',
  deductible_education: 'despesa de educação',
  pgbl_pension: 'previdência PGBL',
  operating_expense: 'despesa da empresa',
  personal_expense_in_pj: 'gasto pessoal pago pela empresa',
  same_holder_transfer: 'transferência entre você e a empresa',
  bank_fee: 'tarifa bancária',
  unclassified: 'sem categoria',
};

const brl = (c: number) => `R$ ${formatBrl(c)}`;

/**
 * Proxy of how much the answer can move the total: the money the card reclassifies over the period. The exact
 * effect needs the engine, which runs once, after the cards (ARCHITECTURE §4.4, event order).
 */
const impactOf = (list: readonly Classified[]): Cents =>
  list.reduce((a, c) => a + c.tx.amountCents, 0) as Cents;

function textOf(
  cardId: string,
  list: readonly Classified[],
): Omit<ConfirmationQuestion, 'id' | 'transactionIds' | 'estimatedImpact'> {
  const [kind, rest] = cardId.split(':');
  const n = list.length;
  const sum = brl(impactOf(list));
  const latest = [...list].sort((a, b) => (a.tx.date < b.tx.date ? 1 : -1))[0];
  switch (kind) {
    case CARD.proLaboreGross: {
      const estimate = latest
        ? estimateGrossProLabore(latest.tx.amountCents, latest.tx.month)
        : null;
      return estimate === null
        ? {
            type: 'monthly_pro_labore',
            text: `Qual é o seu pró-labore bruto por mês? Você recebe ${brl(latest?.tx.amountCents ?? 0)} líquido.`,
            options: [
              { value: 'other', label: 'Informar valor' },
              { value: 'payslip', label: 'Enviar contracheque' },
            ],
          }
        : {
            type: 'monthly_pro_labore',
            text: `Seu pró-labore bruto é ${brl(estimate)} por mês?`,
            options: [
              { value: 'yes', label: 'Sim' },
              { value: 'other', label: 'Outro valor' },
              { value: 'payslip', label: 'Enviar contracheque' },
            ],
          };
    }
    case CARD.distribution:
      return {
        type: 'transaction',
        text: `Os PIX para você além do pró-labore (${n} transferências, ${sum} no total) são distribuição de lucros?`,
        options: YES_NO,
      };
    case 'partner-transfer':
      return {
        type: 'transaction',
        text: `As transferências para esta pessoa (${n}, ${sum} no total) foram para você (sócio)?`,
        options: [
          { value: 'distribution', label: 'Sim, distribuição de lucros' },
          { value: 'pro_labore', label: 'Sim, pró-labore' },
          { value: 'no', label: 'Não' },
        ],
      };
    case 'clt-employee':
      return {
        type: 'transaction',
        text: `Os pagamentos de cerca de ${brl(latest?.tx.amountCents ?? 0)} por mês a esta pessoa são salário de empregado com carteira?`,
        options: YES_NO,
      };
    case CARD.export:
      // EXECUTION §9 (D20): one question for the two legal tests (acquirer and recipient abroad; consumed abroad).
      return {
        type: 'transaction',
        text: `Estes ${n} créditos do exterior (${sum}) são de clientes de fora do Brasil, por serviço usufruído lá (quem contrata e quem usa estão no exterior)?`,
        options: YES_NO,
      };
    case 'health':
      return {
        type: 'transaction',
        text: `Os pagamentos a este profissional (${sum} no total) foram atendimento de saúde seu ou de dependente? Com qual profissional?`,
        options: [
          { value: 'holder', label: 'Sim, meu' },
          { value: 'dependent', label: 'Sim, de dependente' },
          { value: 'no', label: 'Não foi saúde' },
        ],
      };
    case 'education':
      return {
        type: 'transaction',
        text: `De quem é a matrícula paga a esta escola (${sum} no total)?`,
        options: [
          { value: 'holder', label: 'Minha' },
          { value: 'dependent', label: 'De dependente' },
        ],
      };
    case 'pgbl':
      return {
        type: 'transaction',
        text: `Esta previdência privada (${sum} no total) é PGBL ou VGBL?`,
        options: [
          { value: 'pgbl', label: 'PGBL' },
          { value: 'vgbl', label: 'VGBL' },
        ],
      };
    case 'revenue':
      return {
        type: 'transaction',
        text: `Os créditos deste pagador (${n}, ${sum} no total) são receita da empresa?`,
        options: YES_NO,
      };
    case 'reversal':
      return {
        type: 'transaction',
        text: `Estes créditos de estorno, devolução ou resgate (${n}, ${sum} no total) são receita da empresa?`,
        options: [
          { value: 'yes', label: 'Sim, é receita' },
          { value: 'no', label: 'Não, é dinheiro que voltou' },
        ],
      };
    case 'das': {
      const pa = `${(rest ?? '').slice(5, 7)}/${(rest ?? '').slice(0, 4)}`;
      const byDate = [...list].sort((a, b) => (a.tx.date < b.tx.date ? -1 : 1));
      return {
        type: 'transaction',
        text: `Achamos ${n} pagamentos de DAS para o período ${pa}. Qual deles é o DAS?`,
        options: [
          ...byDate.map((c) => ({
            value: c.tx.id,
            label: `Só o de ${brl(c.tx.amountCents)} pago em ${c.tx.date.slice(8, 10)}/${c.tx.date.slice(5, 7)}/${c.tx.date.slice(0, 4)}`,
          })),
          { value: 'all', label: 'Todos (DAS complementar)' },
        ],
      };
    }
    case 'contribution':
      return {
        type: 'transaction',
        text: `Os créditos vindos de você para a empresa (${sum} no total) foram aporte ou empréstimo seu?`,
        options: YES_NO,
      };
    default: {
      const category = (list[0]?.classification.category ?? 'unclassified') as Category;
      return {
        type: 'transaction',
        text: `Estes ${n} lançamentos (${sum} no total) são ${CATEGORY_LABEL[category]}?`,
        options: YES_NO,
      };
    }
  }
}

export interface QuestionContext {
  regime: Facts['company']['value']['regime'];
  answers: ReadonlyMap<string, AnswerValue>;
}

/** Open cards: a card with a transaction still pending, plus the assumption cards not yet answered. */
export function buildQuestions(
  classified: readonly Classified[],
  ctx: QuestionContext,
): ConfirmationQuestion[] {
  const byCard = new Map<string, Classified[]>();
  for (const c of classified) {
    if (c.cardId === null) continue;
    byCard.set(c.cardId, [...(byCard.get(c.cardId) ?? []), c]);
  }
  const questions: ConfirmationQuestion[] = [];
  for (const [id, list] of byCard) {
    if (!list.some((c) => c.classification.status === 'pending_confirmation')) continue;
    questions.push({
      id,
      ...textOf(id, list),
      transactionIds: list.map((c) => c.tx.id),
      estimatedImpact: impactOf(list),
    });
  }
  const open = (id: string) => !ctx.answers.has(id);
  const payrollOpen = payrollSeriesAnswer(ctx.answers.get(CARD.payrollGross)) === null;
  const salaries = classified.filter(
    (c) => c.classification.category === 'salary' && c.classification.status !== 'rejected',
  );
  if (salaries.length > 0 && payrollOpen) {
    questions.push({
      id: CARD.payrollGross,
      type: 'assumption',
      text: 'Qual foi a folha bruta paga em cada mês (com 13º e férias)?',
      transactionIds: salaries.map((c) => c.tx.id),
      options: [
        { value: 'other', label: 'Informar valores' },
        { value: 'report', label: 'Enviar relatório da folha' },
      ],
      estimatedImpact: impactOf(salaries),
    });
  }
  if ((ctx.regime === 'SIMPLES' || ctx.regime === 'PRESUMIDO') && open(CARD.worksInCompany)) {
    questions.push({
      id: CARD.worksInCompany,
      type: 'assumption',
      text: 'Você trabalha na empresa?',
      transactionIds: [],
      options: YES_NO,
      estimatedImpact: null,
    });
  }
  const distributes = classified.some((c) => c.classification.category === 'profit_distribution');
  if (distributes && open(CARD.bookkeeping)) {
    questions.push({
      id: CARD.bookkeeping,
      type: 'assumption',
      text: 'A empresa tem escrituração contábil completa?',
      transactionIds: [],
      options: YES_NO,
      estimatedImpact: null,
    });
  }
  return questions.sort(
    (a, b) =>
      (b.estimatedImpact ?? -1) - (a.estimatedImpact ?? -1) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}
