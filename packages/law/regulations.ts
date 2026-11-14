/**
 * Closed catalog of the regulations cited by the P0 rules and by the 2026 parameters
 * (ENGINE-SPEC A and D.1–D.8). The curated text of each cited provision lives in
 * `articles/<regulation id>.json`; this file only holds the catalog.
 *
 * ID convention
 * - Regulation id: `<kind><number>-<year>`, lowercase, no punctuation: `lc123-2006`, `lei9250-1995`,
 *   `dec12797-2025`, `dl1598-1977`, `res-cgsn140-2018`, `port-mps-mf13-2026`. The CTN is `lei5172-1966`
 *   and the Código Civil is `lei10406-2002` (labels "CTN" and "CC").
 * - Provision id: `<regulation id>/<path>`, where the path walks down the structure of the act:
 *   `artN` (lettered article: `art3-a`), then `caput`, `pN` (paragraph; lettered: `p5-j`) or `pu`
 *   (parágrafo único), then a lowercase roman numeral for the inciso (`iii`). Annexes are `anexoN`.
 *   A path that stops at a level holds that whole unit (article, paragraph or inciso, with what hangs below it).
 *   Examples: `lc123-2006/art18/p5-j`, `lei9250-1995/art3-a`, `lc123-2006/art18-a/p3/v`, `lei8212-1991/art22/iii`.
 * - Excerpt of an amending act: `res-cgsn190-2026/art1/res140-art26` is the block of art. 1º of
 *   Res. CGSN 190/2026 that gives the new wording of art. 26 of Res. CGSN 140/2018 (from the opening
 *   quote of "Art. 26" up to the next quoted article).
 * - Label: `<short name>, <provision>` exactly as in "LC 123/2006, art. 18, § 5º-J".
 *
 * Fields of each provision (`Provision` in src/index.ts)
 * - `text`: faithful copy of the source, in force on `capturedAt`. Struck text (`<strike>`, `<s>`, `<del>`,
 *   `text-decoration: line-through`), revoked units ("(Revogado)", "revogada") and empty labels were removed;
 *   drafting notes ("(Redação dada pela …)", "(Incluído pela …)", "(Vide …)", "Produção de efeitos") were moved
 *   to `notes`. Where Planalto keeps a superseded wording without strike, the last wording of the same label wins.
 *   Tables are one row per line, cells separated by " | ". Nothing else is changed (spelling such as "8o", "têrmos"
 *   or "titutlar" is the source's).
 * - `hash`: SHA-256 (hex) of `text` (UTF-8).
 * - `sourceSha256`: SHA-256 of the whole page text extracted the same way (Planalto serves different bytes on each
 *   request, so the raw HTML hash is not stable; the extracted page text is).
 * - `effectiveFrom`: date from which this wording produces effects, filled only when a captured provision states
 *   it (Lei 15.270/2025, art. 8º; Res. CGSN 190/2026, art. 9º; LC 238/2026, art. 10; Decreto 12.797/2025, arts. 1º
 *   and 2º; Portaria MPS/MF 13/2026). `null` means "in force on `capturedAt`; start date not asserted".
 *
 * Capture: 2026-11-14, in the browser (Planalto blocks curl), by a deterministic extractor (no LLM chooses or
 * rewrites text); the extractor, the per-page captures and the SHA-256 check of every transcribed text are in
 * docs/conferencias/corpus-lei-2026-11-14/ (outside Git).
 */

export type RegulationKind =
  | 'lei'
  | 'lei_complementar'
  | 'decreto'
  | 'decreto_lei'
  | 'resolucao_cgsn'
  | 'portaria_interministerial';

export interface Regulation {
  id: string;
  /** Prefix of every label: "LC 123/2006", "CTN", "Res. CGSN 140/2018". */
  short: string;
  /** Name as given by the official source (Senate open data, Receita or DOU). */
  name: string;
  kind: RegulationKind;
  /** Date of the act (CivilDate). */
  date: string;
  /** Page the text was captured from. */
  url: string;
  /** LexML URN; null when the act is not in the Senate's legislation dataset. */
  urn: string | null;
  source: 'planalto' | 'receita' | 'dou';
}

export const regulations: readonly Regulation[] = [
  {
    id: 'lc123-2006',
    short: 'LC 123/2006',
    name: 'Lei Complementar nº 123 de 14/12/2006',
    kind: 'lei_complementar',
    date: '2006-12-14',
    url: 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm',
    urn: 'urn:lex:br:federal:lei.complementar:2006-12-14;123',
    source: 'planalto',
  },
  {
    id: 'lei9250-1995',
    short: 'Lei 9.250/1995',
    name: 'Lei nº 9.250 de 26/12/1995',
    kind: 'lei',
    date: '1995-12-26',
    url: 'https://www.planalto.gov.br/ccivil_03/leis/l9250.htm',
    urn: 'urn:lex:br:federal:lei:1995-12-26;9250',
    source: 'planalto',
  },
  {
    id: 'lei9532-1997',
    short: 'Lei 9.532/1997',
    name: 'Lei nº 9.532 de 10/12/1997',
    kind: 'lei',
    date: '1997-12-10',
    url: 'https://www.planalto.gov.br/ccivil_03/leis/l9532.htm',
    urn: 'urn:lex:br:federal:lei:1997-12-10;9532',
    source: 'planalto',
  },
  {
    id: 'lei8212-1991',
    short: 'Lei 8.212/1991',
    name: 'Lei nº 8.212 de 24/07/1991',
    kind: 'lei',
    date: '1991-07-24',
    url: 'https://www.planalto.gov.br/ccivil_03/leis/l8212cons.htm',
    urn: 'urn:lex:br:federal:lei:1991-07-24;8212',
    source: 'planalto',
  },
  {
    id: 'lei10666-2003',
    short: 'Lei 10.666/2003',
    name: 'Lei nº 10.666 de 08/05/2003',
    kind: 'lei',
    date: '2003-05-08',
    url: 'https://www.planalto.gov.br/ccivil_03/leis/2003/l10.666.htm',
    urn: 'urn:lex:br:federal:lei:2003-05-08;10666',
    source: 'planalto',
  },
  {
    id: 'lc116-2003',
    short: 'LC 116/2003',
    name: 'Lei Complementar nº 116 de 31/07/2003',
    kind: 'lei_complementar',
    date: '2003-07-31',
    url: 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp116.htm',
    urn: 'urn:lex:br:federal:lei.complementar:2003-07-31;116',
    source: 'planalto',
  },
  {
    id: 'lei5172-1966',
    short: 'CTN',
    name: 'Lei nº 5.172 de 25/10/1966',
    kind: 'lei',
    date: '1966-10-25',
    url: 'https://www.planalto.gov.br/ccivil_03/leis/l5172compilado.htm',
    urn: 'urn:lex:br:federal:lei:1966-10-25;5172',
    source: 'planalto',
  },
  {
    id: 'res-cgsn140-2018',
    short: 'Res. CGSN 140/2018',
    name: 'Resolução CGSN nº 140, de 22 de maio de 2018',
    kind: 'resolucao_cgsn',
    date: '2018-05-22',
    url: 'https://normasinternet2.receita.fazenda.gov.br/#/consulta/externa/92278/visao/vigente',
    urn: null,
    source: 'receita',
  },
  {
    id: 'res-cgsn190-2026',
    short: 'Res. CGSN 190/2026',
    name: 'Resolução CGSN nº 190, de 4 de agosto de 2026',
    kind: 'resolucao_cgsn',
    date: '2026-08-04',
    url: 'https://normasinternet2.receita.fazenda.gov.br/#/consulta/externa/152832',
    urn: null,
    source: 'receita',
  },
  {
    id: 'lei11053-2004',
    short: 'Lei 11.053/2004',
    name: 'Lei nº 11.053 de 29/12/2004',
    kind: 'lei',
    date: '2004-12-29',
    url: 'https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2004/lei/l11053.htm',
    urn: 'urn:lex:br:federal:lei:2004-12-29;11053',
    source: 'planalto',
  },
  {
    id: 'dec12797-2025',
    short: 'Decreto 12.797/2025',
    name: 'Decreto nº 12.797 de 23/12/2025',
    kind: 'decreto',
    date: '2025-12-23',
    url: 'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/decreto/d12797.htm',
    urn: 'urn:lex:br:federal:decreto:2025-12-23;12797',
    source: 'planalto',
  },
  {
    id: 'port-mps-mf13-2026',
    short: 'Portaria Interministerial MPS/MF 13/2026',
    name: 'Portaria Interministerial MPS/MF nº 13, de 9 de janeiro de 2026',
    kind: 'portaria_interministerial',
    date: '2026-01-09',
    url: 'https://www.in.gov.br/web/dou/-/portaria-interministerial-mps/mf-n-13-de-9-de-janeiro-de-2026-680382603',
    urn: null,
    source: 'dou',
  },
  {
    id: 'lei15270-2025',
    short: 'Lei 15.270/2025',
    name: 'Lei nº 15.270 de 26/11/2025',
    kind: 'lei',
    date: '2025-11-26',
    url: 'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/L15270.htm',
    urn: 'urn:lex:br:federal:lei:2025-11-26;15270',
    source: 'planalto',
  },
  {
    id: 'lc238-2026',
    short: 'LC 238/2026',
    name: 'Lei Complementar nº 238 de 21/10/2026',
    kind: 'lei_complementar',
    date: '2026-10-21',
    url: 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp238.htm',
    urn: 'urn:lex:br:federal:lei.complementar:2026-10-21;238',
    source: 'planalto',
  },
  {
    id: 'lei10147-2000',
    short: 'Lei 10.147/2000',
    name: 'Lei nº 10.147 de 21/12/2000',
    kind: 'lei',
    date: '2000-12-21',
    url: 'https://www.planalto.gov.br/ccivil_03/leis/l10147.htm',
    urn: 'urn:lex:br:federal:lei:2000-12-21;10147',
    source: 'planalto',
  },
  {
    id: 'lei10485-2002',
    short: 'Lei 10.485/2002',
    name: 'Lei nº 10.485 de 03/07/2002',
    kind: 'lei',
    date: '2002-07-03',
    url: 'https://www.planalto.gov.br/ccivil_03/leis/2002/l10485.htm',
    urn: 'urn:lex:br:federal:lei:2002-07-03;10485',
    source: 'planalto',
  },
  {
    id: 'lc118-2005',
    short: 'LC 118/2005',
    name: 'Lei Complementar nº 118 de 09/02/2005',
    kind: 'lei_complementar',
    date: '2005-02-09',
    url: 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp118.htm',
    urn: 'urn:lex:br:federal:lei.complementar:2005-02-09;118',
    source: 'planalto',
  },
  {
    id: 'lei810-1949',
    short: 'Lei 810/1949',
    name: 'Lei nº 810 de 06/09/1949',
    kind: 'lei',
    date: '1949-09-06',
    url: 'https://www.planalto.gov.br/ccivil_03/leis/1930-1949/l810-49.htm',
    urn: 'urn:lex:br:federal:lei:1949-09-06;810',
    source: 'planalto',
  },
  {
    id: 'lei10406-2002',
    short: 'CC',
    name: 'Lei nº 10.406 de 10/01/2002',
    kind: 'lei',
    date: '2002-01-10',
    url: 'https://www.planalto.gov.br/ccivil_03/leis/2002/l10406compilada.htm',
    urn: 'urn:lex:br:federal:lei:2002-01-10;10406',
    source: 'planalto',
  },
  {
    id: 'lei9249-1995',
    short: 'Lei 9.249/1995',
    name: 'Lei nº 9.249 de 26/12/1995',
    kind: 'lei',
    date: '1995-12-26',
    url: 'https://www.planalto.gov.br/ccivil_03/leis/l9249.htm',
    urn: 'urn:lex:br:federal:lei:1995-12-26;9249',
    source: 'planalto',
  },
  {
    id: 'dl1598-1977',
    short: 'DL 1.598/1977',
    name: 'Decreto-Lei nº 1.598 de 26/12/1977',
    kind: 'decreto_lei',
    date: '1977-12-26',
    url: 'https://www.planalto.gov.br/ccivil_03/decreto-lei/del1598.htm',
    urn: 'urn:lex:br:federal:decreto.lei:1977-12-26;1598',
    source: 'planalto',
  },
  {
    id: 'lei10833-2003',
    short: 'Lei 10.833/2003',
    name: 'Lei nº 10.833 de 29/12/2003',
    kind: 'lei',
    date: '2003-12-29',
    url: 'https://www.planalto.gov.br/ccivil_03/leis/2003/l10.833.htm',
    urn: 'urn:lex:br:federal:lei:2003-12-29;10833',
    source: 'planalto',
  },
  {
    id: 'lei10637-2002',
    short: 'Lei 10.637/2002',
    name: 'Lei nº 10.637 de 30/12/2002',
    kind: 'lei',
    date: '2002-12-30',
    url: 'https://www.planalto.gov.br/ccivil_03/leis/2002/l10637.htm',
    urn: 'urn:lex:br:federal:lei:2002-12-30;10637',
    source: 'planalto',
  },
];
