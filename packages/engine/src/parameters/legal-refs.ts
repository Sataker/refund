// LegalRef of each parameter record, by `key@effectiveFrom` (or `key` for every period). CLAUDE.md rule 3: a
// citation is either a provision that exists in @refund/law (`type: 'regulation'`, ids from rules/refs.ts) or a
// captured official non-law source (`type: 'procedure'`: manuals, Receita pages, the BCB series), never a made-up
// law id. A parameter with neither (its law was not captured) has no ref and its steps carry no `ref`.
import { REFS } from '../rules/refs.ts';
import type { LegalRef } from '../types.ts';
import type { ParameterKey } from './types.ts';

const procedure = (
  id: string,
  label: string,
  url: string,
  captureSha256: string,
  verifiedAt: LegalRef['verifiedAt'] = '2026-11-14',
): LegalRef => ({ id, label, url, verifiedAt, type: 'procedure', captureSha256 });

const PGDAS_MANUAL_URL =
  'https://www8.receita.fazenda.gov.br/SimplesNacional/Arquivos/manual/MANUAL_PGDAS-D_2018_V4.pdf';
/** SHA-256 of docs/conferencias/fontes-oficiais/pgdas.pdf. */
const PGDAS_MANUAL_SHA = 'e73b2bfc7eded9e419ddd5c516cf37cc49a78540fcd79faf4d84b77988f3f316';
const RFB_QA_URL =
  'https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/perguntas-e-respostas/dirf/manual_padrao_rfb_per_tributacao_cotin_v-19-12-2025.pdf';
/** SHA-256 of docs/conferencias/fontes-oficiais/pr.pdf. */
const RFB_QA_SHA = '51712e390f090521d07a0013c0dec041981e160b1b638ae92888fa278c3a7b44';

/** Captured official sources that are not law provisions (ARCHITECTURE §4.2: LegalRef `type: 'procedure'`). */
export const PROCEDURE_REFS = {
  'rfb-tributacao-2026#tabela-anual': procedure(
    'rfb-tributacao-2026#tabela-anual',
    'Receita Federal, "Tributação de 2026", tabela progressiva anual',
    'https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026',
    '3895732ecffb30be025ea7eeda088a5dfc58c42b32e8fd5abcc974292ff0ee65',
  ),
  'manual-pgdas-d#8.3': procedure(
    'manual-pgdas-d#8.3',
    'Manual do PGDAS-D, item 8.3',
    PGDAS_MANUAL_URL,
    PGDAS_MANUAL_SHA,
  ),
  'manual-pgdas-d#12': procedure(
    'manual-pgdas-d#12',
    'Manual do PGDAS-D, item 12',
    PGDAS_MANUAL_URL,
    PGDAS_MANUAL_SHA,
  ),
  'rfb-pr-altas-rendas-2025-12-19#q6': procedure(
    'rfb-pr-altas-rendas-2025-12-19#q6',
    'RFB, P&R Tributação de Altas Rendas (19/12/2025), perguntas 6 e 11',
    RFB_QA_URL,
    RFB_QA_SHA,
  ),
  'rfb-pr-altas-rendas-2025-12-19#q10': procedure(
    'rfb-pr-altas-rendas-2025-12-19#q10',
    'RFB, P&R Tributação de Altas Rendas (19/12/2025), pergunta 10',
    RFB_QA_URL,
    RFB_QA_SHA,
  ),
  'manual-restituicao-sn-2025-10-20#3.1.1': procedure(
    'manual-restituicao-sn-2025-10-20#3.1.1',
    'Manual da Restituição do Simples Nacional (20/10/2025), item 3.1.1',
    'https://www8.receita.fazenda.gov.br/SimplesNacional/Arquivos/manual/MANUAL_RESTITUICAO.pdf',
    '74ae352b145fa48f034d51be7ade731a6cd0fcba3b226b9bed93a3952bd12db2',
  ),
} as const satisfies Record<string, LegalRef>;

type Key = ParameterKey | `${ParameterKey}@${string}`;

/**
 * Parameter → citation. Where the record cites a table that is not in the corpus (LC 123 Anexos, ENGINE-SPEC A.3;
 * EXECUTION §9, E2 row), the ref is the corpus provision that applies the table (LC 123, art. 18, § 1º-A).
 */
const BY_PARAMETER: Partial<Record<Key, LegalRef>> = {
  'irpf.monthly.table': REFS['lei15191-2025/art2'],
  'irpf.monthly.simplifiedDiscount': REFS['lei9250-1995/art4/p2'],
  'irpf.monthly.dependent': REFS['lei9250-1995/art4/iii'],
  'irpf.monthly.reduction': REFS['lei9250-1995/art3-a'],
  'irpf.annual.table': PROCEDURE_REFS['rfb-tributacao-2026#tabela-anual'],
  'irpf.annual.reduction': REFS['lei9250-1995/art11-a'],
  'irpf.annual.simplifiedDiscount': REFS['lei9250-1995/art10'],
  'irpf.annual.dependent': REFS['lei9250-1995/art8/ii'],
  'irpf.annual.education': REFS['lei9250-1995/art8/ii'],
  'irpf.annual.health': REFS['lei9250-1995/art8/ii'],
  'irpf.pgbl.limit': REFS['lei9532-1997/art11'],
  'irpf.pgbl.referenceRedemptionRate': REFS['lei11053-2004/art1'],
  'inss.employee.brackets': REFS['port-mps-mf13-2026/anexo2'],
  'inss.ceiling': REFS['port-mps-mf13-2026/art2'],
  'inss.employee.maximum': REFS['port-mps-mf13-2026/anexo2'],
  'inss.proLabore.rate': REFS['lei8212-1991/art21/caput'],
  'inss.proLabore.maximum': REFS['lei8212-1991/art21/caput'],
  'inss.cpp.rate': REFS['lei8212-1991/art22/iii'],
  minimumWage: REFS['dec12797-2025/art1'],
  'simples.anexo.I': REFS['lc123-2006/art18/p1-a'],
  'simples.anexo.III': REFS['lc123-2006/art18/p1-a'],
  'simples.anexo.V': REFS['lc123-2006/art18/p1-a'],
  'simples.effectiveRate': REFS['lc123-2006/art18/p1-a'],
  'simples.calculation': PROCEDURE_REFS['manual-pgdas-d#12'],
  'simples.fatorR.limit': REFS['lc123-2006/art18/p5-j'],
  'simples.fatorR.formula': REFS['res-cgsn140-2018/art26'],
  'simples.fatorR.payroll': REFS['lc123-2006/art18/p24'],
  'simples.fatorR.window@2018-01': REFS['lc123-2006/art18/p5-k'],
  'simples.fatorR.window@2027-01': REFS['res-cgsn190-2026/art1/res140-art26'],
  'simples.rbt12.window@2018-01': REFS['lc123-2006/art18/p1-a'],
  'simples.rbt12.window@2027-01': REFS['res-cgsn190-2026/art1/res140-art21'],
  'simples.rbt12.byMarket': REFS['res-cgsn140-2018/art16/p3'],
  'simples.startOfActivity@2018-08': PROCEDURE_REFS['manual-pgdas-d#8.3'],
  'simples.export.exclude@2018-01': REFS['lc123-2006/art18/p14'],
  'simples.export.exclude@2027-01': REFS['res-cgsn190-2026/art1/res140-art25'],
  'simples.export.concept': REFS['res-cgsn140-2018/art25/p4'],
  'simples.monofasico.exclude': REFS['lc123-2006/art18/p4-a'],
  'simples.limits': REFS['lc123-2006/art3/caput'],
  'simples.excess': REFS['lc123-2006/art3/p9'],
  'mei.limit@2018-01': REFS['lc123-2006/art18-a/p1'],
  'mei.limit@2027-01': REFS['lc238-2026/art2'],
  'mei.limit@2028-01': REFS['lc238-2026/art1'],
  'mei.excess': REFS['lc123-2006/art18-a/p7'],
  'mei.das.icmsIss': REFS['lc123-2006/art18-a/p3/v'],
  'dividends.withholding': REFS['lei9250-1995/art6-a'],
  'dividends.simples': PROCEDURE_REFS['rfb-pr-altas-rendas-2025-12-19#q10'],
  'dividends.refund': REFS['lei9250-1995/art16-a/p5'],
  'dividends.darf': PROCEDURE_REFS['rfb-pr-altas-rendas-2025-12-19#q6'],
  'dividends.transition2025': REFS['lei9250-1995/art6-a'],
  'dividends.simplesExemption.limit': REFS['lc123-2006/art14'],
  'irpfm.threshold': REFS['lei9250-1995/art16-a/caput'],
  'statuteOfLimitations.years': REFS['lei5172-1966/art168'],
  'simples.das.dueDate': REFS['res-cgsn140-2018/art40/p3'],
  'simples.refund.claimFromMonths': PROCEDURE_REFS['manual-restituicao-sn-2025-10-20#3.1.1'],
  // No ref (law not captured; EXECUTION §9, E5): 'mei.das.inss', 'selic.series' (a data series, not a rule),
  // 'calendar.nationalHolidays', 'simples.startOfActivity@2027-01' (Res. 190, art. 22, not in the corpus).
};

/** Citation of the parameter record `key` in force from `effectiveFrom`, or undefined when none exists. */
export function parameterRef(key: ParameterKey, effectiveFrom: string): LegalRef | undefined {
  return BY_PARAMETER[`${key}@${effectiveFrom}`] ?? BY_PARAMETER[key];
}
