// Citation guard (ARCHITECTURE §4.5): every legal citation in a model text must be one of the finding's LegalRefs.
// Rule 3: citations come only from the rule's metadata; the model never picks an article.
import type { LegalRef } from '@refund/engine';
import { fold } from './ptbr.ts';

export interface CitationGuardResult {
  ok: boolean;
  /** The citations (as written, with their law when the text gave one) that no allowed ref holds. */
  outsideRefs: string[];
}

interface Token {
  kind: 'law' | 'art' | 'par';
  /** law: 'lc:123', 'lei:9250', 'res:140'…; art/par: '18', '3-a', '5-j' (one per listed item). */
  keys: string[];
  index: number;
  end: number;
}

const ORD = String.raw`\s*(?:º|°|o(?![\p{L}]))?`;
const ITEM = String.raw`\d+${ORD}(?:\s*-\s*[A-Z](?![\p{L}]))?`;
const ITEM_LIST = String.raw`${ITEM}(?:\s*(?:,|e)\s*${ITEM})*`;
const NUM = String.raw`(?:n\.?\s*[º°o]?\s*)?(?<num>\d{1,3}(?:\.\d{3})+|\d+)`;

// Laws: "LC 123/2006", "Lei Complementar nº 123", "Lei 9.250/1995", "Res. CGSN 140", "Resolução CGSN nº 140",
// "Decreto 12.797", "Portaria MPS/MF 13", "CTN". Articles: "art. 18", "arts. 18 e 19", "artigo 3º-A".
// Paragraphs: "§ 5º-J", "§§ 5º-J e 5º-M", "parágrafo 2º". Same-named groups live in different alternatives.
const TOKEN = new RegExp(
  [
    String.raw`(?<lc>\bLC|\bLei\s+Complementar)\s*${NUM}`,
    String.raw`(?<lei>\bLei)\s*${NUM}`,
    String.raw`(?<res>\bRes(?:\.|olução|olucao)\s*(?:CGSN\s*)?)${NUM}`,
    String.raw`(?<decreto>\bDecreto)\s*${NUM}`,
    String.raw`(?<portaria>\bPortaria(?:\s+Interministerial)?(?:\s+[A-Z]{2,4}(?:\s*\/\s*[A-Z]{2,4})?)?)\s*${NUM}`,
    String.raw`(?<in>\bIN(?:\s+RFB)?|\bInstru[çc][ãa]o\s+Normativa(?:\s+RFB)?)\s*${NUM}`,
    String.raw`(?<ctn>\bCTN\b|\bC[óo]digo\s+Tribut[áa]rio\s+Nacional)`,
    String.raw`(?<art>\bart(?:igo)?s?\.?)\s*(?<items>${ITEM_LIST})`,
    String.raw`(?<par>§§?|\bpar[áa]grafos?)\s*(?<items>${ITEM_LIST})`,
  ].join('|'),
  'giu',
);
const ITEM_RE = new RegExp(ITEM, 'giu');
const LAW_KINDS = ['lc', 'lei', 'res', 'decreto', 'portaria', 'in'] as const;

const itemKeys = (list: string): string[] =>
  [...list.matchAll(ITEM_RE)].map((m) =>
    fold(m[0])
      .replace(/\s+/g, '')
      .replace(/(\d)[º°o]/, '$1'),
  );

function tokens(text: string): Token[] {
  const out: Token[] = [];
  for (const m of text.matchAll(TOKEN)) {
    const g = m.groups as Record<string, string | undefined>;
    const at = { index: m.index, end: m.index + m[0].length };
    const law = LAW_KINDS.find((k) => g[k] !== undefined);
    if (law !== undefined)
      out.push({ kind: 'law', keys: [`${law}:${String(g.num).replaceAll('.', '')}`], ...at });
    else if (g.ctn !== undefined) out.push({ kind: 'law', keys: ['lei:5172'], ...at });
    else
      out.push({
        kind: g.art !== undefined ? 'art' : 'par',
        keys: itemKeys(String(g.items)),
        ...at,
      });
  }
  return out;
}

// Two tokens belong to the same citation when only punctuation, a year or a joining word sits between them
// ("LC 123/2006, art. 18, § 5º-J"; "art. 26 da Res. CGSN 140").
const JOIN = /^(?:\/\s*\d{4})?[\s,()]*(?:(?:e|do|da|de|dos|das|na|no)\s+)?[\s,()]*$/iu;
const OF = /^[\s,]*(?:da|do|na|no)\s+$/iu;

/** One cited path (law → article → paragraph); any part may be missing. */
interface Path {
  law: string | undefined;
  art: string | undefined;
  par: string | undefined;
  raw: string;
}

function group(text: string): Token[][] {
  const groups: Token[][] = [];
  for (const t of tokens(text)) {
    const last = groups.at(-1);
    const prev = last?.at(-1);
    if (last !== undefined && prev !== undefined && JOIN.test(text.slice(prev.end, t.index)))
      last.push(t);
    else groups.push([t]);
  }
  return groups;
}

function paths(text: string): Path[] {
  const out: Path[] = [];
  for (const g of group(text)) {
    const raw = text.slice((g[0] as Token).index, (g[g.length - 1] as Token).end).trim();
    // The law that governs token i: one named right after it with "da/do" ("art. 26, § 1º, da Res. CGSN 140"),
    // else the last one before it, else the next one.
    const lawOf = (i: number): string | undefined => {
      let j = i;
      while (g[j + 1]?.kind === 'par') j++;
      const next = g[j + 1];
      const cur = g[j] as Token;
      if (next?.kind === 'law' && OF.test(text.slice(cur.end, next.index))) return next.keys[0];
      return (
        g.slice(0, i + 1).findLast((t) => t.kind === 'law')?.keys[0] ??
        g.slice(i).find((t) => t.kind === 'law')?.keys[0]
      );
    };
    const push = (law: string | undefined, art: string | undefined, par: string | undefined) =>
      out.push({ law, art, par, raw });

    let art: { key: string; at: number; open: boolean } | undefined;
    const flush = () => {
      if (art?.open) push(lawOf(art.at), art.key, undefined);
    };
    g.forEach((t, i) => {
      if (t.kind === 'law') {
        flush();
        art = undefined;
        push(t.keys[0], undefined, undefined);
      } else if (t.kind === 'art') {
        flush();
        for (const k of t.keys.slice(0, -1)) push(lawOf(i), k, undefined);
        art = { key: t.keys[t.keys.length - 1] as string, at: i, open: true };
      } else {
        for (const k of t.keys) push(lawOf(i), art?.key, k);
        if (art !== undefined) art.open = false;
      }
    });
    flush();
  }
  return out;
}

interface RefKeys {
  laws: Set<string>;
  arts: Set<string>;
  pars: Set<string>;
}

/** The laws, articles and paragraphs a LegalRef holds: from its label, and the law from its id (CTN = Lei 5.172). */
function refKeys(ref: LegalRef): RefKeys {
  const keys: RefKeys = { laws: new Set(), arts: new Set(), pars: new Set() };
  for (const t of tokens(ref.label)) {
    const set = t.kind === 'law' ? keys.laws : t.kind === 'art' ? keys.arts : keys.pars;
    for (const k of t.keys) set.add(k);
  }
  const id = /^(lc|lei|res-cgsn|dec|port-[a-z-]*?)(\d+)-\d{4}\//.exec(ref.id);
  if (id !== null) {
    const kind = String(id[1]);
    const prefix = kind.startsWith('res')
      ? 'res'
      : kind === 'dec'
        ? 'decreto'
        : kind.startsWith('port')
          ? 'portaria'
          : kind;
    keys.laws.add(`${prefix}:${id[2]}`);
  }
  return keys;
}

const covers = (r: RefKeys, p: Path): boolean =>
  (p.law === undefined || r.laws.has(p.law)) &&
  (p.art === undefined || r.arts.has(p.art)) &&
  (p.par === undefined || r.pars.has(p.par));

export function citationGuard(text: string, allowedRefs: LegalRef[]): CitationGuardResult {
  const refs = allowedRefs.map(refKeys);
  const outside = paths(text).filter((p) => !refs.some((r) => covers(r, p)));
  return { ok: outside.length === 0, outsideRefs: [...new Set(outside.map((p) => p.raw))] };
}
