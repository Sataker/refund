// C.12 action plan catalog (ENGINE-SPEC C.12; EXECUTION E8b): per rule, the ordered steps ("como aplicar") and the ways
// the money arrives ("como receber"). Texts are transcribed from docs/pesquisa/08-como-receber.md, which governs over
// the C.12.3 summary; every step cites a captured primary source (a provision of @refund/law mirrored in REFS, or a
// procedure excerpt mirrored in PROCEDURE_REFS) or is a `noSource` step with the fixed C.12 sentence. Research 08 §11
// ("Não confirmado") items never appear as statements: they are the `noSource` questions below.
//
// Text rules (tested in action-plan.test.ts, T12-11): pt-BR, imperative, for a layperson; NO digit outside a
// `{placeholder}` (a trace step id or `finding.<money field>`); no date in the text (dates go in from/until/firstEffect,
// computed by build.ts). Menu labels with digits (eSocial events, DARF code, PGDAS-D activity) live in `where.path`,
// copied from the cited source.
import type { PROCEDURE_REFS } from '../parameters/legal-refs.ts';
import type { RefId } from '../rules/refs.ts';
import type { Actor, HowToReceive } from '../types.ts';

/** Fixed sentence of a step without a primary source (ENGINE-SPEC C.12, rule 3). The UI shows it in gray. */
export const NO_SOURCE_TEXT =
  'Confirme com seu contador: não encontramos regra oficial que defina este passo.';

export type RuleKey = 'R01' | 'R02' | 'R03' | 'R04' | 'R05' | 'R05-REC' | 'R06' | 'A01' | 'A02';

export type ActionRefId = RefId | keyof typeof PROCEDURE_REFS;

/** Date rules resolved by build.ts with calendar.ts (no JS clock type). `start` = Assumptions.start. */
export type DateRule =
  | 'start' // Assumptions.start (YearMonth)
  | 'regime_from' // Finding.regimeFrom (YearMonth)
  | 'das_due' // DAS of PA `start`: day 20 of the next month, postponed (Res. CGSN 140, art. 40, § 3º)
  | 'inss_due' // INSS of competence `start`: day 20 of the next month, brought forward (Lei 10.666, art. 4º)
  | 'esocial_due' // S-1200/S-1299/DCTFWeb of `start`: day 15 of the next month, postponed (MOS S-1.3; [F23])
  | 'darf_irrf_due' // DARF 1841 of the next withholding month (see build.ts): last business day of the 2nd decêndio (F29 q6)
  | 'year_end' // 31/12 of the analysis year (PGBL "pagas no ano-calendário", P&R IRPF 2026)
  | 'earliest_claim_until'; // min(recoveryItems.claimUntil)

/** Conditions on the finding and the facts; a template applies when all of its conditions hold. */
export type Condition =
  | 'municipality_sao_paulo' // Facts.company.ibgeMunicipality === '3550308'
  | 'municipality_other' // any other municipality, or unknown
  | 'iss_positive' // R05-REC: municipal (ISS) part of the upper bound > 0
  | 'icms_positive' // R05-REC: state (ICMS) part of the upper bound > 0
  | 'irpfm_below' // R02: projected annual total income < IRPFM threshold (P&R Altas Rendas, perg. 4: "inferior")
  | 'fator_r_raise' // R01: P* above the current pró-labore in a CNAE subject to the Fator R
  | 'pro_labore_lowered' // R01: P* below the current pró-labore
  | 'subject_to_fator_r' // the CNAE is subject to the Fator R (FS12 is asked in the PGDAS-D)
  | 'cpp_inside_das' // the company's CPP is inside the DAS (Anexos I, II, III and V)
  | 'cpp_outside_das' // Anexo IV: the company's CPP is paid outside the DAS (LC 123, art. 18, § 5º-C)
  | 'regime_mei'
  | 'regime_simples'
  | 'limit_exceeded'; // R03: the projected revenue passes the MEI limit, or the Simples ceiling (exclusion)

export interface ActionTemplate {
  id: string; // `${RuleKey}.action.${n}`: stable; variants with exclusive conditions share the id
  who: Actor;
  what: string;
  where?: { name: string; path?: string; url?: string };
  from?: DateRule;
  until?: DateRule;
  documents?: string[];
  refIds: ActionRefId[];
  noSource?: true;
  appliesIf?: Condition[];
}

export interface HowToReceiveTemplate {
  method: HowToReceive['method'];
  summary: string;
  firstEffect?: DateRule;
  refIds: ActionRefId[];
  appliesIf?: Condition[];
}

export interface RuleCatalog {
  steps: ActionTemplate[];
  receive: HowToReceiveTemplate[];
}

/** A step without a primary source: a question (never a statement) followed by the fixed sentence. */
const noSource = (id: string, who: Actor, question: string, appliesIf?: Condition[]) => {
  const out: ActionTemplate = {
    id,
    who,
    what: `${question} ${NO_SOURCE_TEXT}`,
    refIds: [],
    noSource: true,
  };
  if (appliesIf !== undefined) out.appliesIf = appliesIf;
  return out;
};

const E_CAC = {
  name: 'e-CAC',
  url: 'https://cav.receita.fazenda.gov.br/autenticacao/login/index',
};
const PGDAS_D = 'PGDAS-D (Portal do Simples Nacional)';
const DECLARAR = 'Declaração Mensal › Declarar/Retificar';

/** The export-of-services test of Res. CGSN 140, art. 25, §§ 4º and 4º-A (R05.1 and R05-REC.1). */
const EXPORT_TEST =
  'cliente com residência ou sede no exterior, pagamento que entra no Brasil como moeda estrangeira (ou fica no exterior) e resultado do serviço fora do Brasil';

// eSocial, DCTFWeb and INSS of the pró-labore (R01.2–R01.4; A02.2–A02.3).
const ESOCIAL_REFS: ActionRefId[] = ['esocial-mos-s-1.3#s-1200', 'esocial-mos-s-1.3#s-1299'];
const INSS_TEXT =
  'Pague a guia do INSS descontado do pró-labore, que o contador gera. Se não houver expediente bancário no vencimento, pague no dia útil anterior.';

export const CATALOG: Record<RuleKey, RuleCatalog> = {
  // Research 08 §2. P* comes from the trace (T12-05); the INSS rate is not stated (research 08 §11, item 5).
  R01: {
    steps: [
      {
        id: 'R01.action.1',
        who: 'you_or_accountant',
        what: 'Defina com seu contador o novo pró-labore: R$ {R01.P_STAR} por mês, a partir do mês indicado.',
        from: 'start',
        refIds: [
          'res-cgsn140-2018/art26',
          'res-cgsn190-2026/art1/res140-art26',
          'lei8212-1991/art21/caput',
        ],
      },
      {
        id: 'R01.action.2',
        who: 'you',
        what: 'Pague o pró-labore todo mês, pelo valor novo. O contador informa o pagamento no eSocial: só entra no Fator R a remuneração informada.',
        where: { name: 'eSocial', path: 'Evento S-1200' },
        until: 'esocial_due',
        refIds: [
          'esocial-mos-s-1.3#s-1200',
          'res-cgsn140-2018/art26',
          'pr-simples-2026-10-09#5.11',
        ],
      },
      {
        id: 'R01.action.3',
        who: 'accountant',
        what: 'Feche a folha do mês no eSocial e transmita a DCTFWeb.',
        where: { name: 'eSocial e DCTFWeb', path: 'Evento S-1299' },
        until: 'esocial_due',
        refIds: ['esocial-mos-s-1.3#s-1299', 'rfb-noticia-2023-10-prazo-dctfweb'],
      },
      {
        id: 'R01.action.4',
        who: 'you',
        what: INSS_TEXT,
        until: 'inss_due',
        refIds: ['lei10666-2003/art4', 'lei8212-1991/art21/caput', 'lei8212-1991/art30/p4'],
      },
      // Research 08 §11, item 5: the rate a Simples company withholds (IN RFB 2.110/2022) was not read.
      noSource(
        'R01.action.7',
        'accountant',
        'Qual alíquota de INSS descontar do pró-labore numa empresa do Simples?',
      ),
      {
        id: 'R01.action.5',
        who: 'accountant',
        what: 'Em cada PGDAS-D, informe a folha de salários usada no Fator R, já com o pró-labore novo.',
        where: { name: PGDAS_D, path: `${DECLARAR} › folha de salários (FS12)` },
        refIds: [
          'manual-pgdas-d#8.2',
          'manual-pgdas-d#6.4',
          'res-cgsn140-2018/art26',
          'res-cgsn190-2026/art1/res140-art26',
          'res-cgsn190-2026/art9',
        ],
        appliesIf: ['subject_to_fator_r'],
      },
      {
        id: 'R01.action.6',
        who: 'you',
        what: 'Pague o DAS até o vencimento. Se não houver expediente bancário no dia, o prazo passa para o próximo dia útil.',
        until: 'das_due',
        refIds: ['res-cgsn140-2018/art40/p3', 'pr-simples-2026-10-09#6.8'],
      },
    ],
    receive: [
      {
        method: 'lower_tax',
        summary: 'DAS menor, calculado pelo Anexo III em vez do Anexo V, a partir do mês indicado.',
        firstEffect: 'regime_from',
        refIds: ['pr-simples-2026-10-09#5.11', 'lc123-2006/art18/p5-j'],
        appliesIf: ['fator_r_raise'],
      },
      {
        method: 'lower_tax',
        summary: 'Menos INSS e imposto de renda sobre o pró-labore, a partir do mês indicado.',
        firstEffect: 'regime_from',
        refIds: ['lei8212-1991/art21/caput', 'lei15191-2025/art2'],
        appliesIf: ['pro_labore_lowered', 'cpp_inside_das'],
      },
      // D52: in Anexo IV the company also pays 20% of the pró-labore outside the DAS (C.3.3), which the gain includes.
      {
        method: 'lower_tax',
        summary:
          'Menos INSS e imposto de renda sobre o pró-labore, e menos contribuição da empresa ao INSS sobre o pró-labore (CPP), que no Anexo IV é paga fora do DAS, a partir do mês indicado.',
        firstEffect: 'regime_from',
        refIds: [
          'lei8212-1991/art21/caput',
          'lei8212-1991/art22/iii',
          'lc123-2006/art18/p5-c',
          'lei15191-2025/art2',
        ],
        appliesIf: ['pro_labore_lowered', 'cpp_outside_das'],
      },
    ],
  },

  // Research 08 §3. Which documents prove the export is research 08 §11, item 8 (noSource).
  R05: {
    steps: [
      {
        id: 'R05.action.1',
        who: 'you_or_accountant',
        what: `Confirme com o contador que o serviço conta como exportação: ${EXPORT_TEST}.`,
        refIds: [
          'res-cgsn140-2018/art25/p4',
          'res-cgsn140-2018/art25/p4-a',
          'res-cgsn190-2026/art1/res140-art25',
          'lc214-2025/art80',
          'lc116-2003/art2',
        ],
      },
      {
        id: 'R05.action.2',
        who: 'accountant',
        what: 'No PGDAS-D de cada mês, lance a receita do exterior como mercado externo, na atividade de serviços para o exterior, e gere o DAS.',
        where: { name: PGDAS_D, path: `${DECLARAR} › "9 - Prestação de Serviços para o exterior"` },
        from: 'start',
        until: 'das_due',
        refIds: [
          'manual-pgdas-d#6.4',
          'manual-pgdas-d#6.5',
          'res-cgsn140-2018/art25/p3',
          'res-cgsn190-2026/art1/res140-art25',
          'res-cgsn140-2018/art40/p3',
        ],
      },
      {
        id: 'R05.action.3',
        who: 'you',
        what: 'Guarde os documentos que sustentam essa apuração enquanto o Fisco ainda puder revisá-la.',
        refIds: ['res-cgsn140-2018/art66', 'lei5172-1966/art173'],
      },
      noSource('R05.action.4', 'accountant', 'Quais documentos provam a exportação?'),
    ],
    receive: [
      {
        method: 'lower_tax',
        summary: 'O DAS do próprio mês já sai menor, sem pedido de devolução.',
        firstEffect: 'start',
        refIds: ['res-cgsn140-2018/art25/p3', 'res-cgsn190-2026/art1/res140-art25'],
      },
    ],
  },

  // Research 08 §0 and §4 (8 steps: the gov.br/e-CAC access step of §0 is .3). Which payment batch a claim falls in,
  // the SP ISS analysis time and whether "Autorizações de Acesso" covers the claim are §11 items 1, 3 and 4: not stated.
  'R05-REC': {
    steps: [
      {
        id: 'R05-REC.action.1',
        who: 'accountant',
        what: `Confirme, mês a mês, que a receita do exterior era exportação: ${EXPORT_TEST}.`,
        refIds: ['res-cgsn140-2018/art25/p4', 'res-cgsn140-2018/art25/p4-a'],
      },
      {
        id: 'R05-REC.action.2',
        who: 'you',
        what: 'Cadastre no banco da empresa uma chave Pix igual ao CNPJ: a devolução federal só é paga nessa chave.',
        where: { name: 'Banco da empresa' },
        refIds: ['manual-restituicao-sn-2025-10-20#3.1.1', 'pr-simples-2026-10-09#10.6'],
      },
      {
        id: 'R05-REC.action.3',
        who: 'you',
        what: 'Tenha uma conta gov.br nível prata ou ouro e entre no e-CAC com o perfil do CNPJ da empresa. Para dar acesso ao contador, a autorização fica em Portal de Serviços Digitais › Minhas Autorizações de Acesso; confirme com ele se ela cobre o pedido de restituição.',
        where: {
          ...E_CAC,
          path: 'Alterar perfil de acesso › CNPJ da empresa › aba "Simples Nacional"',
        },
        refIds: [
          'pr-simples-2026-10-09#10.5',
          'manual-restituicao-sn-2025-10-20#2',
          'rfb-autorizacoes-de-acesso#2-4',
        ],
      },
      {
        id: 'R05-REC.action.4',
        who: 'accountant',
        what: 'Retifique o PGDAS-D de cada mês, do mais antigo para o mais novo, lançando a receita do exterior como mercado externo, e retifique também os meses seguintes, porque a receita acumulada muda. Faça isso antes de pedir a devolução: pedir sem pagamento a maior gera a cobrança do débito original. A retificação pode ficar retida para análise.',
        where: { name: PGDAS_D, path: DECLARAR },
        until: 'earliest_claim_until',
        refIds: [
          'manual-pgdas-d#6.10',
          'manual-pgdas-d#6.10.3',
          'manual-pgdas-d#6.4',
          'res-cgsn140-2018/art39-a',
          'manual-restituicao-sn-2025-10-20#3.1.1',
        ],
      },
      {
        id: 'R05-REC.action.5',
        who: 'you_or_accountant',
        what: 'Espere a retificação aparecer no sistema de cobrança antes de pedir: em geral, leva até cinco dias úteis.',
        refIds: ['manual-pgdas-d#6.10.1'],
      },
      {
        id: 'R05-REC.action.6',
        who: 'you_or_accountant',
        what: 'Peça a devolução da parte federal no Pedido Eletrônico de Restituição: um pedido por DAS, com o mês de apuração e os valores a restituir por tributo. Cada mês só pode ser pedido a partir da data e até o prazo final mostrados na tabela.',
        where: {
          ...E_CAC,
          path: 'Simples Nacional › Pedido Eletrônico de Restituição › Solicitar Restituição',
        },
        until: 'earliest_claim_until',
        refIds: [
          'manual-restituicao-sn-2025-10-20#3.1',
          'manual-restituicao-sn-2025-10-20#3.1.1',
          'portal-simples#restituicao-compensacao',
          'res-cgsn140-2018/art129',
          'lei5172-1966/art168',
          'lei5172-1966/art210',
          'lei810-1949/art1',
          'pr-simples-2026-10-09#10.8',
        ],
      },
      {
        id: 'R05-REC.action.7',
        who: 'you',
        what: 'Peça a devolução do ISS à Prefeitura de São Paulo pelo SAV, entrando com Senha Web, gov.br ou certificado digital: serviço Restituição de Tributos, tributo ISS, origem Pagamento a Maior ou em Duplicidade, marcando a opção de optante do Simples Nacional. Informe a conta para o crédito na tela de dados bancários.',
        where: {
          name: 'SAV da Prefeitura de São Paulo',
          path: 'Restituição, Regularização de Pagamentos e CADIN › Restituição e Devolução de Valores › Restituição de Tributos',
          url: 'https://sav-internet.sf.prefeitura.sp.gov.br/',
        },
        documents: [
          'Documento de identificação do representante legal',
          'Contrato social e alterações',
          'Guias e comprovantes de pagamento (os DAS)',
          'Procuração, se for procurador',
        ],
        refIds: [
          'sp-fazenda#restituicao-iss',
          'sp-manual-sav-2.15#3.1',
          'sp-manual-sav-2.15#15.1',
          'sp-manual-sav-2.15#15.2',
          'in-sf-surem10-2019/art1-a/caput',
          'in-sf-surem10-2019/art1-a/ii',
          'res-cgsn140-2018/art130',
          'manual-restituicao-sn-2025-10-20#3.1.1',
        ],
        appliesIf: ['iss_positive', 'municipality_sao_paulo'],
      },
      {
        id: 'R05-REC.action.7',
        who: 'you_or_accountant',
        what: 'Peça a devolução do ISS diretamente à prefeitura da sua cidade: o pedido federal não devolve o ISS.',
        where: { name: 'Prefeitura da sua cidade' },
        refIds: [
          'res-cgsn140-2018/art130',
          'pr-simples-2026-10-09#10.5',
          'manual-restituicao-sn-2025-10-20#3.1.1',
        ],
        appliesIf: ['iss_positive', 'municipality_other'],
      },
      noSource(
        'R05-REC.action.10',
        'you_or_accountant',
        'Qual o procedimento da sua prefeitura para devolver o ISS?',
        ['iss_positive', 'municipality_other'],
      ),
      {
        id: 'R05-REC.action.8',
        who: 'you',
        what: 'Acompanhe o pedido no aplicativo: a situação Deferido Total quer dizer que o crédito foi reconhecido e aguarda pagamento.',
        where: {
          ...E_CAC,
          path: 'Simples Nacional › Pedido Eletrônico de Restituição › Consultar Pedidos de Restituição',
        },
        refIds: ['manual-restituicao-sn-2025-10-20#3.2', 'pr-simples-2026-10-09#10.6'],
      },
      {
        id: 'R05-REC.action.9',
        who: 'you_or_accountant',
        what: 'Peça a devolução do ICMS diretamente ao estado, o ente responsável pelo imposto: o pedido federal não devolve o ICMS.',
        where: { name: 'Estado da empresa' },
        refIds: [
          'res-cgsn140-2018/art130',
          'pr-simples-2026-10-09#10.5',
          'manual-restituicao-sn-2025-10-20#3.1.1',
        ],
        appliesIf: ['icms_positive'],
      },
      noSource(
        'R05-REC.action.11',
        'you_or_accountant',
        'Qual o procedimento do seu estado para devolver o ICMS?',
        ['icms_positive'],
      ),
    ],
    receive: [
      {
        method: 'refund_pix_cnpj',
        summary:
          'Pix na conta da empresa (chave igual ao CNPJ), nos lotes mensais de pagamento, corrigido pela Selic. Se a empresa tiver débito federal, a Receita propõe usar o crédito para quitá-lo.',
        refIds: [
          'manual-restituicao-sn-2025-10-20#3.1.1',
          'manual-restituicao-sn-2025-10-20#4',
          'res-cgsn140-2018/art132',
          'lc123-2006/art21/p6',
          'lc123-2006/art21/p10',
        ],
      },
      {
        method: 'refund_municipality',
        summary:
          'Crédito na conta informada na tela de dados bancários do pedido no SAV. O prazo de análise da prefeitura não foi confirmado.',
        refIds: ['sp-manual-sav-2.15#15.1', 'res-cgsn140-2018/art130'],
        appliesIf: ['iss_positive', 'municipality_sao_paulo'],
      },
      {
        method: 'refund_municipality',
        summary: 'Pedido à prefeitura; prazo de análise não confirmado.',
        refIds: ['res-cgsn140-2018/art130', 'manual-restituicao-sn-2025-10-20#3.1.1'],
        appliesIf: ['iss_positive', 'municipality_other'],
      },
      {
        method: 'refund_state',
        summary: 'Pedido ao estado, o ente responsável pelo ICMS; prazo de análise não confirmado.',
        refIds: ['res-cgsn140-2018/art130', 'pr-simples-2026-10-09#10.5'],
        appliesIf: ['icms_positive'],
      },
      {
        method: 'offset',
        summary:
          'Alternativa à devolução: usar o crédito para pagar DAS do mesmo tributo e do mesmo ente (Compensação a Pedido), com débitos vencidos ou a vencer.',
        refIds: [
          'res-cgsn140-2018/art131',
          'lc123-2006/art21/p11',
          'pr-simples-2026-10-09#10.4',
          'portal-simples#restituicao-compensacao',
        ],
      },
    ],
  },

  // Research 08 §5. The monofásico NCM lists were not captured (§11, item 9): noSource.
  R06: {
    steps: [
      noSource(
        'R06.action.1',
        'accountant',
        'Quais produtos que você revende têm PIS e Cofins monofásico?',
      ),
      {
        id: 'R06.action.2',
        who: 'accountant',
        what: 'No PGDAS-D, separe a receita desses produtos e marque tributação monofásica para PIS e Cofins. Essa receita continua na base dos demais tributos do Simples.',
        where: {
          name: PGDAS_D,
          path: `${DECLARAR} › "1 - Revenda de mercadorias, exceto para o exterior" › COFINS – Tributação monofásica; PIS – Tributação monofásica`,
        },
        from: 'start',
        refIds: [
          'manual-pgdas-d#6.5',
          'pr-simples-2026-10-09#7.2',
          'pr-simples-2026-10-09#7.4',
          'lc123-2006/art18/p4-a',
          'res-cgsn140-2018/art25/p6',
          'res-cgsn190-2026/art1/res140-art25',
        ],
      },
    ],
    receive: [
      {
        method: 'lower_tax',
        summary: 'O DAS do mês sai menor sobre a receita desses produtos.',
        firstEffect: 'start',
        refIds: ['pr-simples-2026-10-09#7.4', 'lc123-2006/art18/p4-a'],
      },
    ],
  },

  // Research 08 §6. The DIRPF 2027 calendar is not published (§11, item 10): noSource.
  R04: {
    steps: [
      {
        id: 'R04.action.1',
        who: 'you',
        what: 'Contribua com R$ {R04.PGBL_CONTRIBUTION} para um PGBL até o fim do ano: só conta o que for pago dentro do ano, até o limite da lei, e você também precisa contribuir para o INSS.',
        where: { name: 'Instituição do plano de previdência' },
        until: 'year_end',
        refIds: ['pr-irpf-2026#pgbl', 'lei9532-1997/art11'],
      },
      {
        id: 'R04.action.2',
        who: 'you_or_accountant',
        what: 'Na declaração, use as deduções legais (modelo completo), não o desconto simplificado.',
        refIds: ['lei9250-1995/art10'],
      },
      {
        id: 'R04.action.3',
        who: 'you_or_accountant',
        what: 'Informe o PGBL na ficha Pagamentos Efetuados, no código de previdência complementar.',
        where: {
          name: 'Declaração do IRPF',
          path: 'Pagamentos Efetuados › "36 - Previdência Complementar (inclusive FAPI)"',
        },
        refIds: ['pr-irpf-2026#pgbl'],
      },
      noSource(
        'R04.action.4',
        'you_or_accountant',
        'Qual o prazo de entrega da próxima declaração e quando saem os lotes de restituição?',
      ),
    ],
    receive: [
      {
        method: 'irpf_refund',
        summary:
          'Na restituição do imposto de renda, no lote em que a sua declaração cair. Se houver imposto a pagar, o ganho vem como imposto menor.',
        refIds: ['rfb-noticia-2026-03-irpf-2026', 'pr-irpf-2026#pgbl'],
      },
    ],
  },

  // Research 08 §7; R02.3 and `irpf_refund` per decision D29 (PLAN §18, 16/11).
  R02: {
    steps: [
      {
        id: 'R02.action.1',
        who: 'you',
        what: 'Saiba quando há retenção: se a mesma empresa pagar a você, no mesmo mês, lucros acima do limite mensal da lei, o imposto é retido na fonte sobre o total. Os pagamentos do mês são somados, sem deduções, e a regra vale para empresas do Simples.',
        refIds: ['lei9250-1995/art6-a', 'rfb-pr-altas-rendas-2025-12-19#q10'],
      },
      {
        id: 'R02.action.2',
        who: 'you',
        what: 'Se houver retenção, pague o DARF do imposto retido, que o contador gera, até o último dia útil do segundo decêndio do mês seguinte ao da distribuição. A data indicada supõe uma nova distribuição acima do limite no mesmo mês do ano em que houve retenção.',
        where: { name: 'DARF', path: 'Código de receita "1841 - IRRF - Lucros ou Dividendos"' },
        until: 'darf_irrf_due',
        refIds: ['rfb-pr-altas-rendas-2025-12-19#q6'],
      },
      {
        id: 'R02.action.3',
        who: 'you',
        what: 'Como a sua renda total do ano fica abaixo do limite do imposto mínimo, o imposto retido sobre os lucros pode voltar para você na declaração anual do imposto de renda.',
        where: { name: 'Declaração do IRPF' },
        refIds: ['rfb-pr-altas-rendas-2025-12-19#q4', 'lei9250-1995/art16-a/caput'],
        appliesIf: ['irpfm_below'],
      },
      {
        id: 'R02.action.4',
        who: 'you_or_accountant',
        // Source audit S1 (16/11): since Lei 15.270/2025 the art. 14 exemption only says what is exempt in the annual
        // return; it no longer stops the withholding (P&R Altas Rendas, perg. 10; P&R IRPF 2026, perg. 183).
        what: 'Com o contador, veja quanto lucro conta como isento na declaração anual: sem contabilidade completa, o limite parte da presunção do imposto de renda sobre a receita, menos o IRPJ pago no Simples; com escrituração que mostre lucro maior, vale o lucro contábil. Essa isenção não evita a retenção na fonte quando a mesma empresa paga acima do limite mensal da lei, e esses lucros entram na soma da renda do imposto mínimo.',
        refIds: [
          'lc123-2006/art14',
          'pr-irpf-2026#183',
          'lei9250-1995/art6-a',
          'rfb-pr-altas-rendas-2025-12-19#q10',
          'lei9250-1995/art16-a/caput',
        ],
      },
    ],
    receive: [
      {
        method: 'irpf_refund',
        summary: 'O imposto retido volta na restituição da declaração anual do imposto de renda.',
        refIds: ['rfb-pr-altas-rendas-2025-12-19#q4'],
        appliesIf: ['irpfm_below'],
      },
    ],
  },

  // Research 08 does not cover R03 (README Q8). Source audit (16/11): the communication of the exclusion is sourced by
  // LC 123, arts. 3º §§ 9º–9º-A, 30 and 18-A § 7º, and P&R Simples 12.3; the rest stays a noSource question.
  R03: {
    steps: [
      {
        id: 'R03.action.1',
        who: 'accountant',
        what: 'Comunique à Receita a exclusão do Simples: até o último dia útil do mês seguinte ao excesso, se a receita do ano passar o teto em mais de vinte por cento; até o último dia útil de janeiro do ano seguinte, se passar em até vinte por cento.',
        where: { name: 'Receita Federal' },
        refIds: [
          'lc123-2006/art30',
          'lc123-2006/art3/p9',
          'lc123-2006/art3/p9-a',
          'pr-simples-2026-10-09#12.3',
        ],
        appliesIf: ['regime_simples', 'limit_exceeded'],
      },
      {
        id: 'R03.action.1',
        who: 'accountant',
        what: 'Comunique à Receita o desenquadramento do MEI até o último dia útil do mês seguinte ao excesso.',
        where: { name: 'Receita Federal' },
        refIds: ['lc123-2006/art18-a/p7'],
        appliesIf: ['regime_mei', 'limit_exceeded'],
      },
      noSource(
        'R03.action.2',
        'accountant',
        'Qual o prazo exato no seu caso e o que muda nos impostos?',
      ),
    ],
    receive: [],
  },

  // Research 08 §8. How to regularize past payments is §11, item 12 (noSource).
  A01: {
    steps: [
      {
        id: 'A01.action.1',
        who: 'you',
        what: 'Pare de pagar contas pessoais com a conta ou o cartão da empresa. Quando a empresa paga com frequência obrigações do sócio, há confusão patrimonial, e o juiz pode estender dívidas da empresa ao patrimônio do sócio.',
        where: { name: 'Conta e cartão da empresa' },
        refIds: ['lei10406-2002/art50'],
      },
      {
        id: 'A01.action.2',
        who: 'accountant',
        what: 'Mantenha o livro-caixa com toda a movimentação bancária da empresa identificada. Sem isso, a empresa pode ser excluída do Simples.',
        where: { name: 'Livro-caixa da empresa' },
        refIds: ['lc123-2006/art26/p2', 'lc123-2006/art29/viii'],
      },
      noSource(
        'A01.action.3',
        'accountant',
        'Como acertar os pagamentos pessoais que a empresa já fez?',
      ),
    ],
    receive: [],
  },

  // Research 08 §9 and §11-A, item 2 (never "dividendos podem ser requalificados": §11, item 13).
  A02: {
    steps: [
      {
        id: 'A02.action.1',
        who: 'you',
        what: 'Entenda a regra: o sócio que recebe remuneração pelo trabalho na empresa é segurado obrigatório do INSS, e o salário de contribuição mínimo é o piso da categoria ou, se não houver piso, o salário mínimo.',
        refIds: ['lei8212-1991/art12/v', 'lei8212-1991/art28/p3'],
      },
      {
        id: 'A02.action.2',
        who: 'accountant',
        what: 'Regularize o pró-labore: informe-o no eSocial, feche a folha do mês e transmita a DCTFWeb.',
        where: { name: 'eSocial e DCTFWeb', path: 'Eventos S-1200 e S-1299' },
        until: 'esocial_due',
        refIds: [...ESOCIAL_REFS, 'rfb-noticia-2023-10-prazo-dctfweb'],
      },
      {
        id: 'A02.action.3',
        who: 'you',
        what: INSS_TEXT,
        until: 'inss_due',
        refIds: ['lei10666-2003/art4'],
      },
    ],
    receive: [],
  },
};
