import dec12797 from '../articles/dec12797-2025.json' with { type: 'json' };
import dl1598 from '../articles/dl1598-1977.json' with { type: 'json' };
import inSfSurem10 from '../articles/in-sf-surem10-2019.json' with { type: 'json' };
import lc116 from '../articles/lc116-2003.json' with { type: 'json' };
import lc118 from '../articles/lc118-2005.json' with { type: 'json' };
import lc123 from '../articles/lc123-2006.json' with { type: 'json' };
import lc214 from '../articles/lc214-2025.json' with { type: 'json' };
import lc238 from '../articles/lc238-2026.json' with { type: 'json' };
import lei810 from '../articles/lei810-1949.json' with { type: 'json' };
import ctn from '../articles/lei5172-1966.json' with { type: 'json' };
import lei8212 from '../articles/lei8212-1991.json' with { type: 'json' };
import lei9249 from '../articles/lei9249-1995.json' with { type: 'json' };
import lei9250 from '../articles/lei9250-1995.json' with { type: 'json' };
import lei9532 from '../articles/lei9532-1997.json' with { type: 'json' };
import lei10147 from '../articles/lei10147-2000.json' with { type: 'json' };
import cc from '../articles/lei10406-2002.json' with { type: 'json' };
import lei10485 from '../articles/lei10485-2002.json' with { type: 'json' };
import lei10637 from '../articles/lei10637-2002.json' with { type: 'json' };
import lei10666 from '../articles/lei10666-2003.json' with { type: 'json' };
import lei10833 from '../articles/lei10833-2003.json' with { type: 'json' };
import lei11053 from '../articles/lei11053-2004.json' with { type: 'json' };
import lei15191 from '../articles/lei15191-2025.json' with { type: 'json' };
import lei15270 from '../articles/lei15270-2025.json' with { type: 'json' };
import port13 from '../articles/port-mps-mf13-2026.json' with { type: 'json' };
import res140 from '../articles/res-cgsn140-2018.json' with { type: 'json' };
import res190 from '../articles/res-cgsn190-2026.json' with { type: 'json' };
import esocialMos from '../procedures/esocial-mos-s-1.3.json' with { type: 'json' };
import manualPgdas from '../procedures/manual-pgdas-d.json' with { type: 'json' };
import manualRestituicao from '../procedures/manual-restituicao-sn-2025-10-20.json' with {
  type: 'json',
};
import portalSimples from '../procedures/portal-simples.json' with { type: 'json' };
import prIrpf2026 from '../procedures/pr-irpf-2026.json' with { type: 'json' };
import prSimples from '../procedures/pr-simples-2026-10-09.json' with { type: 'json' };
import rfbAutorizacoes from '../procedures/rfb-autorizacoes-de-acesso.json' with { type: 'json' };
import rfbDctfweb from '../procedures/rfb-noticia-2023-10-prazo-dctfweb.json' with { type: 'json' };
import rfbIrpf2026 from '../procedures/rfb-noticia-2026-03-irpf-2026.json' with { type: 'json' };
import rfbAltasRendas from '../procedures/rfb-pr-altas-rendas-2025-12-19.json' with {
  type: 'json',
};
import spFazenda from '../procedures/sp-fazenda.json' with { type: 'json' };
import spManualSav from '../procedures/sp-manual-sav-2.15.json' with { type: 'json' };
import { type Regulation, regulations } from '../regulations.ts';

export type { Regulation, RegulationKind } from '../regulations.ts';

export const PACKAGE_NAME = '@refund/law';

/** One cited provision, in force on `capturedAt` (field rules in regulations.ts). */
export interface Provision {
  id: string;
  regulation: string;
  /** "art. 18, § 5º-J" */
  provision: string;
  /** "LC 123/2006, art. 18, § 5º-J" */
  label: string;
  /** Verbatim text from the primary source, without revoked text or drafting notes. */
  text: string;
  /** Drafting notes moved out of the text ("(Redação dada pela …)"). */
  notes: readonly string[];
  /** CivilDate from which this wording produces effects, or null when no captured provision states it. */
  effectiveFrom: string | null;
  /** Last CivilDate this wording produces effects, or null when no captured provision replaces or revokes it. */
  effectiveUntil: string | null;
  url: string;
  /** CivilDate of the capture. */
  capturedAt: string;
  /** SHA-256 (hex) of `text`. */
  hash: string;
  /** SHA-256 (hex) of the whole page text extracted from the source on `capturedAt` (or of the capture file, below). */
  sourceSha256: string;
  /**
   * Set when the text was transcribed from a capture in docs/conferencias/fontes-oficiais/ (12/11 captures, E8b)
   * instead of the 14/11 browser extraction; `sourceSha256` is then the SHA-256 of that file.
   */
  captureFile?: string;
}

export interface RegulationWithProvisions extends Regulation {
  provisions: readonly Provision[];
}

const corpus: readonly Provision[] = [
  lc123,
  lei9250,
  lei9532,
  lei8212,
  lei10666,
  lc116,
  ctn,
  res140,
  res190,
  lei11053,
  dec12797,
  port13,
  lei15270,
  lc238,
  lei10147,
  lei10485,
  lc118,
  lei810,
  cc,
  lei9249,
  dl1598,
  lei10833,
  lei10637,
  lc214,
  lei15191,
  inSfSurem10,
].flat();

const byId = new Map(corpus.map((p) => [p.id, p]));
const regulationById = new Map(regulations.map((r) => [r.id, r]));

/** Provision by id (e.g. `lc123-2006/art18/p5-j`), or undefined when it is not in the corpus. */
export function article(id: string): Provision | undefined {
  return byId.get(id);
}

/** Regulation by id (e.g. `lc123-2006`) with its provisions, or undefined when it is not in the catalog. */
export function regulation(id: string): RegulationWithProvisions | undefined {
  const r = regulationById.get(id);
  if (!r) return undefined;
  return { ...r, provisions: corpus.filter((p) => p.regulation === id) };
}

/** Every provision of the corpus, in catalog order. */
export function all(): readonly Provision[] {
  return corpus;
}

/** Whether the wording is in force on `date` (CivilDate 'YYYY-MM-DD'; ISO dates compare as strings). */
export function inForceOn(p: Provision, date: string): boolean {
  return (
    (p.effectiveFrom === null || p.effectiveFrom <= date) &&
    (p.effectiveUntil === null || date <= p.effectiveUntil)
  );
}

/**
 * Verbatim excerpt of an official non-law source (manual, Q&A, official page) that a C.12 action-plan step cites
 * (ENGINE-SPEC C.12, rule 2: a `LegalRef` of type `procedure`). Captured on `capturedAt` in
 * docs/conferencias/fontes-oficiais/; every line of `text` is found verbatim in `textFile` (whitespace aside).
 */
export interface Procedure {
  /** '<source>#<item>', e.g. 'manual-restituicao-sn-2025-10-20#3.1.1'. */
  id: string;
  kind: 'procedure';
  /** "Manual da Restituição do Simples Nacional (20/10/2025), item 3.1.1" */
  label: string;
  /** One verbatim sentence or passage per line. */
  text: string;
  url: string;
  capturedAt: string;
  /** SHA-256 (hex) of `text`. */
  hash: string;
  /** SHA-256 (hex) of `captureFile` (the table of docs/pesquisa/08-como-receber.md §12). */
  sourceSha256: string;
  /** Capture file name in docs/conferencias/fontes-oficiais/ (the PDF, for PDF sources). */
  captureFile: string;
  /** File the text was transcribed from: the capture itself, or its text extraction for a PDF. */
  textFile: string;
}

const procedureList = [
  manualRestituicao,
  manualPgdas,
  prSimples,
  portalSimples,
  spFazenda,
  spManualSav,
  rfbAutorizacoes,
  esocialMos,
  rfbDctfweb,
  prIrpf2026,
  rfbIrpf2026,
  rfbAltasRendas,
].flat() as readonly Procedure[];
const procedureById = new Map(procedureList.map((p) => [p.id, p]));

/** Procedure excerpt by id, or undefined when it is not in the corpus. */
export function procedure(id: string): Procedure | undefined {
  return procedureById.get(id);
}

/** Every procedure excerpt, in catalog order. */
export function allProcedures(): readonly Procedure[] {
  return procedureList;
}

export { regulations };
