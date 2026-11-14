import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  all,
  article,
  inForceOn,
  PACKAGE_NAME,
  type Provision,
  regulation,
  regulations,
} from '../src/index.ts';

const HEX64 = /^[0-9a-f]{64}$/;
const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID =
  /^[a-z0-9-]+\/(art\d+(-[a-z])?|anexo\d+)(\/(caput|pu|p\d+(-[a-z]+)?|[ivxlc]+|res140-art\d+))*$/;
const UNIT =
  /^(art\. \d+º?(-[A-Z])?(, (caput|§ \d+º?(-[A-Z]+)?|parágrafo único|[IVXLC]+))*|Anexo [IVX]+)( \(art\. \d+ da Res\. CGSN 140\/2018\))?$/;
const REVOKED = /\(\s*revogad|^\s*revogad[oa]s?\s*[.;]?\s*$|<\s*\/?\s*(strike|s|del)\b/im;
const DRAFTING_NOTE =
  /\(\s*(Reda[çc][ãa]o dada|Inclu[ií]d[oa]|Vide |Renumerad|Produ[çc][ãa]o de efeito|Vig[êe]ncia\))/i;

const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');
const short = new Map(regulations.map((r) => [r.id, r.short]));

/** The first line of the text must open with the unit the id points to. */
function expectedOpening(p: Provision): RegExp | null {
  const last = p.id.split('/').at(-1) ?? '';
  const art = last.match(/^art(\d+)(?:-([a-z]))?$/);
  if (art) return new RegExp(`^Art\\.? ${art[1]}(º|o|\\.)?(-${(art[2] ?? '').toUpperCase()})?`);
  const par = last.match(/^p(\d+)(?:-([a-z]+))?$/);
  if (par)
    return new RegExp(`^§ ?${par[1]}(º|o)?( |\\.|-)${par[2] ? `?${par[2].toUpperCase()}` : ''}`);
  if (last === 'pu') return /^Parágrafo único/;
  if (last === 'caput') return /^Art\.? \d+/;
  if (/^[ivxlc]+$/.test(last)) return new RegExp(`^${last.toUpperCase()} [-–]`);
  if (/^anexo\d+$/.test(last)) return /^ANEXO [IVX]+$/m;
  if (/^res140-art\d+$/.test(last)) return new RegExp(`^"Art\\. ${last.split('art')[1]}\\b`);
  return null;
}

describe(PACKAGE_NAME, () => {
  const corpus = all();

  it('holds the closed list of provisions of every catalogued regulation', () => {
    expect(regulations).toHaveLength(25);
    expect(corpus).toHaveLength(111);
    for (const r of regulations)
      expect(regulation(r.id)?.provisions.length ?? 0).toBeGreaterThan(0);
    for (const p of corpus) expect(short.has(p.regulation)).toBe(true);
  });

  it('has unique ids that follow the convention of regulations.ts', () => {
    expect(new Set(corpus.map((p) => p.id)).size).toBe(corpus.length);
    expect(new Set(regulations.map((r) => r.id)).size).toBe(regulations.length);
    for (const p of corpus) {
      expect(p.id).toMatch(ID);
      expect(p.id.startsWith(`${p.regulation}/`)).toBe(true);
    }
  });

  it('stores the SHA-256 of each text and of its source page', () => {
    for (const p of corpus) {
      expect(p.hash).toMatch(HEX64);
      expect(sha256(p.text), p.id).toBe(p.hash);
      expect(p.sourceSha256).toMatch(HEX64);
    }
  });

  it('keeps one source hash, url and capture date per regulation', () => {
    for (const r of regulations) {
      const ps = regulation(r.id)?.provisions ?? [];
      expect(new Set(ps.map((p) => p.sourceSha256)).size, r.id).toBe(1);
      expect(new Set(ps.map((p) => p.url)), r.id).toEqual(new Set([r.url]));
      for (const p of ps) expect(p.capturedAt).toMatch(CIVIL_DATE);
    }
  });

  it('contains no revoked text, strike markup or drafting notes', () => {
    for (const p of corpus) {
      expect(p.text, p.id).not.toMatch(REVOKED);
      expect(p.text, p.id).not.toMatch(DRAFTING_NOTE);
      const control = [...p.text].filter((c) => c !== '\n' && (c.codePointAt(0) ?? 0) < 0x20);
      expect(control, p.id).toEqual([]);
      for (const line of p.text.split('\n')) {
        expect(line.trim(), p.id).toBe(line);
        expect(line, p.id).not.toBe('');
        expect(line, p.id).not.toMatch(/ {2}/);
      }
    }
  });

  it('labels every provision as "LC 123/2006, art. 18, § 5º-J"', () => {
    for (const p of corpus) {
      const prefix = `${short.get(p.regulation)}, `;
      expect(p.label.startsWith(prefix), p.id).toBe(true);
      expect(p.label.slice(prefix.length), p.id).toMatch(UNIT);
    }
    expect(article('lc123-2006/art18/p5-j')?.label).toBe('LC 123/2006, art. 18, § 5º-J');
    expect(article('lc123-2006/art18-a/p3/v')?.label).toBe('LC 123/2006, art. 18-A, § 3º, V');
    expect(article('lei5172-1966/art168')?.label).toBe('CTN, art. 168');
    expect(article('lei9250-1995/art16-a/caput')?.label).toBe('Lei 9.250/1995, art. 16-A, caput');
    expect(article('lei10406-2002/art50')?.label).toBe('CC, art. 50');
    expect(article('res-cgsn190-2026/art1/res140-art26')?.label).toBe(
      'Res. CGSN 190/2026, art. 1º (art. 26 da Res. CGSN 140/2018)',
    );
  });

  it('gives every provision a distinct label', () => {
    const labels = corpus.map((p) => p.label);
    expect(labels.filter((l, i) => labels.indexOf(l) !== i)).toEqual([]);
  });

  it('opens each text with the unit its id points to', () => {
    for (const p of corpus) {
      const opening = expectedOpening(p);
      expect(opening, p.id).not.toBeNull();
      expect(p.text, p.id).toMatch(opening as RegExp);
    }
  });

  it('dates a wording only when a captured provision states it', () => {
    for (const p of corpus)
      if (p.effectiveFrom !== null) expect(p.effectiveFrom).toMatch(CIVIL_DATE);
    expect(article('lei9250-1995/art3-a')?.effectiveFrom).toBe('2026-01-01');
    expect(article('lei9250-1995/art4/iii')?.effectiveFrom).toBeNull();
    expect(article('res-cgsn190-2026/art1/res140-art26')?.effectiveFrom).toBe('2027-01-01');
    expect(article('lc238-2026/art2')?.effectiveFrom).toBe('2027-01-01');
    expect(article('res-cgsn190-2026/art1/res140-art25')?.effectiveFrom).toBe('2027-01-01');
  });

  it('ends a wording only when a captured provision replaces or revokes it', () => {
    const ending = corpus.filter((p) => p.effectiveUntil !== null).map((p) => p.id);
    expect(ending.sort()).toEqual([
      'res-cgsn140-2018/art25/p3',
      'res-cgsn140-2018/art25/p4',
      'res-cgsn140-2018/art25/p4-a',
      'res-cgsn140-2018/art26',
    ]);
    for (const p of corpus) {
      if (p.effectiveUntil === null) continue;
      expect(p.effectiveUntil).toBe('2026-12-31');
      expect(p.effectiveFrom === null || p.effectiveFrom <= p.effectiveUntil).toBe(true);
    }
    expect(article('res-cgsn190-2026/art8/xvi')?.text).toBe('XVI - os §§ 4º e 4º-A do art. 25;');
    expect(article('res-cgsn190-2026/art9')?.text).toContain('a partir de 1º de janeiro de 2027');
  });

  it('tells which wording is in force on a date', () => {
    const p4 = article('res-cgsn140-2018/art25/p4') as Provision;
    const new25 = article('res-cgsn190-2026/art1/res140-art25') as Provision;
    expect(inForceOn(p4, '2026-12-31')).toBe(true);
    expect(inForceOn(p4, '2027-01-01')).toBe(false);
    expect(inForceOn(new25, '2026-12-31')).toBe(false);
    expect(inForceOn(new25, '2027-01-01')).toBe(true);
    expect(new25.text).toContain(
      '§ 4º-B. A qualificação de uma operação como exportação de serviços',
    );
  });

  it('carries the 2026 values that ENGINE-SPEC A reads from these provisions', () => {
    const text = (id: string): string => article(id)?.text ?? '';
    expect(text('lei9250-1995/art3-a')).toContain('até R$ 312,89');
    expect(text('lei9250-1995/art3-a')).toContain(
      'R$ 978,62 - (0,133145 x rendimentos tributáveis',
    );
    expect(text('lei9250-1995/art11-a')).toContain('R$ 8.429,73 - (0,095575 x rendimentos');
    expect(text('lei9250-1995/art10')).toContain('X - R$ 17.640,00');
    expect(text('lei9250-1995/art6-a')).toContain('R$ 50.000,00');
    expect(text('lc123-2006/art18/p5-j')).toContain('28% (vinte e oito por cento)');
    expect(text('lc123-2006/art18-a/p1')).toContain('R$ 81.000,00');
    expect(text('lc238-2026/art2')).toContain('R$ 110.000,00');
    expect(text('dec12797-2025/art1')).toContain('R$ 1.621,00');
    expect(text('port-mps-mf13-2026/anexo2')).toContain('de 4.354,28 até 8.475,55 | 14%');
    expect(text('lei9532-1997/art11')).toContain('12% (doze por cento)');
    expect(text('lei8212-1991/art30/p4')).toContain('quarenta e cinco por cento');
    expect(text('lei15191-2025/art2')).toContain('Acima de 4.664,68 | 27,5 | 908,73');
    expect(text('lei9249-1995/art15')).toContain(
      'III - trinta e dois por cento, para as atividades de:',
    );
    expect(text('lc214-2025/art80')).toContain(
      'fornecimento para residente ou domiciliado no exterior',
    );
  });

  it('looks provisions and regulations up by id', () => {
    expect(article('nao-existe/art1')).toBeUndefined();
    expect(regulation('nao-existe')).toBeUndefined();
    const lc123 = regulation('lc123-2006');
    expect(lc123?.short).toBe('LC 123/2006');
    expect(lc123?.provisions).toHaveLength(41);
    expect(all()).toBe(corpus);
  });
});
