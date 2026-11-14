// Parameters published for 2027 onwards (ENGINE-SPEC A.3 and A.4). Whatever has no 2027 record is answered by
// `param()` with the 2026 record and, when it is an annually published value, `projected: true` (C.1, item 4).
import { brl, rate } from '../money.ts';
import type { Tax } from '../types.ts';
import type { AnyParameterEntry, ParameterSource, SimplesAnexoTable } from './types.ts';

const VERIFIED = '2026-11-12' as const;
/** H.1 closed at the primary source (capture index: docs/conferencias/fontes-oficiais/E1-H1-fechamento.md). */
const VERIFIED_H1 = '2026-11-14' as const;

const SOURCE_URL = {
  resCgsn190: 'https://normasinternet2.receita.fazenda.gov.br/#/consulta/externa/152832',
  lc214: 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm',
  lc123: 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm',
  lc238: 'https://planalto.gov.br/ccivil_03/leis/lcp/lcp238.htm',
} as const;

const src = (regulation: string, provision: string, url: string): ParameterSource => ({
  regulation,
  provision,
  url,
});

const p = (s: string) => rate(s);

// LC 214/2025, Anexos XVIII, XX and XXII (wording of LC 227/2026) = LC 123, Anexos I, III and V "para os
// anos-calendário 2027 e 2028". PIS + Cofins become CBS + IBS; the 6th bracket changes its nominal rate AND its
// apportionment (H.1 item 3; EXECUTION §9). Every row sums to 100%.
const ANEXO_I_2027: SimplesAnexoTable = {
  brackets: [
    {
      bracket: 1,
      upTo: brl('180.000,00'),
      nominal: p('0.04'),
      deduction: brl('0,00'),
      apportionment: {
        IRPJ: p('5.50'),
        CSLL: p('3.50'),
        CBS: p('15.33'),
        IBS: p('0.17'),
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
        CBS: p('15.33'),
        IBS: p('0.17'),
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
        CBS: p('15.33'),
        IBS: p('0.17'),
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
        CBS: p('15.33'),
        IBS: p('0.17'),
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
        CBS: p('15.33'),
        IBS: p('0.17'),
        CPP: p('42.00'),
        ICMS: p('33.50'),
      },
    },
    {
      bracket: 6,
      upTo: brl('4.800.000,00'),
      nominal: p('0.189'),
      deduction: brl('378.000,00'),
      apportionment: { IRPJ: p('13.58'), CSLL: p('10.06'), CBS: p('34.02'), CPP: p('42.34') },
    },
  ],
};

const ANEXO_III_2027: SimplesAnexoTable = {
  brackets: [
    {
      bracket: 1,
      upTo: brl('180.000,00'),
      nominal: p('0.06'),
      deduction: brl('0,00'),
      apportionment: {
        IRPJ: p('4.00'),
        CSLL: p('3.50'),
        CBS: p('15.43'),
        IBS: p('0.17'),
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
        CBS: p('16.91'),
        IBS: p('0.19'),
        CPP: p('43.40'),
        ISS: p('32.00'),
      },
    },
    // CBS 16,41 (LC 227/2026); the 16,42 of the original LC 214 wording is struck through at Planalto.
    {
      bracket: 3,
      upTo: brl('720.000,00'),
      nominal: p('0.135'),
      deduction: brl('17.640,00'),
      apportionment: {
        IRPJ: p('4.00'),
        CSLL: p('3.50'),
        CBS: p('16.41'),
        IBS: p('0.19'),
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
        CBS: p('16.41'),
        IBS: p('0.19'),
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
        CBS: p('15.43'),
        IBS: p('0.17'),
        CPP: p('43.40'),
        ISS: p('33.50'),
      },
    },
    {
      bracket: 6,
      upTo: brl('4.800.000,00'),
      nominal: p('0.329'),
      deduction: brl('648.000,00'),
      apportionment: { IRPJ: p('35.09'), CSLL: p('15.04'), CBS: p('19.29'), CPP: p('30.58') },
    },
  ],
  issCap: {
    bracket: 5,
    threshold: p('0.1492537'),
    fixedIssRate: p('0.05'),
    federalSplit: {
      IRPJ: p('6.02'),
      CSLL: p('5.26'),
      CBS: p('23.20'),
      IBS: p('0.26'),
      CPP: p('65.26'),
    },
  },
};

const ANEXO_V_2027: SimplesAnexoTable = {
  brackets: [
    {
      bracket: 1,
      upTo: brl('180.000,00'),
      nominal: p('0.155'),
      deduction: brl('0,00'),
      apportionment: {
        IRPJ: p('25.00'),
        CSLL: p('15.00'),
        CBS: p('16.96'),
        IBS: p('0.19'),
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
        CBS: p('16.96'),
        IBS: p('0.19'),
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
        CBS: p('17.95'),
        IBS: p('0.20'),
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
        CBS: p('18.94'),
        IBS: p('0.21'),
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
        CBS: p('16.96'),
        IBS: p('0.19'),
        CPP: p('23.85'),
        ISS: p('23.50'),
      },
    },
    {
      bracket: 6,
      upTo: brl('4.800.000,00'),
      nominal: p('0.304'),
      deduction: brl('540.000,00'),
      apportionment: { IRPJ: p('35.10'), CSLL: p('15.54'), CBS: p('19.78'), CPP: p('29.58') },
    },
  ],
};

const EXPORT_EXCLUDED_2027: readonly Tax[] = ['CBS', 'IBS', 'IPI', 'ICMS', 'ISS'];

const TABLES_NOTE =
  'H.1 item 3 fechado (14/11): texto do Planalto (trechos tachados removidos), confere célula a célula com os anexos oficiais da Res. CGSN 190/2026. Vigência 1º/1/2027 a 31/12/2028; a partir de 2029 há outra tabela (fora do escopo). Capturas: lc-214-2025-planalto-simples.md e res-cgsn-190-2026-anexos-i-iii-v.md.';

export const PARAMETERS_2027: readonly AnyParameterEntry[] = [
  // ---------- A.3: window "12 months preceding the month before the PA" from PA 01/2027 (D4, G2) ----------
  {
    key: 'simples.fatorR.window',
    value: { startOffset: -13, endOffset: -2 },
    source: src(
      'Res. CGSN 190/2026',
      'art. 26, § 5º, IV e V, da Res. CGSN 140/2018 (art. 9º: efeitos a partir de 01/01/2027); LC 123, art. 18, § 5º-K, na redação do art. 517 da LC 214/2025',
      SOURCE_URL.resCgsn190,
    ),
    effectiveFrom: '2027-01',
    verifiedAt: VERIFIED_H1,
    status: 'verified',
    note: 'H.1 item 1 fechado: "FS12, a folha de salários dos 12 (doze) meses antecedentes ao mês anterior ao PA" (Normas RFB, ato 152832, DOU de 10/08/2026). Captura: res-cgsn-190-2026.md.',
  },
  {
    key: 'simples.rbt12.window',
    value: { startOffset: -13, endOffset: -2 },
    source: src(
      'Res. CGSN 190/2026',
      'art. 21, II, "a", da Res. CGSN 140/2018 (art. 9º: efeitos a partir de 01/01/2027)',
      SOURCE_URL.resCgsn190,
    ),
    effectiveFrom: '2027-01',
    verifiedAt: VERIFIED_H1,
    status: 'verified',
    note: 'H.1 item 1 fechado: "RBT12: receita bruta acumulada nos doze meses antecedentes ao mês anterior ao do período de apuração". Captura: res-cgsn-190-2026.md.',
  },

  // ---------- A.3: Simples tables 2027–2028 (simples.2027.tables) ----------
  {
    key: 'simples.anexo.I',
    value: ANEXO_I_2027,
    source: src(
      'LC 123/2006, Anexo I (redação da LC 214/2025, Anexo XVIII, e da LC 227/2026)',
      'Anexo I, anos-calendário 2027 e 2028',
      SOURCE_URL.lc214,
    ),
    effectiveFrom: '2027-01',
    publishedThrough: '2028-12',
    verifiedAt: VERIFIED_H1,
    status: 'verified',
    note: TABLES_NOTE,
  },
  {
    key: 'simples.anexo.III',
    value: ANEXO_III_2027,
    source: src(
      'LC 123/2006, Anexo III (redação da LC 214/2025, Anexo XX, e da LC 227/2026)',
      'Anexo III, anos-calendário 2027 e 2028',
      SOURCE_URL.lc214,
    ),
    effectiveFrom: '2027-01',
    publishedThrough: '2028-12',
    verifiedAt: VERIFIED_H1,
    status: 'verified',
    note: TABLES_NOTE,
  },
  {
    key: 'simples.anexo.V',
    value: ANEXO_V_2027,
    source: src(
      'LC 123/2006, Anexo V (redação da LC 214/2025, Anexo XXII, e da LC 227/2026)',
      'Anexo V, anos-calendário 2027 e 2028',
      SOURCE_URL.lc214,
    ),
    effectiveFrom: '2027-01',
    publishedThrough: '2028-12',
    verifiedAt: VERIFIED_H1,
    status: 'verified',
    note: TABLES_NOTE,
  },
  {
    key: 'simples.export.exclude',
    value: EXPORT_EXCLUDED_2027,
    source: src(
      'LC 123/2006 (redação do art. 517 da LC 214/2025)',
      'art. 18, §§ 14 e 14-A',
      SOURCE_URL.lc123,
    ),
    effectiveFrom: '2027-01',
    verifiedAt: VERIFIED_H1,
    status: 'verified',
    note: 'H.1 item 4 fechado: § 14-A (IPI, IBS e CBS) e § 14 (ICMS e ISS); a Res. CGSN 190 muda o art. 25, § 3º, da Res. 140 para "IBS, CBS, IPI, ICMS e ISS". Capturas: lc-214-2025-planalto-simples.md e lc-123-2006-planalto-extrato-h1.md.',
  },

  // ---------- A.4: MEI limits conditional on the LOA (LC 238/2026, art. 3º) ----------
  {
    key: 'mei.limit',
    value: { annual: brl('110.000,00'), monthlyAtStart: brl('9.166,67') },
    source: src('LC 238/2026', 'arts. 2º e 3º', SOURCE_URL.lc238),
    effectiveFrom: '2027-01',
    verifiedAt: VERIFIED,
    status: 'verified',
    dependsOnRegulation: true,
    note: 'Condicionado à renúncia de receita prevista na LOA de 2027 (G7).',
  },
  {
    key: 'mei.limit',
    value: { annual: brl('140.000,00'), monthlyAtStart: brl('11.666,67') },
    source: src('LC 238/2026', 'arts. 1º, 3º e 10, I', SOURCE_URL.lc238),
    effectiveFrom: '2028-01',
    verifiedAt: VERIFIED,
    status: 'verified',
    dependsOnRegulation: true,
    note: 'Vigência em 01/01/2028, também condicionada à LOA (2027–2029).',
  },
];
