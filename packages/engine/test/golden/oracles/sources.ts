// Primary sources of the oracles (ENGINE-SPEC B; D10). Each capture lives outside Git in
// docs/conferencias/fontes-oficiais/ (D8); its URL, capture date and SHA-256 are pinned here so the test suite
// records exactly which document each expected value came from.

export interface OracleSource {
  id: string;
  kind: 'primary' | 'secondary';
  title: string;
  url: string | null;
  capture: string | null; // path under docs/conferencias/
  capturedAt: string | null; // YYYY-MM-DD
  sha256: string | null; // of the raw captured file
}

export const SOURCES = {
  receitaLei15270Examples: {
    id: 'receita-exemplos-lei-15270',
    kind: 'primary',
    title:
      'Receita Federal, "Exemplos de aplicação da Lei 15.270/2025" (João, José, Maria, Rita, Vera)',
    url: 'https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/exemplos-de-aplicacao-da-lei-15-270-2025',
    capture: 'fontes-oficiais/rfb-exemplos-lei-15270-2025.html',
    capturedAt: '2026-11-14',
    sha256: '55d6f50dddf003c67b1aa598073bd19a40d8aab148a8d9f80fc9674d3008b113',
  },
  sipec566295: {
    id: 'sipec-comunicado-566295',
    kind: 'primary',
    title: 'SIPEC/MGI, Comunicado 566295 (16/12/2025), exemplos 1 a 7',
    url: 'https://www.gov.br/servidor/pt-br/canais_atendimento/central-sipec/comunicas-1/dezembro/comunicado-566295-adequacao-sistemica-lei-15-270-de-26-de-novembro-de-2025.pdf',
    capture: 'fontes-oficiais/sipec.pdf',
    capturedAt: '2026-11-12',
    sha256: 'f55fe079a05ddf4c6a648d612aa523ac16262014432b70a7008b2c75a3367d0a',
  },
  coadSecondary: {
    id: 'coad-secundaria',
    kind: 'secondary',
    title:
      'COAD (secundária, citada na pesquisa 01 e na REVISÃO C4; ENGINE-SPEC G1): RT 6.000,00 com deduções ≤ 607,20',
    url: null,
    capture: null,
    capturedAt: null,
    sha256: null,
  },
  pgdasManual: {
    id: 'manual-pgdas-d',
    kind: 'primary',
    title:
      'Manual do PGDAS-D e Defis (Receita Federal, versão 17/06/2025), itens 8.1, 8.2.1, 8.3 e 12 (Exemplos 1 a 7)',
    url: 'https://www8.receita.fazenda.gov.br/SimplesNacional/Arquivos/manual/MANUAL_PGDAS-D_2018_V4.pdf',
    capture: 'fontes-oficiais/pgdas.pdf',
    capturedAt: '2026-11-12',
    sha256: 'e73b2bfc7eded9e419ddd5c516cf37cc49a78540fcd79faf4d84b77988f3f316',
  },
  receitaSimulatorTable2026: {
    id: 'receita-simulador-tabela-2026',
    kind: 'primary',
    title:
      'API pública do simulador de IRPF da Receita, tabela 2026 (cópia em sources/receita-simulador-tab2026.json)',
    url: 'https://www27.receita.fazenda.gov.br/api/simulador/tabela/2026',
    capture: 'simulador-receita/tab2026.json',
    capturedAt: '2026-11-12',
    sha256: '29c758b19d2f9e048167be9e393da53ffc2e4d9a2563802859b561083dd218c7',
  },
} as const satisfies Record<string, OracleSource>;
