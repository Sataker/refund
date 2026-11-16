// The @refund/law corpus read from its data files (provisions and procedure excerpts). A package dependency
// engine → law would form a cycle with law/test → engine (TESTS §1), so the files are imported by relative path.
import dec12797 from '../../../../law/articles/dec12797-2025.json' with { type: 'json' };
import dl1598 from '../../../../law/articles/dl1598-1977.json' with { type: 'json' };
import inSfSurem10 from '../../../../law/articles/in-sf-surem10-2019.json' with { type: 'json' };
import lc116 from '../../../../law/articles/lc116-2003.json' with { type: 'json' };
import lc118 from '../../../../law/articles/lc118-2005.json' with { type: 'json' };
import lc123 from '../../../../law/articles/lc123-2006.json' with { type: 'json' };
import lc214 from '../../../../law/articles/lc214-2025.json' with { type: 'json' };
import lc238 from '../../../../law/articles/lc238-2026.json' with { type: 'json' };
import lei810 from '../../../../law/articles/lei810-1949.json' with { type: 'json' };
import lei5172 from '../../../../law/articles/lei5172-1966.json' with { type: 'json' };
import lei8212 from '../../../../law/articles/lei8212-1991.json' with { type: 'json' };
import lei9249 from '../../../../law/articles/lei9249-1995.json' with { type: 'json' };
import lei9250 from '../../../../law/articles/lei9250-1995.json' with { type: 'json' };
import lei9532 from '../../../../law/articles/lei9532-1997.json' with { type: 'json' };
import lei10147 from '../../../../law/articles/lei10147-2000.json' with { type: 'json' };
import lei10406 from '../../../../law/articles/lei10406-2002.json' with { type: 'json' };
import lei10485 from '../../../../law/articles/lei10485-2002.json' with { type: 'json' };
import lei10637 from '../../../../law/articles/lei10637-2002.json' with { type: 'json' };
import lei10666 from '../../../../law/articles/lei10666-2003.json' with { type: 'json' };
import lei10833 from '../../../../law/articles/lei10833-2003.json' with { type: 'json' };
import lei11053 from '../../../../law/articles/lei11053-2004.json' with { type: 'json' };
import lei15191 from '../../../../law/articles/lei15191-2025.json' with { type: 'json' };
import lei15270 from '../../../../law/articles/lei15270-2025.json' with { type: 'json' };
import port13 from '../../../../law/articles/port-mps-mf13-2026.json' with { type: 'json' };
import res140 from '../../../../law/articles/res-cgsn140-2018.json' with { type: 'json' };
import res190 from '../../../../law/articles/res-cgsn190-2026.json' with { type: 'json' };
import esocialMos from '../../../../law/procedures/esocial-mos-s-1.3.json' with { type: 'json' };
import manualPgdas from '../../../../law/procedures/manual-pgdas-d.json' with { type: 'json' };
import manualRestituicao from '../../../../law/procedures/manual-restituicao-sn-2025-10-20.json' with {
  type: 'json',
};
import portalSimples from '../../../../law/procedures/portal-simples.json' with { type: 'json' };
import prIrpf2026 from '../../../../law/procedures/pr-irpf-2026.json' with { type: 'json' };
import prSimples from '../../../../law/procedures/pr-simples-2026-10-09.json' with { type: 'json' };
import rfbAutorizacoes from '../../../../law/procedures/rfb-autorizacoes-de-acesso.json' with {
  type: 'json',
};
import rfbDctfweb from '../../../../law/procedures/rfb-noticia-2023-10-prazo-dctfweb.json' with {
  type: 'json',
};
import rfbIrpf2026 from '../../../../law/procedures/rfb-noticia-2026-03-irpf-2026.json' with {
  type: 'json',
};
import rfbAltasRendas from '../../../../law/procedures/rfb-pr-altas-rendas-2025-12-19.json' with {
  type: 'json',
};
import spFazenda from '../../../../law/procedures/sp-fazenda.json' with { type: 'json' };
import spManualSav from '../../../../law/procedures/sp-manual-sav-2.15.json' with { type: 'json' };

export interface CorpusEntry {
  id: string;
  label: string;
  text: string;
  url: string;
  sourceSha256: string;
  effectiveFrom?: string | null;
  effectiveUntil?: string | null;
  kind?: 'procedure';
}

const provisions = [
  dec12797,
  dl1598,
  inSfSurem10,
  lc116,
  lc118,
  lc123,
  lc214,
  lc238,
  lei5172,
  lei810,
  lei8212,
  lei9249,
  lei9250,
  lei9532,
  lei10147,
  lei10406,
  lei10485,
  lei10637,
  lei10666,
  lei10833,
  lei11053,
  lei15191,
  lei15270,
  port13,
  res140,
  res190,
].flat() as CorpusEntry[];

const procedures = [
  esocialMos,
  manualPgdas,
  manualRestituicao,
  portalSimples,
  prIrpf2026,
  prSimples,
  rfbAutorizacoes,
  rfbDctfweb,
  rfbIrpf2026,
  rfbAltasRendas,
  spFazenda,
  spManualSav,
].flat() as CorpusEntry[];

/** Every provision and procedure excerpt of @refund/law, by id. */
export const LAW: ReadonlyMap<string, CorpusEntry> = new Map(
  [...provisions, ...procedures].map((p) => [p.id, p]),
);
