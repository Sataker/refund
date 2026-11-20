// Builds packages/engine/src/parameters/cnae-anexo.json: one row per CNAE 2.3 subclass (decision D50, PLAN §18;
// ENGINE-SPEC E.4). Deterministic and offline: it reads the captures (outside Git, decision D8), checks their SHA-256,
// checks that every cited provision's quote is in its capture, applies scripts/cnae-rules.ts and writes the table.
// The four rows that existed before D50 are kept byte for byte.
//
// Usage: node scripts/build-cnae-table.ts [cnaeCapturesDir] [fontesOficiaisDir]
//   cnaeCapturesDir   default: docs/conferencias/cnae-2026-11-20 (found walking up from this file)
//   fontesOficiaisDir default: docs/conferencias/fontes-oficiais (LC 123/2006 capture of 12/11/2026)
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  AMBIGUOUS,
  type AmbiguousRule,
  type Anexo,
  type AnexoAdjustment,
  COMMERCE_DIVISIONS,
  CONSTRUCTION_DIVISIONS,
  DEFAULT_AMBIGUOUS,
  DIVISION_DEFAULT,
  INDUSTRY_DOUBT,
  INDUSTRY_PREFIXES,
  MONOFASICO_E5,
  MONOFASICO_QUESTION,
  PROVISIONS,
  type ProvisionKey,
  SECTION_DEFAULT,
  VERIFIED_SERVICES,
  type VerifiedRule,
} from './cnae-rules.ts';
import { biomeFormat } from './generate-fixtures-index.ts';

export const ROOT = join(import.meta.dirname, '..');
export const TABLE_FILE = join(ROOT, 'packages/engine/src/parameters/cnae-anexo.json');

/** SHA-256 of each input, recorded in the captures' FONTE.md. A different file stops the build. */
export const INPUT_SHA256: Readonly<Record<string, string>> = {
  'ibge-cnae-subclasses.json': '787e14982265b0ffedf5f0180cbec8a2ea64d117fca459b76608ebc99dd668a7',
  'res-cgsn140-anexo-vi.txt': '5622b64984baab57f7e25303f3e5f4fa94fbcfb034956f6ca44d9291d20f8c73',
  'res-cgsn140-anexo-vii.txt': '9c908b2b2c2b084ebb2b6bd0af84c176879893967a89bd071ff545f743bddec2',
  'res140-vigente.json': '270a155a9d0b0f62fc9e1165c9eb61f411c7d463c52c833da04e4a4e031137cd',
  'lc-123-2006-planalto.md': '4b9be50796785eb69a80e0067955d694d76183ef7ea4121f6bffe64cb6e0329b',
};

/**
 * The rows of cnae-anexo.json before D50 (14/11/2026), kept exactly as they were. The fourth, dentistry (8630-5/04,
 * `to_confirm`), comes from the rules since D51 (Enzo, 20/11).
 */
export const ORIGINAL_CNAES = ['6201-5/01', '6201-5/02', '4771-7/01'] as const;

export type Status = 'verified' | 'ambiguous' | 'impeditive' | 'to_confirm';

export interface Row {
  cnae: string;
  description: string;
  baseAnexo: Anexo | null;
  subjectToFatorR: boolean;
  resellsMonofasico: boolean | 'question';
  status: Status;
  source: string;
  anexoAdjustment?: AnexoAdjustment;
  refs?: string[];
}

interface Subclass {
  cnae: string;
  description: string;
  division: string;
  section: string;
}

const sha256 = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex');
const squash = (s: string): string => s.replace(/\s+/g, '');

function findUp(rel: string): string | null {
  let dir = import.meta.dirname;
  for (;;) {
    const candidate = join(dir, rel);
    if (existsSync(candidate)) return candidate;
    const up = resolve(dir, '..');
    if (up === dir) return null;
    dir = up;
  }
}

function readChecked(dir: string, name: string): string {
  const path = join(dir, name);
  const bytes = readFileSync(path);
  const expected = INPUT_SHA256[name];
  if (expected === undefined || expected === '' || sha256(bytes) !== expected) {
    throw new Error(`${name}: SHA-256 ${sha256(bytes)} differs from the recorded ${expected}`);
  }
  return bytes.toString('utf8');
}

/** "1234567" → "1234-5/67". */
const formatCnae = (id: string): string => `${id.slice(0, 4)}-${id.slice(4, 5)}/${id.slice(5)}`;

/** IBGE descriptions are upper case; rows read in sentence case, keeping acronyms. */
const ACRONYMS = new Set([
  'GLP',
  'STFC',
  'SRTT',
  'SCM',
  'SME',
  'VOIP',
  'OSCIP',
  'UTI',
  'ECG',
  'EEG',
  'OTM',
  'TRR',
  'T.R.R.)',
  '(T.R.R.)',
  'DVDS',
  'CD',
  'CDS',
  'MDF',
  'PVC',
]);
export function sentenceCase(upper: string): string {
  const words = upper
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((w) => (ACRONYMS.has(w) ? (w === 'DVDS' ? 'DVDs' : w) : w.toLocaleLowerCase('pt-BR')));
  const text = words.join(' ');
  return text.charAt(0).toLocaleUpperCase('pt-BR') + text.slice(1);
}

export function parseSubclasses(json: string): Subclass[] {
  const raw = JSON.parse(json) as {
    id: string;
    descricao: string;
    classe: { grupo: { divisao: { id: string; secao: { id: string } } } };
  }[];
  return raw
    .map((s) => ({
      cnae: formatCnae(s.id),
      description: sentenceCase(s.descricao),
      division: s.classe.grupo.divisao.id,
      section: s.classe.grupo.divisao.secao.id,
    }))
    .sort((x, y) => (x.cnae < y.cnae ? -1 : x.cnae > y.cnae ? 1 : 0));
}

/** Subclass codes of a Res. CGSN 140 annex (text layer of the official PDF). */
export function parseAnnexCodes(text: string): Set<string> {
  return new Set([...text.matchAll(/^(\d{4}-\d\/\d{2})\b/gm)].map((m) => m[1] as string));
}

/** Text of Res. CGSN 140 in force (the Receita API's compiled view): one segment per line, tags removed. */
export function res140Text(json: string): string {
  const segments: { ordem: number; text: string }[] = [];
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) {
      for (const x of o) walk(x);
      return;
    }
    if (o === null || typeof o !== 'object') return;
    const r = o as Record<string, unknown>;
    if (
      typeof r.textoIntegra === 'string' &&
      typeof r.ordemSegmentoAto === 'number' &&
      r.idAto === 92278 &&
      r.compilado === true &&
      r.omitir === false &&
      r.tachado === false &&
      r.agendado === false
    ) {
      segments.push({ ordem: r.ordemSegmentoAto, text: r.textoIntegra });
    }
    for (const x of Object.values(r)) walk(x);
  };
  walk(JSON.parse(json));
  return segments
    .sort((x, y) => x.ordem - y.ordem)
    .map((s) =>
      s.text
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((t) => t !== '')
    .join('\n');
}

function citation(keys: readonly ProvisionKey[]): { source: string; refs: string[] } {
  const ps = keys.map((k) => PROVISIONS[k]);
  const refs = [...new Set(ps.flatMap((p) => p.refs ?? []))];
  return { source: ps.map((p) => p.label).join('; '), refs };
}

function monofasico(cnae: string): { value: boolean | 'question'; note: string } {
  if (MONOFASICO_E5.includes(cnae)) {
    return { value: true, note: 'revenda monofásica: lista ENGINE-SPEC E.5 (R06)' };
  }
  if (MONOFASICO_QUESTION.includes(cnae)) {
    return {
      value: 'question',
      note: 'revenda monofásica a confirmar com o usuário (fora da lista E.5; ENGINE-SPEC D.6 não dá padrão)',
    };
  }
  return { value: false, note: '' };
}

function verifiedRow(s: Subclass, rule: VerifiedRule, why: string): Row {
  const { source, refs } = citation(rule.provisions);
  const mono = monofasico(s.cnae);
  return {
    cnae: s.cnae,
    description: s.description,
    baseAnexo: rule.anexo,
    subjectToFatorR: rule.fatorR,
    resellsMonofasico: mono.value,
    status: 'verified',
    source: [`${source} (${why})`, mono.note].filter((x) => x !== '').join(' · '),
    ...(rule.adjustment === undefined ? {} : { anexoAdjustment: rule.adjustment }),
    ...(refs.length === 0 ? {} : { refs }),
  };
}

function ambiguousRow(s: Subclass, rule: AmbiguousRule): Row {
  const { source, refs } = citation(rule.provisions);
  const mono = monofasico(s.cnae);
  return {
    cnae: s.cnae,
    description: s.description,
    baseAnexo: null,
    subjectToFatorR: false,
    resellsMonofasico: mono.value,
    status: 'ambiguous',
    source: [`${source} (${rule.why})`, mono.note].filter((x) => x !== '').join(' · '),
    ...(refs.length === 0 ? {} : { refs }),
  };
}

const ANEXO_WHY: Record<Anexo, string> = {
  I: 'Anexo I',
  II: 'Anexo II',
  III: 'Anexo III',
  IV: 'Anexo IV',
  V: 'Anexo V',
};

function describe(rule: VerifiedRule): string {
  const base = ANEXO_WHY[rule.anexo];
  if (rule.adjustment === 'without_iss') return `${base}, sem a parcela do ISS`;
  if (rule.adjustment === 'without_iss_with_icms') {
    return `${base}, sem a parcela do ISS e com a do ICMS do Anexo I`;
  }
  if (!rule.fatorR) return base;
  return rule.anexo === 'V'
    ? 'Anexo V; Anexo III com Fator R de 28% ou mais'
    : 'Anexo III; Anexo V com Fator R abaixo de 28%';
}

/** The rule that decides one subclass, in a fixed order (the first match wins). */
export function classify(s: Subclass, vi: Set<string>, vii: Set<string>): Row {
  if (vi.has(s.cnae)) {
    const { source } = citation(['r8p1']);
    return {
      cnae: s.cnae,
      description: s.description,
      baseAnexo: null,
      subjectToFatorR: false,
      resellsMonofasico: false,
      status: 'impeditive',
      source: `${source} (código impeditivo ao Simples Nacional; LC 123/2006, art. 17)`,
    };
  }
  if (vii.has(s.cnae)) {
    return ambiguousRow(s, {
      provisions: ['r8p2'],
      why: 'código ambíguo: abrange atividade vedada e permitida; só cabe no Simples quem exerce apenas a permitida',
    });
  }
  const service = VERIFIED_SERVICES[s.cnae];
  if (service !== undefined) return verifiedRow(s, service, describe(service));
  const doubt = AMBIGUOUS[s.cnae];
  if (doubt !== undefined) return ambiguousRow(s, doubt);
  if ((COMMERCE_DIVISIONS as readonly string[]).includes(s.division)) {
    const rule: VerifiedRule = { anexo: 'I', fatorR: false, provisions: ['p4i'] };
    return verifiedRow(s, rule, 'revenda de mercadorias → Anexo I');
  }
  if ((CONSTRUCTION_DIVISIONS as readonly string[]).includes(s.division)) {
    const rule: VerifiedRule = { anexo: 'IV', fatorR: false, provisions: ['p5cI'] };
    return verifiedRow(s, rule, 'construção e obras de engenharia → Anexo IV, CPP fora do DAS');
  }
  if (s.section === 'C') {
    const upper = s.description.toLocaleUpperCase('pt-BR');
    const own = INDUSTRY_PREFIXES.some((p) => upper.startsWith(p));
    const doubtful = INDUSTRY_DOUBT.some((d) => upper.includes(d));
    if (own && !doubtful) {
      const rule: VerifiedRule = { anexo: 'II', fatorR: false, provisions: ['p4ii', 'p5'] };
      return verifiedRow(
        s,
        rule,
        'venda de mercadoria industrializada pelo contribuinte → Anexo II',
      );
    }
    return ambiguousRow(s, {
      provisions: ['p4ii', 'p5bIX', 'p4vi'],
      why: 'indústria ou serviço por conta de terceiros: Anexo II, Anexo III ou II com ISS conforme o que a empresa faz',
    });
  }
  return ambiguousRow(
    s,
    DIVISION_DEFAULT[s.division] ?? SECTION_DEFAULT[s.section] ?? DEFAULT_AMBIGUOUS,
  );
}

export interface Inputs {
  subclasses: string;
  anexoVi: string;
  anexoVii: string;
  res140: string;
  lc123: string;
}

/** Every provision quote must be in its capture: a citation without its text never reaches the table. */
export function checkQuotes(inputs: Pick<Inputs, 'res140' | 'lc123'>): void {
  const texts = { lc123: squash(inputs.lc123), res140: squash(res140Text(inputs.res140)) };
  for (const [key, p] of Object.entries(PROVISIONS)) {
    if (!texts[p.capture].includes(squash(p.quote))) {
      throw new Error(`${key} (${p.label}): quote not found in the ${p.capture} capture`);
    }
  }
}

export function buildTable(inputs: Inputs, original: readonly Row[]): Row[] {
  checkQuotes(inputs);
  const vi = parseAnnexCodes(inputs.anexoVi);
  const vii = parseAnnexCodes(inputs.anexoVii);
  const subclasses = parseSubclasses(inputs.subclasses);
  const codes = new Set(subclasses.map((s) => s.cnae));
  for (const list of [vi, vii, Object.keys(VERIFIED_SERVICES), Object.keys(AMBIGUOUS)]) {
    for (const c of list) if (!codes.has(c)) throw new Error(`${c} is not a CNAE 2.3 subclass`);
  }
  for (const c of [...MONOFASICO_E5, ...MONOFASICO_QUESTION]) {
    if (!codes.has(c)) throw new Error(`${c} is not a CNAE 2.3 subclass`);
  }
  for (const c of Object.keys(VERIFIED_SERVICES)) {
    if (c in AMBIGUOUS) throw new Error(`${c} is both verified and ambiguous`);
  }
  const kept = new Map(original.map((r) => [r.cnae, r]));
  return subclasses.map((s) => kept.get(s.cnae) ?? classify(s, vi, vii));
}

function main(): void {
  const cnaeDir = process.argv[2] ?? findUp('docs/conferencias/cnae-2026-11-20');
  const fontesDir = process.argv[3] ?? findUp('docs/conferencias/fontes-oficiais');
  if (cnaeDir === null || fontesDir === null) {
    throw new Error('captures not found: pass the CNAE captures dir and the fontes-oficiais dir');
  }
  const inputs: Inputs = {
    subclasses: readChecked(cnaeDir, 'ibge-cnae-subclasses.json'),
    anexoVi: readChecked(cnaeDir, 'res-cgsn140-anexo-vi.txt'),
    anexoVii: readChecked(cnaeDir, 'res-cgsn140-anexo-vii.txt'),
    res140: readChecked(cnaeDir, 'res140-vigente.json'),
    lc123: readChecked(fontesDir, 'lc-123-2006-planalto.md'),
  };
  const current = JSON.parse(readFileSync(TABLE_FILE, 'utf8')) as Row[];
  const original = ORIGINAL_CNAES.map((c) => {
    const row = current.find((r) => r.cnae === c);
    if (row === undefined) throw new Error(`original row ${c} missing from ${TABLE_FILE}`);
    return row;
  });
  const table = buildTable(inputs, original);
  writeFileSync(TABLE_FILE, `${JSON.stringify(table, null, 2)}\n`);
  biomeFormat([TABLE_FILE]);
  const count = (f: (r: Row) => string) =>
    table.reduce<Record<string, number>>((acc, r) => {
      acc[f(r)] = (acc[f(r)] ?? 0) + 1;
      return acc;
    }, {});
  console.log(`cnae-anexo.json: ${table.length} rows`);
  console.log(
    'status',
    count((r) => r.status),
  );
  console.log(
    'anexo',
    count((r) => String(r.baseAnexo)),
  );
  console.log(`inputs from ${dirname(join(cnaeDir, 'x'))} and ${fontesDir}`);
}

if (import.meta.main) main();
