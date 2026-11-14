// 2026 parameters (ENGINE-SPEC A.1–A.5), one record per row, verified at the primary source on the date in
// `verifiedAt`. Statuses and fallbacks follow the ENGINE-SPEC status column and H.1.
import { brl, rate } from '../money.ts';
import type { Tax } from '../types.ts';
import type { AnyParameterEntry, ParameterSource, SimplesAnexoTable } from './types.ts';

const VERIFIED = '2026-11-12' as const;
/** H.1 closed at the primary source (capture index: docs/conferencias/fontes-oficiais/E1-H1-fechamento.md). */
const VERIFIED_H1 = '2026-11-14' as const;
const FROM = '2026-01' as const;
const PUBLISHED_THROUGH = '2026-12' as const;

const SOURCE_URL = {
  receitaTables2026:
    'https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026',
  receitaLei15270Examples:
    'https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/exemplos-de-aplicacao-da-lei-15-270-2025',
  lei9250: 'https://www.planalto.gov.br/ccivil_03/leis/l9250.htm',
  lei15270: 'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/L15270.htm',
  lei9532: 'https://www.planalto.gov.br/ccivil_03/leis/l9532.htm',
  lei11053: 'https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2004/lei/l11053.htm',
  inssTable:
    'https://www.gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal',
  lei8212: 'https://www.planalto.gov.br/ccivil_03/leis/l8212cons.htm',
  lei10666: 'https://www.planalto.gov.br/ccivil_03/leis/2003/l10.666.htm',
  decreto12797: 'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/decreto/d12797.htm',
  lc123: 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm',
  lc155: 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp155.htm',
  pgdasManual:
    'https://www8.receita.fazenda.gov.br/SimplesNacional/Arquivos/manual/MANUAL_PGDAS-D_2018_V4.pdf',
  resCgsn140:
    'http://normas.receita.fazenda.gov.br/sijut2consulta/link.action?idAto=92278&visao=compilado',
  lc238: 'https://planalto.gov.br/ccivil_03/leis/lcp/lcp238.htm',
  rfbDividendsQa:
    'https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/perguntas-e-respostas/dirf/manual_padrao_rfb_per_tributacao_cotin_v-19-12-2025.pdf',
  ctn: 'https://www.planalto.gov.br/ccivil_03/leis/l5172compilado.htm',
  sgs432: 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados',
} as const;

const src = (regulation: string, provision: string, url: string): ParameterSource => ({
  regulation,
  provision,
  url,
});

const p = (s: string) => rate(s);

const ANEXO_I: SimplesAnexoTable = {
  brackets: [
    {
      bracket: 1,
      upTo: brl('180.000,00'),
      nominal: p('0.04'),
      deduction: brl('0,00'),
      apportionment: {
        IRPJ: p('5.50'),
        CSLL: p('3.50'),
        COFINS: p('12.74'),
        PIS: p('2.76'),
        CPP: p('41.50'),
        ICMS: p('34.00'),
      },
    },
    {
      bracket: 2,
      upTo: brl('360.000,00'),
      nominal: p('0.073'),
      deduction: brl('5.940,00'),
      apportionment: {
        IRPJ: p('5.50'),
        CSLL: p('3.50'),
        COFINS: p('12.74'),
        PIS: p('2.76'),
        CPP: p('41.50'),
        ICMS: p('34.00'),
      },
    },
    {
      bracket: 3,
      upTo: brl('720.000,00'),
      nominal: p('0.095'),
      deduction: brl('13.860,00'),
      apportionment: {
        IRPJ: p('5.50'),
        CSLL: p('3.50'),
        COFINS: p('12.74'),
        PIS: p('2.76'),
        CPP: p('42.00'),
        ICMS: p('33.50'),
      },
    },
    {
      bracket: 4,
      upTo: brl('1.800.000,00'),
      nominal: p('0.107'),
      deduction: brl('22.500,00'),
      apportionment: {
        IRPJ: p('5.50'),
        CSLL: p('3.50'),
        COFINS: p('12.74'),
        PIS: p('2.76'),
        CPP: p('42.00'),
        ICMS: p('33.50'),
      },
    },
    {
      bracket: 5,
      upTo: brl('3.600.000,00'),
      nominal: p('0.143'),
      deduction: brl('87.300,00'),
      apportionment: {
        IRPJ: p('5.50'),
        CSLL: p('3.50'),
        COFINS: p('12.74'),
        PIS: p('2.76'),
        CPP: p('42.00'),
        ICMS: p('33.50'),
      },
    },
    {
      bracket: 6,
      upTo: brl('4.800.000,00'),
      nominal: p('0.19'),
      deduction: brl('378.000,00'),
      apportionment: {
        IRPJ: p('13.50'),
        CSLL: p('10.00'),
        COFINS: p('28.27'),
        PIS: p('6.13'),
        CPP: p('42.10'),
      },
    },
  ],
  // ENGINE-SPEC A.3 and G4: Anexo I has no ISS/ICMS redistribution note.
};

const ANEXO_III: SimplesAnexoTable = {
  brackets: [
    {
      bracket: 1,
      upTo: brl('180.000,00'),
      nominal: p('0.06'),
      deduction: brl('0,00'),
      apportionment: {
        IRPJ: p('4.00'),
        CSLL: p('3.50'),
        COFINS: p('12.82'),
        PIS: p('2.78'),
        CPP: p('43.40'),
        ISS: p('33.50'),
      },
    },
    {
      bracket: 2,
      upTo: brl('360.000,00'),
      nominal: p('0.112'),
      deduction: brl('9.360,00'),
      apportionment: {
        IRPJ: p('4.00'),
        CSLL: p('3.50'),
        COFINS: p('14.05'),
        PIS: p('3.05'),
        CPP: p('43.40'),
        ISS: p('32.00'),
      },
    },
    {
      bracket: 3,
      upTo: brl('720.000,00'),
      nominal: p('0.135'),
      deduction: brl('17.640,00'),
      apportionment: {
        IRPJ: p('4.00'),
        CSLL: p('3.50'),
        COFINS: p('13.64'),
        PIS: p('2.96'),
        CPP: p('43.40'),
        ISS: p('32.50'),
      },
    },
    {
      bracket: 4,
      upTo: brl('1.800.000,00'),
      nominal: p('0.16'),
      deduction: brl('35.640,00'),
      apportionment: {
        IRPJ: p('4.00'),
        CSLL: p('3.50'),
        COFINS: p('13.64'),
        PIS: p('2.96'),
        CPP: p('43.40'),
        ISS: p('32.50'),
      },
    },
    {
      bracket: 5,
      upTo: brl('3.600.000,00'),
      nominal: p('0.21'),
      deduction: brl('125.640,00'),
      apportionment: {
        IRPJ: p('4.00'),
        CSLL: p('3.50'),
        COFINS: p('12.82'),
        PIS: p('2.78'),
        CPP: p('43.40'),
        ISS: p('33.50'),
      },
    },
    {
      bracket: 6,
      upTo: brl('4.800.000,00'),
      nominal: p('0.33'),
      deduction: brl('648.000,00'),
      apportionment: {
        IRPJ: p('35.00'),
        CSLL: p('15.00'),
        COFINS: p('16.03'),
        PIS: p('3.47'),
        CPP: p('30.50'),
      },
    },
  ],
  issCap: {
    bracket: 5,
    threshold: p('0.1492537'),
    fixedIssRate: p('0.05'),
    federalSplit: {
      IRPJ: p('6.02'),
      CSLL: p('5.26'),
      COFINS: p('19.28'),
      PIS: p('4.18'),
      CPP: p('65.26'),
    },
  },
};

const ANEXO_V: SimplesAnexoTable = {
  brackets: [
    {
      bracket: 1,
      upTo: brl('180.000,00'),
      nominal: p('0.155'),
      deduction: brl('0,00'),
      apportionment: {
        IRPJ: p('25.00'),
        CSLL: p('15.00'),
        COFINS: p('14.10'),
        PIS: p('3.05'),
        CPP: p('28.85'),
        ISS: p('14.00'),
      },
    },
    {
      bracket: 2,
      upTo: brl('360.000,00'),
      nominal: p('0.18'),
      deduction: brl('4.500,00'),
      apportionment: {
        IRPJ: p('23.00'),
        CSLL: p('15.00'),
        COFINS: p('14.10'),
        PIS: p('3.05'),
        CPP: p('27.85'),
        ISS: p('17.00'),
      },
    },
    {
      bracket: 3,
      upTo: brl('720.000,00'),
      nominal: p('0.195'),
      deduction: brl('9.900,00'),
      apportionment: {
        IRPJ: p('24.00'),
        CSLL: p('15.00'),
        COFINS: p('14.92'),
        PIS: p('3.23'),
        CPP: p('23.85'),
        ISS: p('19.00'),
      },
    },
    {
      bracket: 4,
      upTo: brl('1.800.000,00'),
      nominal: p('0.205'),
      deduction: brl('17.100,00'),
      apportionment: {
        IRPJ: p('21.00'),
        CSLL: p('15.00'),
        COFINS: p('15.74'),
        PIS: p('3.41'),
        CPP: p('23.85'),
        ISS: p('21.00'),
      },
    },
    {
      bracket: 5,
      upTo: brl('3.600.000,00'),
      nominal: p('0.23'),
      deduction: brl('62.100,00'),
      apportionment: {
        IRPJ: p('23.00'),
        CSLL: p('12.50'),
        COFINS: p('14.10'),
        PIS: p('3.05'),
        CPP: p('23.85'),
        ISS: p('23.50'),
      },
    },
    {
      bracket: 6,
      upTo: brl('4.800.000,00'),
      nominal: p('0.305'),
      deduction: brl('540.000,00'),
      apportionment: {
        IRPJ: p('35.00'),
        CSLL: p('15.50'),
        COFINS: p('16.44'),
        PIS: p('3.56'),
        CPP: p('29.50'),
      },
    },
  ],
};

const EXPORT_EXCLUDED_2026: readonly Tax[] = ['COFINS', 'PIS', 'IPI', 'ICMS', 'ISS'];

const IR_MONTHLY_REDUCTION = {
  fullUpTo: brl('5.000,00'),
  full: brl('312,89'),
  linearUpTo: brl('7.350,00'),
  constant: brl('978,62'),
  coefficient: p('0.133145'),
};

export const PARAMETERS_2026: readonly AnyParameterEntry[] = [
  // ---------- A.1 IRPF ----------
  {
    key: 'irpf.monthly.table',
    value: {
      brackets: [
        { upTo: brl('2.428,80'), rate: p('0'), deduction: brl('0,00') },
        { upTo: brl('2.826,65'), rate: p('0.075'), deduction: brl('182,16') },
        { upTo: brl('3.751,05'), rate: p('0.15'), deduction: brl('394,16') },
        { upTo: brl('4.664,68'), rate: p('0.225'), deduction: brl('675,49') },
        { upTo: null, rate: p('0.275'), deduction: brl('908,73') },
      ],
    },
    source: src(
      'Lei 15.191/2025 (Receita, "Tributação de 2026")',
      'tabela progressiva mensal',
      SOURCE_URL.receitaTables2026,
    ),
    effectiveFrom: FROM,
    publishedThrough: PUBLISHED_THROUGH,
    verifiedAt: VERIFIED,
    status: 'verified',
    note: 'Conferida também na API do simulador da Receita (gpFaixasTblProg[].vaAjLimiteMe, vaAjDescontoMe).',
  },
  {
    key: 'irpf.monthly.simplifiedDiscount',
    value: brl('607,20'),
    source: src('Lei 9.250/1995', 'art. 4º, § 2º', SOURCE_URL.lei9250),
    effectiveFrom: FROM,
    publishedThrough: PUBLISHED_THROUGH,
    verifiedAt: VERIFIED,
    status: 'verified',
    note: '25% × 2.428,80; simulador da Receita (vaDeducSimpMe).',
  },
  {
    key: 'irpf.monthly.dependent',
    value: brl('189,59'),
    source: src('Lei 9.250/1995', 'art. 4º, III', SOURCE_URL.lei9250),
    effectiveFrom: FROM,
    verifiedAt: VERIFIED,
    status: 'verified',
  },
  {
    key: 'irpf.monthly.reduction',
    value: IR_MONTHLY_REDUCTION,
    source: src('Lei 9.250/1995 (redação da Lei 15.270/2025)', 'art. 3º-A', SOURCE_URL.lei15270),
    effectiveFrom: FROM,
    verifiedAt: VERIFIED,
    status: 'verified',
    note:
      'RT = rendimento tributável bruto do mês; limitada ao imposto da tabela (§ 1º). Exemplos da Receita: ' +
      SOURCE_URL.receitaLei15270Examples,
  },
  {
    key: 'irpf.annual.table',
    value: {
      brackets: [
        { upTo: brl('29.145,60'), rate: p('0'), deduction: brl('0,00') },
        { upTo: brl('33.919,80'), rate: p('0.075'), deduction: brl('2.185,92') },
        { upTo: brl('45.012,60'), rate: p('0.15'), deduction: brl('4.729,91') },
        { upTo: brl('55.976,16'), rate: p('0.225'), deduction: brl('8.105,85') },
        { upTo: null, rate: p('0.275'), deduction: brl('10.904,66') },
      ],
    },
    source: src(
      'Lei 15.191/2025 (Receita, "Tributação de 2026")',
      'tabela progressiva anual (AC 2026, DIRPF 2027)',
      SOURCE_URL.receitaTables2026,
    ),
    effectiveFrom: FROM,
    publishedThrough: PUBLISHED_THROUGH,
    verifiedAt: VERIFIED,
    status: 'verified',
  },
  {
    key: 'irpf.annual.reduction',
    value: {
      fullUpTo: brl('60.000,00'),
      full: brl('2.694,15'),
      linearUpTo: brl('88.200,00'),
      constant: brl('8.429,73'),
      coefficient: p('0.095575'),
    },
    source: src('Lei 9.250/1995 (redação da Lei 15.270/2025)', 'art. 11-A', SOURCE_URL.lei15270),
    effectiveFrom: FROM,
    verifiedAt: VERIFIED,
    status: 'verified',
  },
  {
    key: 'irpf.annual.simplifiedDiscount',
    value: { rate: p('0.20'), cap: brl('17.640,00') },
    source: src(
      'Lei 9.250/1995 (redação da Lei 15.270/2025)',
      'art. 10, caput e inciso X',
      SOURCE_URL.lei9250,
    ),
    effectiveFrom: FROM,
    verifiedAt: VERIFIED,
    status: 'verified',
  },
  {
    key: 'irpf.annual.dependent',
    value: brl('2.275,08'),
    source: src('Lei 9.250/1995', 'art. 8º, II, c', SOURCE_URL.lei9250),
    effectiveFrom: FROM,
    verifiedAt: VERIFIED,
    status: 'verified',
  },
  {
    key: 'irpf.annual.education',
    value: brl('3.561,50'),
    source: src('Lei 9.250/1995', 'art. 8º, II, b', SOURCE_URL.lei9250),
    effectiveFrom: FROM,
    verifiedAt: VERIFIED,
    status: 'verified',
  },
  {
    key: 'irpf.annual.health',
    value:
      'sem limite; médicos, dentistas, psicólogos, fisioterapeutas, fonoaudiólogos, terapeutas ocupacionais, hospitais, exames laboratoriais, serviços radiológicos, aparelhos e próteses ortopédicas e dentárias; planos de saúde; só titular e dependentes; exige CPF/CNPJ do beneficiário; valores reembolsados não contam',
    source: src('Lei 9.250/1995', 'art. 8º, II, a, e § 2º', SOURCE_URL.lei9250),
    effectiveFrom: FROM,
    verifiedAt: VERIFIED,
    status: 'verified',
  },
  {
    key: 'irpf.pgbl.limit',
    value: p('0.12'),
    source: src('Lei 9.532/1997', 'art. 11', SOURCE_URL.lei9532),
    effectiveFrom: FROM,
    verifiedAt: VERIFIED,
    status: 'verified',
    note: 'Só no modelo completo; exige contribuição ao RGPS/RPPS (exceto aposentados, § 5º).',
  },
  {
    key: 'irpf.pgbl.referenceRedemptionRate',
    value: p('0.10'),
    source: src('Lei 11.053/2004', 'art. 1º', SOURCE_URL.lei11053),
    effectiveFrom: FROM,
    verifiedAt: VERIFIED_H1,
    status: 'verified',
    note: 'H.1 item 5 fechado: art. 1º, VI ("10% ... prazo de acumulação superior a 10 anos"); retenção definitiva (§ 2º); regime optativo, opção até o benefício ou o 1º resgate (§ 6º, Lei 14.803/2024). Captura: lei-11053-2004-planalto.md.',
  },

  // ---------- A.2 INSS and minimum wage ----------
  {
    key: 'inss.employee.brackets',
    value: [
      { upTo: brl('1.621,00'), rate: p('0.075') },
      { upTo: brl('2.902,84'), rate: p('0.09') },
      { upTo: brl('4.354,27'), rate: p('0.12') },
      { upTo: brl('8.475,55'), rate: p('0.14') },
    ],
    source: src(
      'Portaria Interministerial MPS/MF nº 13/2026',
      'tabela de contribuição mensal',
      SOURCE_URL.inssTable,
    ),
    effectiveFrom: FROM,
    publishedThrough: PUBLISHED_THROUGH,
    verifiedAt: VERIFIED,
    status: 'verified',
  },
  {
    key: 'inss.ceiling',
    value: brl('8.475,55'),
    source: src(
      'Portaria Interministerial MPS/MF nº 13/2026',
      'teto do salário de contribuição',
      SOURCE_URL.inssTable,
    ),
    effectiveFrom: FROM,
    publishedThrough: PUBLISHED_THROUGH,
    verifiedAt: VERIFIED,
    status: 'verified',
  },
  {
    key: 'inss.employee.maximum',
    value: brl('988,09'),
    source: src(
      'Portaria Interministerial MPS/MF nº 13/2026',
      'derivado: soma exata das faixas, um arredondamento no fim',
      SOURCE_URL.inssTable,
    ),
    effectiveFrom: FROM,
    publishedThrough: PUBLISHED_THROUGH,
    verifiedAt: VERIFIED,
    status: 'verified',
    note: '121,575 + 115,3656 + 174,1716 + 576,9792 = 988,0914 → 988,09.',
  },
  {
    key: 'inss.proLabore.rate',
    value: p('0.11'),
    source: src(
      'Lei 8.212/1991',
      'art. 21 e art. 30, § 4º (retenção: Lei 10.666/2003, art. 4º)',
      SOURCE_URL.lei8212,
    ),
    effectiveFrom: FROM,
    verifiedAt: VERIFIED,
    status: 'verified',
    note:
      '20% − dedução de 45% da contribuição da empresa limitada a 9%. Retenção: ' +
      SOURCE_URL.lei10666,
  },
  {
    key: 'inss.proLabore.maximum',
    value: brl('932,31'),
    source: src('Lei 8.212/1991', 'derivado: 11% × teto', SOURCE_URL.lei8212),
    effectiveFrom: FROM,
    publishedThrough: PUBLISHED_THROUGH,
    verifiedAt: VERIFIED,
    status: 'verified',
    note: '11% × 8.475,55 = 932,3105 → 932,31.',
  },
  {
    key: 'inss.cpp.rate',
    value: p('0.20'),
    source: src(
      'Lei 8.212/1991',
      'art. 22, III (no Simples: LC 123, art. 18, § 5º-C e art. 13, VI)',
      SOURCE_URL.lei8212,
    ),
    effectiveFrom: FROM,
    verifiedAt: VERIFIED_H1,
    status: 'verified',
    note: 'H.1 item 7 fechado: LC 123, art. 18, § 5º-C (Anexo IV: CPP fora do DAS). Captura: lc-123-2006-planalto-extrato-h1.md.',
  },
  {
    key: 'minimumWage',
    value: brl('1.621,00'),
    source: src('Decreto 12.797/2025', 'art. 1º', SOURCE_URL.decreto12797),
    effectiveFrom: FROM,
    publishedThrough: PUBLISHED_THROUGH,
    verifiedAt: VERIFIED,
    status: 'verified',
  },

  // ---------- A.3 Simples Nacional ----------
  {
    key: 'simples.anexo.I',
    value: ANEXO_I,
    source: src('LC 123/2006 (redação da LC 155/2016)', 'Anexo I', SOURCE_URL.lc155),
    effectiveFrom: FROM,
    publishedThrough: PUBLISHED_THROUGH,
    verifiedAt: VERIFIED,
    status: 'verified',
    note: 'Conferido célula a célula; bate com o Manual do PGDAS-D (Ex. 1–7).',
  },
  {
    key: 'simples.anexo.III',
    value: ANEXO_III,
    source: src('LC 123/2006 (redação da LC 155/2016)', 'Anexo III', SOURCE_URL.lc155),
    effectiveFrom: FROM,
    publishedThrough: PUBLISHED_THROUGH,
    verifiedAt: VERIFIED,
    status: 'verified',
  },
  {
    key: 'simples.anexo.V',
    value: ANEXO_V,
    source: src('LC 123/2006 (redação da LC 155/2016)', 'Anexo V', SOURCE_URL.lc155),
    effectiveFrom: FROM,
    publishedThrough: PUBLISHED_THROUGH,
    verifiedAt: VERIFIED,
    status: 'verified',
  },
  {
    key: 'simples.effectiveRate',
    value: { zeroRbt12Substitute: brl('1,00') },
    source: src('LC 123/2006', 'art. 18, § 1º-A; Manual do PGDAS-D, item 8.1', SOURCE_URL.lc123),
    effectiveFrom: FROM,
    verifiedAt: VERIFIED,
    status: 'verified',
  },
  {
    key: 'simples.calculation',
    value: 'O cálculo do valor devido no PGDAS-D considera todas as casas decimais',
    source: src('Manual do PGDAS-D', 'item 12', SOURCE_URL.pgdasManual),
    effectiveFrom: FROM,
    verifiedAt: VERIFIED,
    status: 'verified',
  },
  {
    key: 'simples.fatorR.limit',
    value: p('0.28'),
    source: src(
      'LC 123/2006 (redação da LC 155/2016)',
      'art. 18, §§ 5º-J e 5º-M',
      SOURCE_URL.lc123,
    ),
    effectiveFrom: FROM,
    verifiedAt: VERIFIED,
    status: 'verified',
  },
  {
    key: 'simples.fatorR.formula',
    value: { zeroPayroll: p('0.01'), zeroRevenue: p('0.28'), displayDecimals: 2 },
    source: src(
      'Res. CGSN 140/2018',
      'art. 26; Manual do PGDAS-D, itens 8.2 e 8.2.1',
      SOURCE_URL.pgdasManual,
    ),
    effectiveFrom: FROM,
    verifiedAt: VERIFIED,
    status: 'verified',
    note: 'FS12 ÷ RBT12 (RBT12 = interno + externo). FS12 = 0 e RBT12 > 0 → 0,01; FS12 > 0 e RBT12 = 0 → 0,28. Exibido truncado em 2 casas.',
  },
  {
    key: 'simples.fatorR.payroll',
    value:
      'montante pago, incluídos encargos, nos 12 meses anteriores a título de remunerações a pessoas físicas decorrentes do trabalho, incluídas retiradas de pró-labore, acrescidos do montante efetivamente recolhido a título de contribuição patronal previdenciária e para o FGTS; aluguéis e distribuição de lucros não entram',
    source: src('LC 123/2006', 'art. 18, § 24; Manual do PGDAS-D, item 8.2', SOURCE_URL.lc123),
    effectiveFrom: FROM,
    verifiedAt: VERIFIED,
    status: 'verified',
  },
  {
    key: 'simples.fatorR.window',
    value: { startOffset: -12, endOffset: -1 },
    source: src('LC 123/2006', 'art. 18, § 5º-K', SOURCE_URL.lc123),
    effectiveFrom: FROM,
    verifiedAt: VERIFIED,
    status: 'verified',
  },
  {
    key: 'simples.rbt12.window',
    value: { startOffset: -12, endOffset: -1 },
    source: src('LC 123/2006', 'art. 18, § 1º', SOURCE_URL.lc123),
    effectiveFrom: FROM,
    verifiedAt: VERIFIED,
    status: 'verified',
  },
  {
    key: 'simples.rbt12.byMarket',
    value: true,
    source: src(
      'Res. CGSN 140/2018',
      'art. 16, § 3º, II; LC 123/2006, art. 3º, § 15; Manual do PGDAS-D, Exemplo 6',
      SOURCE_URL.resCgsn140,
    ),
    effectiveFrom: FROM,
    verifiedAt: VERIFIED_H1,
    status: 'verified',
    note: 'H.1 item 2 fechado: Res. CGSN 140, art. 16, § 3º, II ("consideram-se separadamente, em bases distintas"). Captura: res-cgsn-140-2018-compilada.md.',
  },
  {
    key: 'simples.export.exclude',
    value: EXPORT_EXCLUDED_2026,
    source: src(
      'LC 123/2006 (redação da LC 155/2016)',
      'art. 18, § 4º-A, IV, e § 14',
      SOURCE_URL.lc123,
    ),
    effectiveFrom: FROM,
    verifiedAt: VERIFIED,
    status: 'verified',
    note: 'Res. CGSN 140, art. 25, § 3º.',
  },
  {
    key: 'simples.export.concept',
    value:
      'serviço a residente ou domiciliado no exterior com ingresso de divisas, excluídos os serviços desenvolvidos no Brasil cujo resultado aqui se verifique',
    source: src(
      'Res. CGSN 140/2018',
      'art. 25, § 4º; LC 116/2003, art. 2º, I e parágrafo único; PN COSIT 1/2018',
      SOURCE_URL.resCgsn140,
    ),
    effectiveFrom: FROM,
    verifiedAt: VERIFIED_H1,
    status: 'verified',
    note: 'H.1 itens 2 e 8 fechados: Res. CGSN 140, art. 25, § 4º (ingresso de divisas; o § 4º-A dispensa o ingresso quando os recursos ficam no exterior, Lei 11.371); LC 116, art. 2º, I e parágrafo único; PN COSIT 1/2018 só pela ementa. Continua exigindo confirmação do usuário (pergunta) e validação do contador.',
  },
  {
    key: 'simples.monofasico.exclude',
    value: ['PIS', 'COFINS'],
    source: src('LC 123/2006', 'art. 18, § 4º-A, I', SOURCE_URL.lc123),
    effectiveFrom: FROM,
    verifiedAt: VERIFIED,
    status: 'verified',
  },
  {
    key: 'simples.limits',
    value: { me: brl('360.000,00'), epp: brl('4.800.000,00'), sublimit: brl('3.600.000,00') },
    source: src('LC 123/2006', 'art. 3º, I, II e § 14; art. 13-A', SOURCE_URL.lc123),
    effectiveFrom: FROM,
    verifiedAt: VERIFIED,
    status: 'verified',
    note: 'A receita de exportação tem limite adicional próprio (Manual do PGDAS-D, item 8.4).',
  },
  {
    key: 'simples.excess',
    value: {
      tolerance: p('0.20'),
      ceilingWithTolerance: brl('5.760.000,00'),
      sublimitWithTolerance: brl('4.320.000,00'),
    },
    source: src('LC 123/2006', 'art. 3º, §§ 9º e 9º-A; art. 20, §§ 1º e 1º-A', SOURCE_URL.lc123),
    effectiveFrom: FROM,
    verifiedAt: VERIFIED_H1,
    status: 'verified',
    note: 'H.1 item 7 fechado com correção de citação: o "> 20% → a partir do mês seguinte" é do art. 3º, § 9º (com o § 9º-A para ≤ 20%); o § 10 trata do excesso no ano de início de atividade (EXECUTION §9). Captura: lc-123-2006-planalto-extrato-h1.md.',
  },

  // ---------- A.4 MEI ----------
  {
    key: 'mei.limit',
    value: { annual: brl('81.000,00'), monthlyAtStart: brl('6.750,00') },
    source: src('LC 123/2006 (redação da LC 188/2021)', 'art. 18-A, §§ 1º e 2º', SOURCE_URL.lc123),
    effectiveFrom: FROM,
    verifiedAt: VERIFIED,
    status: 'verified',
  },
  {
    key: 'mei.excess',
    value: { tolerance: p('0.20'), limitWithTolerance: brl('97.200,00') },
    source: src('LC 123/2006', 'art. 18-A, § 7º, III, "a" e "b", e § 10', SOURCE_URL.lc123),
    effectiveFrom: FROM,
    verifiedAt: VERIFIED,
    status: 'verified',
  },
  {
    key: 'mei.das.inss',
    value: brl('81,05'),
    source: src(
      'Portaria Interministerial MPS/MF nº 13/2026',
      '5% × salário mínimo (1.621,00)',
      SOURCE_URL.inssTable,
    ),
    effectiveFrom: FROM,
    publishedThrough: PUBLISHED_THROUGH,
    verifiedAt: VERIFIED,
    status: 'verified',
  },
  {
    key: 'mei.das.icmsIss',
    value: { icms: brl('1,00'), iss: brl('5,00') },
    source: src('LC 123/2006', 'art. 18-A, § 3º, V', SOURCE_URL.lc123),
    effectiveFrom: FROM,
    verifiedAt: VERIFIED_H1,
    status: 'verified',
    note: 'H.1 item 7 fechado: LC 123, art. 18-A, § 3º, V, b e c. Captura: lc-123-2006-planalto-extrato-h1.md.',
  },

  // ---------- A.5 Dividends, deadlines and rates ----------
  {
    key: 'dividends.withholding',
    value: { monthlyThreshold: brl('50.000,00'), rate: p('0.10') },
    source: src(
      'Lei 9.250/1995 (redação da Lei 15.270/2025)',
      'art. 6º-A, caput, §§ 1º e 2º',
      SOURCE_URL.lei15270,
    ),
    effectiveFrom: FROM,
    verifiedAt: VERIFIED,
    status: 'verified',
    note:
      '10% sobre o TOTAL pago no mês pela mesma PJ à mesma PF residente, se o total do mês > 50.000,00. RFB, P&R Altas Rendas, Qs. 4, 5 e 7: ' +
      SOURCE_URL.rfbDividendsQa,
  },
  {
    key: 'dividends.simples',
    value:
      'aplica-se às optantes pelo Simples (a isenção do art. 14 da LC 123 deixou de ser aplicada para fins de retenção, segundo a RFB)',
    source: src(
      'RFB, P&R Tributação de Altas Rendas (19/12/2025)',
      'pergunta 10',
      SOURCE_URL.rfbDividendsQa,
    ),
    effectiveFrom: FROM,
    verifiedAt: VERIFIED,
    status: 'verified',
  },
  {
    key: 'dividends.refund',
    value: { totalIncomeThreshold: brl('600.000,00') },
    source: src(
      'Lei 9.250/1995 (redação da Lei 15.270/2025)',
      'art. 16-A, §§ 5º e 6º; RFB P&R, pergunta 4',
      SOURCE_URL.lei15270,
    ),
    effectiveFrom: FROM,
    verifiedAt: VERIFIED,
    status: 'verified',
  },
  {
    key: 'dividends.darf',
    value: { code: '1841', dueDate: 'último dia útil do 2º decêndio do mês seguinte' },
    source: src(
      'RFB, P&R Tributação de Altas Rendas (19/12/2025)',
      'perguntas 6 e 11',
      SOURCE_URL.rfbDividendsQa,
    ),
    effectiveFrom: FROM,
    verifiedAt: VERIFIED,
    status: 'verified',
  },
  {
    key: 'dividends.transition2025',
    value:
      'fora da retenção: lucros apurados até 2025, com distribuição aprovada até 31/12/2025 e paga nos termos do ato (até 2028)',
    source: src(
      'Lei 9.250/1995 (redação da Lei 15.270/2025)',
      'art. 6º-A, § 3º; RFB P&R, perguntas 7 a 9',
      SOURCE_URL.lei15270,
    ),
    effectiveFrom: FROM,
    verifiedAt: VERIFIED,
    status: 'verified',
  },
  {
    key: 'dividends.simplesExemption.limit',
    value:
      'isenção limitada à presunção do art. 15 da Lei 9.249 sobre a receita bruta, subtraído do valor devido no Simples; acima disso, só com escrituração que comprove o lucro',
    source: src('LC 123/2006', 'art. 14, caput, §§ 1º e 2º', SOURCE_URL.lc123),
    effectiveFrom: FROM,
    verifiedAt: VERIFIED_H1,
    status: 'verified',
    note: 'H.1 item 6 fechado: LC 123, art. 14, § 1º ("subtraído do valor devido na forma do Simples Nacional") e Res. CGSN 140, art. 145, § 1º ("relativo ao IRPJ"): usar presunção × receita − IRPJ do DAS. Continua como alerta, porque o texto da LC admite a leitura mais restritiva.',
  },
  {
    key: 'irpfm.threshold',
    value: brl('600.000,00'),
    source: src('Lei 9.250/1995 (redação da Lei 15.270/2025)', 'art. 16-A', SOURCE_URL.lei15270),
    effectiveFrom: FROM,
    verifiedAt: VERIFIED,
    status: 'verified',
  },
  {
    key: 'selic.series',
    value: { sgsCode: 432 },
    source: src(
      'Banco Central do Brasil (SGS)',
      'série 432 (meta Selic, % a.a.)',
      SOURCE_URL.sgs432,
    ),
    effectiveFrom: FROM,
    verifiedAt: VERIFIED,
    status: 'verified',
    note: 'Valor lido em tempo de execução pelo provedor sgs; no replay, fixture.',
  },
  {
    key: 'statuteOfLimitations.years',
    value: 5,
    source: src('CTN (Lei 5.172/1966)', 'art. 168, I; LC 118/2005, art. 3º', SOURCE_URL.ctn),
    effectiveFrom: FROM,
    verifiedAt: VERIFIED_H1,
    status: 'verified',
    note: 'H.1 item 8 fechado: CTN, art. 168, I (5 anos da extinção do crédito) e LC 118, art. 3º (extinção no pagamento antecipado). Capturas: ctn-planalto.md e lc-118-2005-planalto.md.',
  },
];
