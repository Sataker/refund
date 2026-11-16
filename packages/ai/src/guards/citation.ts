// Citation guard (ARCHITECTURE §4.5): every legal citation in a model text must be one of the finding's LegalRefs.
// Rule 3: citations come only from the rule's metadata; the model never picks an article.
// Fail closed: any legal designator the parser knows (law, MP, EC, Constituição, códigos, CLT, súmula, tema, solução
// de consulta…) must be in the refs, and an article it cannot tie to a law named in the refs fails.
import type { LegalRef } from '@refund/engine';
import { fold } from './ptbr.ts';

export interface CitationGuardResult {
  ok: boolean;
  /** The citations (as written, with their law when the text gave one) that no allowed ref holds. */
  outsideRefs: string[];
}

type Level = 'art' | 'par' | 'inc' | 'ali';
const DEPTH: Record<Level, number> = { art: 1, par: 2, inc: 3, ali: 4 };

interface Token {
  kind: 'law' | Level | 'unresolved';
  /** law: 'lc:123', 'lei:9250', 'cf'…; levels: '18', '3-a', '5-j', 'XVI', 'a' (one per listed item). */
  keys: string[];
  index: number;
  end: number;
  /** A roman numeral without "inciso": an item only right after an article or paragraph ("art. 12, V"). */
  bare?: true;
}

/** Marker of a law the text points at but does not name ("da mesma lei", "do Estatuto…"). */
const UNRESOLVED = '?';

const ORD = String.raw`\s*(?:º|°|o(?![\p{L}]))?`;
const ITEM = String.raw`\d+${ORD}(?:\s*-\s*[A-Z](?![\p{L}]))?`;
const ITEM_LIST = String.raw`${ITEM}(?:\s*(?:,|e|ou)\s*${ITEM})*`;
const ROMAN = String.raw`[IVXLC]{1,7}(?![\p{L}])`;
const ROMAN_LIST = String.raw`${ROMAN}(?:\s*(?:,|e|ou)\s*${ROMAN})*`;
const NUM = String.raw`(?:(?:n\.?\s*[º°o]?|n[úu]mero)\s*)?(?<num>\d{1,3}(?:\.\d{3})+|\d+)`;
const NUMBER_WORDS = String.raw`(?:primeir[oa]|segund[oa]|terceir[oa]|quart[oa]|quint[oa]|sext[oa]|s[ée]tim[oa]|oitav[oa]|non[oa]|d[ée]cim[oa]|um|uma|dois|duas|tr[êe]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento)(?![\p{L}])`;

// Case-insensitive designators (words). Order matters: "Decreto-Lei" before "Decreto", "Lei Complementar" before "Lei".
const WORDS = new RegExp(
  [
    String.raw`(?<dl>\bDecreto[\s-]+Lei)\s*${NUM}`,
    String.raw`(?<lc>\bLei\s+Comp(?:lementar|\.))\s*${NUM}`,
    String.raw`(?<lei>\bLei(?:\s+(?:Federal|Ordin[áa]ria|Estadual|Municipal))?)\s*${NUM}`,
    String.raw`(?<mp>\bMedida\s+Provis[óo]ria)\s*${NUM}`,
    String.raw`(?<ec>\bEmenda\s+Constitucional)\s*${NUM}`,
    String.raw`(?<res>\bRes(?:\.|olu[çc][ãa]o)\s*(?:CGSN\s*)?)${NUM}`,
    String.raw`(?<decreto>\bDecreto)\s*${NUM}`,
    String.raw`(?<portaria>\bPortaria(?:\s+Interministerial)?(?:\s+[A-Z]{2,5}(?:\s*\/\s*[A-Z]{2,5})?)?)\s*${NUM}`,
    String.raw`(?<in>\bInstru[çc][ãa]o\s+Normativa(?:\s+[A-Z]{2,5})?)\s*${NUM}`,
    String.raw`(?<sumula>\bS[úu]mula(?:\s+Vinculante)?)\s*${NUM}`,
    String.raw`(?<tema>\bTema)\s*${NUM}`,
    String.raw`(?<sc>\bSolu[çc][ãa]o\s+de\s+Consulta(?:\s+\p{L}+)?)\s*${NUM}`,
    String.raw`(?<parecer>\bParecer(?:\s+Normativo)?(?:\s+[A-Z]{2,6})?)\s*${NUM}`,
    String.raw`(?<ato>\bAto\s+Declarat[óo]rio(?:\s+\p{L}+)?(?:\s+[A-Z]{2,6})?)\s*${NUM}`,
    String.raw`(?<cf>\bConstitui[çc][ãa]o(?:\s+Federal)?)`,
    String.raw`(?<codigo>\bC[óo]digo\s+\p{L}+(?:\s+(?:de\s+|do\s+|da\s+)?\p{L}+)?)`,
    String.raw`(?<clt>\bConsolida[çc][ãa]o\s+das\s+Leis\s+do\s+Trabalho)`,
    String.raw`(?<same>\b(?:mesma|referida|citada|aludida)\s+(?:lei|norma|resolu[çc][ãa]o|lc|instru[çc][ãa]o|portaria|decreto))`,
    String.raw`(?<art>\bart(?:igo)?s?\.?)\s*(?<items>${ITEM_LIST})`,
    String.raw`(?<artWords>\bart(?:igo)?s?\.?)\s*${NUMBER_WORDS}`,
    String.raw`(?<parUnico>\bpar[áa]grafo\s+[úu]nico)`,
    String.raw`(?<par>§§?|\bpar[áa]grafos?)\s*(?<items>${ITEM_LIST})`,
    String.raw`(?<parWords>§§?|\bpar[áa]grafos?)\s*${NUMBER_WORDS}`,
    String.raw`(?<inc>\bincisos?)\s*(?<romans>${ROMAN_LIST})`,
    String.raw`(?<ali>\bal[íi]neas?)\s*["“']?(?<letter>[a-z])(?![\p{L}])`,
  ].join('|'),
  'giu',
);

// Case-sensitive acronyms: "cf." (confira) or "in" must not read as a law.
const ACRONYMS = new RegExp(
  [
    String.raw`(?<lc>\bL\.?\s?C\.?)\s*${NUM}`,
    String.raw`(?<dl>\bDL)\s*${NUM}`,
    String.raw`(?<mp>\bMP)\s*${NUM}`,
    String.raw`(?<ec>\bEC)\s*${NUM}`,
    String.raw`(?<in>\bIN(?:\s+(?:RFB|SRF))?)\s*${NUM}`,
    String.raw`(?<cf>\bCF(?:\/88)?)(?![\p{L}])`,
    String.raw`(?<clt>\bCLT)(?![\p{L}])`,
    String.raw`(?<rir>\bRIR)(?![\p{L}])`,
    String.raw`(?<ctn>\bCTN)(?![\p{L}])`,
    String.raw`(?<=,\s?)(?<bare>${ROMAN})`,
  ].join('|'),
  'gu',
);

const NUMBERED = [
  'dl',
  'lc',
  'lei',
  'mp',
  'ec',
  'res',
  'decreto',
  'portaria',
  'in',
  'sumula',
  'tema',
  'sc',
  'parecer',
  'ato',
] as const;

const ITEM_RE = new RegExp(ITEM, 'giu');
const ROMAN_RE = new RegExp(ROMAN, 'giu');

const itemKeys = (list: string): string[] =>
  [...list.matchAll(ITEM_RE)].map((m) =>
    fold(m[0])
      .replace(/\s+/g, '')
      .replace(/(\d)[º°o]/, '$1'),
  );

function lawKey(g: Record<string, string | undefined>): string | null {
  const numbered = NUMBERED.find((k) => g[k] !== undefined);
  if (numbered !== undefined) return `${numbered}:${String(g.num).replaceAll('.', '')}`;
  if (g.cf !== undefined) return 'cf';
  if (g.clt !== undefined) return 'clt';
  if (g.rir !== undefined) return 'rir';
  if (g.ctn !== undefined) return 'lei:5172';
  if (g.codigo !== undefined) {
    const name = fold(g.codigo).replace(/^codigo\s+/, '');
    return name.startsWith('tributario nacional') ? 'lei:5172' : `codigo:${name}`;
  }
  return null;
}

function toToken(m: RegExpMatchArray): Token {
  const g = m.groups as Record<string, string | undefined>;
  const at = { index: m.index as number, end: (m.index as number) + m[0].length };
  const law = lawKey(g);
  if (law !== null) return { kind: 'law', keys: [law], ...at };
  if (g.art !== undefined) return { kind: 'art', keys: itemKeys(String(g.items)), ...at };
  if (g.par !== undefined) return { kind: 'par', keys: itemKeys(String(g.items)), ...at };
  if (g.parUnico !== undefined) return { kind: 'par', keys: ['unico'], ...at };
  if (g.inc !== undefined)
    return {
      kind: 'inc',
      keys: [...String(g.romans).matchAll(ROMAN_RE)].map((r) => r[0].toUpperCase()),
      ...at,
    };
  if (g.bare !== undefined) return { kind: 'inc', keys: [g.bare], bare: true, ...at };
  if (g.ali !== undefined) return { kind: 'ali', keys: [String(g.letter).toLowerCase()], ...at };
  // "artigo dezoito", "parágrafo quinto", "da mesma lei": never a path the refs can hold.
  return { kind: 'unresolved', keys: [UNRESOLVED], ...at };
}

/**
 * NFKC first: full-width "１７" or "＄" are read as what they look like. The ordinal indicators º and ª survive (NFKC
 * would turn them into "o" and "a").
 */
export const normalize = (text: string): string =>
  text
    .replaceAll('º', '\u0001')
    .replaceAll('ª', '\u0002')
    .normalize('NFKC')
    .replaceAll('\u0001', 'º')
    .replaceAll('\u0002', 'ª');

function tokens(text: string): Token[] {
  const all = [...text.matchAll(WORDS), ...text.matchAll(ACRONYMS)]
    .map(toToken)
    .sort((a, b) => a.index - b.index || b.end - a.end);
  const out: Token[] = [];
  for (const t of all) {
    const prev = out.at(-1);
    if (prev === undefined || t.index >= prev.end) out.push(t);
  }
  return out;
}

/** Spans of every citation token: the numeric guard does not read article or law numbers as amounts. */
export function citationSpans(text: string): [number, number][] {
  return tokens(normalize(text)).map((t) => [t.index, t.end]);
}

// Two tokens belong to the same citation when only punctuation, a year or a joining word sits between them
// ("LC 123/2006, art. 18, § 5º-J"; "art. 26 da Res. CGSN 140"; "§ 5º-J, e o art. 25").
const JOIN =
  /^(?:\/\s*\d{2,4})?[\s,()]*(?:(?:e|ou|do|da|de|dos|das|na|no|e\s+o|e\s+a|e\s+no|e\s+na)\s+)?[\s,()]*$/iu;
/** "… da/do <Capitalised>": the text names the law right after the article. */
const OF_NAME = /^\s*,?\s*(?:da|do|de|na|no)\s+(?=\p{Lu})/u;
const OF = /^\s*,?\s*(?:da|do|de|na|no)\s+/iu;

/** One cited path; any level may be missing. */
interface Path {
  law: string | undefined;
  art: string | undefined;
  par: string | undefined;
  inc: string | undefined;
  ali: string | undefined;
  raw: string;
}

function groups(text: string): Token[][] {
  const out: Token[][] = [];
  for (const t of tokens(text)) {
    const last = out.at(-1);
    const prev = last?.at(-1);
    if (last !== undefined && prev !== undefined && JOIN.test(text.slice(prev.end, t.index)))
      last.push(t);
    else out.push([t]);
  }
  // A bare roman numeral is an item only after an article or paragraph of the same citation.
  return out
    .map((g) => g.filter((t, i) => !t.bare || (i > 0 && g[i - 1]?.kind !== 'law')))
    .filter((g) => g.length > 0);
}

export function paths(text: string): Path[] {
  const out: Path[] = [];
  for (const g of groups(text)) {
    const raw = text.slice((g[0] as Token).index, (g[g.length - 1] as Token).end).trim();
    // The law of a chain that ends at token j: one named right after it ("art. 26, § 1º, da Res. CGSN 140"); a
    // capitalised name that is no known law, or "da mesma lei", is unresolved; else the last law before it in the
    // citation, else the next one.
    const lawOf = (start: number, j: number): string | undefined => {
      const cur = g[j] as Token;
      const next = g[j + 1];
      const after = text.slice(cur.end);
      const named = OF_NAME.exec(after);
      if (named !== null) {
        if (next?.kind === 'law' && next.index === cur.end + named[0].length) return next.keys[0];
        return UNRESOLVED;
      }
      if (next?.kind === 'unresolved' && OF.test(text.slice(cur.end, next.index)))
        return UNRESOLVED;
      if (next?.kind === 'law' && OF.test(text.slice(cur.end, next.index))) return next.keys[0];
      return (
        g.slice(0, start + 1).findLast((t) => t.kind === 'law')?.keys[0] ??
        g.slice(j).find((t) => t.kind === 'law')?.keys[0]
      );
    };

    let cur: Partial<Record<Level, string>> = {};
    let start = -1;
    let last = -1;
    let deepest = 0;
    const emit = (at: Partial<Record<Level, string>>, s: number, j: number) =>
      out.push({ law: lawOf(s, j), art: at.art, par: at.par, inc: at.inc, ali: at.ali, raw });
    const flush = () => {
      if (deepest > 0) emit(cur, start, last);
      deepest = 0;
    };

    g.forEach((t, i) => {
      if (t.kind === 'law') {
        flush();
        cur = {};
        start = -1;
        out.push({
          law: t.keys[0],
          art: undefined,
          par: undefined,
          inc: undefined,
          ali: undefined,
          raw,
        });
        return;
      }
      if (t.kind === 'unresolved') {
        flush();
        out.push({
          law: UNRESOLVED,
          art: undefined,
          par: undefined,
          inc: undefined,
          ali: undefined,
          raw,
        });
        return;
      }
      const level = DEPTH[t.kind];
      if (deepest >= level) flush();
      const keep = Object.fromEntries(
        Object.entries(cur).filter(([l]) => DEPTH[l as Level] < level),
      ) as Partial<Record<Level, string>>;
      if (start < 0 || level === 1) start = i;
      for (const k of t.keys.slice(0, -1)) emit({ ...keep, [t.kind]: k }, start, i);
      cur = { ...keep, [t.kind]: t.keys[t.keys.length - 1] };
      deepest = level;
      last = i;
    });
    flush();
  }
  return out;
}

const LAW_OF_ID: [RegExp, string][] = [
  [/^lc(\d+)-\d{4}\//, 'lc'],
  [/^lei(\d+)-\d{4}\//, 'lei'],
  [/^res-cgsn(\d+)-\d{4}\//, 'res'],
  [/^dec(\d+)-\d{4}\//, 'decreto'],
  [/^dl(\d+)-\d{4}\//, 'dl'],
  [/^port-[a-z-]*?(\d+)-\d{4}\//, 'portaria'],
];

/** The paths a LegalRef holds, read with the same parser; a path without a law takes the law of the ref's id. */
function refPaths(ref: LegalRef): Path[] {
  const fromId = LAW_OF_ID.map(([re, kind]) => {
    const m = re.exec(ref.id);
    return m === null ? null : `${kind}:${m[1]}`;
  }).find((x) => x !== null);
  const own = paths(normalize(ref.label)).map((p) =>
    p.law === undefined || p.law === UNRESOLVED ? { ...p, law: fromId ?? p.law } : p,
  );
  return fromId === undefined
    ? own
    : [
        ...own,
        { law: fromId, art: undefined, par: undefined, inc: undefined, ali: undefined, raw: '' },
      ];
}

const LEVELS = ['law', 'art', 'par', 'inc', 'ali'] as const;

/** A text path is held by a ref path when every level the text names is the same in the ref. */
const holds = (r: Path, p: Path): boolean =>
  p.law !== UNRESOLVED && LEVELS.every((l) => p[l] === undefined || r[l] === p[l]);

export function citationGuard(text: string, allowedRefs: LegalRef[]): CitationGuardResult {
  const refs = allowedRefs.flatMap(refPaths).filter((r) => r.law !== UNRESOLVED);
  const outside = paths(normalize(text)).filter((p) => !refs.some((r) => holds(r, p)));
  return { ok: outside.length === 0, outsideRefs: [...new Set(outside.map((p) => p.raw))] };
}
