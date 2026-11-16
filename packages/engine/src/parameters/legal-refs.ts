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
  // E8b: procedure excerpts of @refund/law cited by the C.12 action plan (actions/catalog.ts).
  'esocial-mos-s-1.3#s-1200': procedure(
    'esocial-mos-s-1.3#s-1200',
    'Manual de Orientação do eSocial S-1.3 (consolidado até a NO S-1.3 07.2026), evento S-1200',
    'https://www.gov.br/esocial/pt-br/documentacao-tecnica/manuais/mos-s-1-3-consolidada-ate-a-no-s-1-3-07-2026.pdf',
    '72fa1e590925759dadb8107432c35148f93a1d4a517a9f3676e64f39c9b5aa29',
    '2026-11-12',
  ),
  'esocial-mos-s-1.3#s-1299': procedure(
    'esocial-mos-s-1.3#s-1299',
    'Manual de Orientação do eSocial S-1.3 (consolidado até a NO S-1.3 07.2026), evento S-1299',
    'https://www.gov.br/esocial/pt-br/documentacao-tecnica/manuais/mos-s-1-3-consolidada-ate-a-no-s-1-3-07-2026.pdf',
    '72fa1e590925759dadb8107432c35148f93a1d4a517a9f3676e64f39c9b5aa29',
    '2026-11-12',
  ),
  'manual-pgdas-d#capa': procedure(
    'manual-pgdas-d#capa',
    'Manual do PGDAS-D e Defis (13/11/2026; PA de 2018 a 2026), capa',
    'https://www8.receita.fazenda.gov.br/SimplesNacional/Arquivos/manual/MANUAL_PGDAS-D_2018_V4.pdf',
    '1786a9badcd6676567b8a2ce27c6f11466b3abaf1ea1330a27eef31ec013119f',
    '2026-11-16',
  ),
  'manual-pgdas-d#6.4': procedure(
    'manual-pgdas-d#6.4',
    'Manual do PGDAS-D e Defis (13/11/2026; PA de 2018 a 2026), item 6.4',
    'https://www8.receita.fazenda.gov.br/SimplesNacional/Arquivos/manual/MANUAL_PGDAS-D_2018_V4.pdf',
    '1786a9badcd6676567b8a2ce27c6f11466b3abaf1ea1330a27eef31ec013119f',
    '2026-11-16',
  ),
  'manual-pgdas-d#6.5': procedure(
    'manual-pgdas-d#6.5',
    'Manual do PGDAS-D e Defis (13/11/2026; PA de 2018 a 2026), item 6.5',
    'https://www8.receita.fazenda.gov.br/SimplesNacional/Arquivos/manual/MANUAL_PGDAS-D_2018_V4.pdf',
    '1786a9badcd6676567b8a2ce27c6f11466b3abaf1ea1330a27eef31ec013119f',
    '2026-11-16',
  ),
  'manual-pgdas-d#6.10': procedure(
    'manual-pgdas-d#6.10',
    'Manual do PGDAS-D e Defis (13/11/2026; PA de 2018 a 2026), item 6.10',
    'https://www8.receita.fazenda.gov.br/SimplesNacional/Arquivos/manual/MANUAL_PGDAS-D_2018_V4.pdf',
    '1786a9badcd6676567b8a2ce27c6f11466b3abaf1ea1330a27eef31ec013119f',
    '2026-11-16',
  ),
  'manual-pgdas-d#6.10.1': procedure(
    'manual-pgdas-d#6.10.1',
    'Manual do PGDAS-D e Defis (13/11/2026; PA de 2018 a 2026), item 6.10.1',
    'https://www8.receita.fazenda.gov.br/SimplesNacional/Arquivos/manual/MANUAL_PGDAS-D_2018_V4.pdf',
    '1786a9badcd6676567b8a2ce27c6f11466b3abaf1ea1330a27eef31ec013119f',
    '2026-11-16',
  ),
  'manual-pgdas-d#6.10.3': procedure(
    'manual-pgdas-d#6.10.3',
    'Manual do PGDAS-D e Defis (13/11/2026; PA de 2018 a 2026), item 6.10.3',
    'https://www8.receita.fazenda.gov.br/SimplesNacional/Arquivos/manual/MANUAL_PGDAS-D_2018_V4.pdf',
    '1786a9badcd6676567b8a2ce27c6f11466b3abaf1ea1330a27eef31ec013119f',
    '2026-11-16',
  ),
  'manual-pgdas-d#8.2': procedure(
    'manual-pgdas-d#8.2',
    'Manual do PGDAS-D e Defis (13/11/2026; PA de 2018 a 2026), item 8.2',
    'https://www8.receita.fazenda.gov.br/SimplesNacional/Arquivos/manual/MANUAL_PGDAS-D_2018_V4.pdf',
    '1786a9badcd6676567b8a2ce27c6f11466b3abaf1ea1330a27eef31ec013119f',
    '2026-11-16',
  ),
  'manual-restituicao-sn-2025-10-20#2': procedure(
    'manual-restituicao-sn-2025-10-20#2',
    'Manual da Restituição do Simples Nacional (20/10/2025), item 2',
    'https://www8.receita.fazenda.gov.br/SimplesNacional/Arquivos/manual/MANUAL_RESTITUICAO.pdf',
    '74ae352b145fa48f034d51be7ade731a6cd0fcba3b226b9bed93a3952bd12db2',
    '2026-11-12',
  ),
  'manual-restituicao-sn-2025-10-20#3.1': procedure(
    'manual-restituicao-sn-2025-10-20#3.1',
    'Manual da Restituição do Simples Nacional (20/10/2025), item 3.1',
    'https://www8.receita.fazenda.gov.br/SimplesNacional/Arquivos/manual/MANUAL_RESTITUICAO.pdf',
    '74ae352b145fa48f034d51be7ade731a6cd0fcba3b226b9bed93a3952bd12db2',
    '2026-11-12',
  ),
  'manual-restituicao-sn-2025-10-20#3.2': procedure(
    'manual-restituicao-sn-2025-10-20#3.2',
    'Manual da Restituição do Simples Nacional (20/10/2025), item 3.2',
    'https://www8.receita.fazenda.gov.br/SimplesNacional/Arquivos/manual/MANUAL_RESTITUICAO.pdf',
    '74ae352b145fa48f034d51be7ade731a6cd0fcba3b226b9bed93a3952bd12db2',
    '2026-11-12',
  ),
  'manual-restituicao-sn-2025-10-20#4': procedure(
    'manual-restituicao-sn-2025-10-20#4',
    'Manual da Restituição do Simples Nacional (20/10/2025), item 4',
    'https://www8.receita.fazenda.gov.br/SimplesNacional/Arquivos/manual/MANUAL_RESTITUICAO.pdf',
    '74ae352b145fa48f034d51be7ade731a6cd0fcba3b226b9bed93a3952bd12db2',
    '2026-11-12',
  ),
  'portal-simples#restituicao-compensacao': procedure(
    'portal-simples#restituicao-compensacao',
    'Portal do Simples Nacional, Restituição e Compensação',
    'https://www8.receita.fazenda.gov.br/SimplesNacional/Servicos/Grupo.aspx?grp=17',
    'dbf7b3b85d54ce9a9ef247b7bf3482ab10d6fc4d56a310420a639f3249620e28',
    '2026-11-12',
  ),
  'pr-irpf-2026#pgbl': procedure(
    'pr-irpf-2026#pgbl',
    'RFB, Perguntas e Respostas IRPF 2026 (v1.00, 23/04/2026), PGBL',
    'https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/perguntas-e-respostas/dirpf/p-r-irpf-2026-v1-00-2026-04-23.pdf',
    '721038645d4de73786f1bcc72a096646305d02cba85e8d1f9517638a5aceed62',
    '2026-11-12',
  ),
  'pr-irpf-2026#183': procedure(
    'pr-irpf-2026#183',
    'RFB, Perguntas e Respostas IRPF 2026 (v1.00, 23/04/2026), pergunta 183',
    'https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/perguntas-e-respostas/dirpf/p-r-irpf-2026-v1-00-2026-04-23.pdf',
    '721038645d4de73786f1bcc72a096646305d02cba85e8d1f9517638a5aceed62',
    '2026-11-12',
  ),
  'pr-simples-2026-10-09#5.11': procedure(
    'pr-simples-2026-10-09#5.11',
    'CGSN, Perguntas e Respostas do Simples Nacional (09/10/2026), pergunta 5.11',
    'https://www8.receita.fazenda.gov.br/SimplesNacional/Arquivos/manual/PerguntaoSN.pdf',
    '08667b6c34527f12bce5db5391b377e3ed84f8dff6ba37b142427bb05a50d73f',
    '2026-11-12',
  ),
  'pr-simples-2026-10-09#6.8': procedure(
    'pr-simples-2026-10-09#6.8',
    'CGSN, Perguntas e Respostas do Simples Nacional (09/10/2026), pergunta 6.8',
    'https://www8.receita.fazenda.gov.br/SimplesNacional/Arquivos/manual/PerguntaoSN.pdf',
    '08667b6c34527f12bce5db5391b377e3ed84f8dff6ba37b142427bb05a50d73f',
    '2026-11-12',
  ),
  'pr-simples-2026-10-09#7.2': procedure(
    'pr-simples-2026-10-09#7.2',
    'CGSN, Perguntas e Respostas do Simples Nacional (09/10/2026), pergunta 7.2',
    'https://www8.receita.fazenda.gov.br/SimplesNacional/Arquivos/manual/PerguntaoSN.pdf',
    '08667b6c34527f12bce5db5391b377e3ed84f8dff6ba37b142427bb05a50d73f',
    '2026-11-12',
  ),
  'pr-simples-2026-10-09#7.4': procedure(
    'pr-simples-2026-10-09#7.4',
    'CGSN, Perguntas e Respostas do Simples Nacional (09/10/2026), pergunta 7.4',
    'https://www8.receita.fazenda.gov.br/SimplesNacional/Arquivos/manual/PerguntaoSN.pdf',
    '08667b6c34527f12bce5db5391b377e3ed84f8dff6ba37b142427bb05a50d73f',
    '2026-11-12',
  ),
  'pr-simples-2026-10-09#10.4': procedure(
    'pr-simples-2026-10-09#10.4',
    'CGSN, Perguntas e Respostas do Simples Nacional (09/10/2026), pergunta 10.4',
    'https://www8.receita.fazenda.gov.br/SimplesNacional/Arquivos/manual/PerguntaoSN.pdf',
    '08667b6c34527f12bce5db5391b377e3ed84f8dff6ba37b142427bb05a50d73f',
    '2026-11-12',
  ),
  'pr-simples-2026-10-09#10.5': procedure(
    'pr-simples-2026-10-09#10.5',
    'CGSN, Perguntas e Respostas do Simples Nacional (09/10/2026), pergunta 10.5',
    'https://www8.receita.fazenda.gov.br/SimplesNacional/Arquivos/manual/PerguntaoSN.pdf',
    '08667b6c34527f12bce5db5391b377e3ed84f8dff6ba37b142427bb05a50d73f',
    '2026-11-12',
  ),
  'pr-simples-2026-10-09#10.6': procedure(
    'pr-simples-2026-10-09#10.6',
    'CGSN, Perguntas e Respostas do Simples Nacional (09/10/2026), pergunta 10.6',
    'https://www8.receita.fazenda.gov.br/SimplesNacional/Arquivos/manual/PerguntaoSN.pdf',
    '08667b6c34527f12bce5db5391b377e3ed84f8dff6ba37b142427bb05a50d73f',
    '2026-11-12',
  ),
  'pr-simples-2026-10-09#10.8': procedure(
    'pr-simples-2026-10-09#10.8',
    'CGSN, Perguntas e Respostas do Simples Nacional (09/10/2026), pergunta 10.8',
    'https://www8.receita.fazenda.gov.br/SimplesNacional/Arquivos/manual/PerguntaoSN.pdf',
    '08667b6c34527f12bce5db5391b377e3ed84f8dff6ba37b142427bb05a50d73f',
    '2026-11-12',
  ),
  'pr-simples-2026-10-09#12.3': procedure(
    'pr-simples-2026-10-09#12.3',
    'CGSN, Perguntas e Respostas do Simples Nacional (09/10/2026), pergunta 12.3',
    'https://www8.receita.fazenda.gov.br/SimplesNacional/Arquivos/manual/PerguntaoSN.pdf',
    '08667b6c34527f12bce5db5391b377e3ed84f8dff6ba37b142427bb05a50d73f',
    '2026-11-12',
  ),
  'rfb-autorizacoes-de-acesso#2-4': procedure(
    'rfb-autorizacoes-de-acesso#2-4',
    'RFB, Autorizações de Acesso: guia do usuário, itens 2 a 4',
    'https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/passo-a-passo/autorizacoes-de-acesso-guia-do-usuario',
    'f36cc814048e002d0a7b335b8dab55bf0f265381e06e2a7fde54f6afb2db6bc9',
    '2026-11-12',
  ),
  'rfb-noticia-2023-10-prazo-dctfweb': procedure(
    'rfb-noticia-2023-10-prazo-dctfweb',
    'RFB, notícia "Postergado prazo de entrega da DCTFWeb" (outubro de 2023)',
    'https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2023/outubro/postergado-prazo-de-entrega-da-dctfweb',
    '748740f24c59134104bac80d4a04bb4139b60faf93ec99319c14ae723b068eec',
    '2026-11-12',
  ),
  'rfb-noticia-2026-03-irpf-2026': procedure(
    'rfb-noticia-2026-03-irpf-2026',
    'RFB, notícia sobre a entrega do IRPF 2026 (março de 2026)',
    'https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/marco/receita-comeca-a-receber-declaracoes-do-irpf-no-dia-23-de-marco-prazo-de-entrega-se-encerra-em-29-de-maio',
    '8360d0ead67e0f1d73d0dcbb8e192d43b9a0122e2ab6b4997b9e01c207f64132',
    '2026-11-12',
  ),
  'rfb-pr-altas-rendas-2025-12-19#q4': procedure(
    'rfb-pr-altas-rendas-2025-12-19#q4',
    'RFB, P&R Tributação de Altas Rendas (19/12/2025), pergunta 4',
    'https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/perguntas-e-respostas/dirf/manual_padrao_rfb_per_tributacao_cotin_v-19-12-2025.pdf',
    '51712e390f090521d07a0013c0dec041981e160b1b638ae92888fa278c3a7b44',
    '2026-11-12',
  ),
  'sp-fazenda#restituicao-iss': procedure(
    'sp-fazenda#restituicao-iss',
    'Prefeitura de São Paulo, Secretaria da Fazenda, "Restituição de Valores – ISS"',
    'https://prefeitura.sp.gov.br/web/fazenda/w/33671',
    'be344d480052063fd0ed1d6844bbd691b3361bf44673732d90aa5907e5d6b9aa',
    '2026-11-12',
  ),
  'sp-manual-sav-2.15#3.1': procedure(
    'sp-manual-sav-2.15#3.1',
    'Prefeitura de São Paulo, Manual do SAV (versão 2.15), item 3.1',
    'https://prefeitura.sp.gov.br/documents/d/fazenda/sav-2-15-pdf',
    '459efa228409845e837e35dd4b90aa4707a709135850d03ba69b34bde7e79526',
    '2026-11-12',
  ),
  'sp-manual-sav-2.15#15.1': procedure(
    'sp-manual-sav-2.15#15.1',
    'Prefeitura de São Paulo, Manual do SAV (versão 2.15), item 15.1',
    'https://prefeitura.sp.gov.br/documents/d/fazenda/sav-2-15-pdf',
    '459efa228409845e837e35dd4b90aa4707a709135850d03ba69b34bde7e79526',
    '2026-11-12',
  ),
  'sp-manual-sav-2.15#15.2': procedure(
    'sp-manual-sav-2.15#15.2',
    'Prefeitura de São Paulo, Manual do SAV (versão 2.15), item 15.2',
    'https://prefeitura.sp.gov.br/documents/d/fazenda/sav-2-15-pdf',
    '459efa228409845e837e35dd4b90aa4707a709135850d03ba69b34bde7e79526',
    '2026-11-12',
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
