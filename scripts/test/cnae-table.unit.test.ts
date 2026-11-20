// D50 (PLAN §18): the CNAE → Simples anexo table covers every CNAE 2.3 subclass, and every row is traceable to its
// provision (ENGINE-SPEC E.4; CLAUDE.md rules 3 and 12). The captures stay outside Git (D8): in CI only the pinned
// hashes and the committed table are checked; on Enzo's disk the generator is rerun and must reproduce the file.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CNAE_ANEXO, CNAE_IN_SCOPE, cnaeInScope } from '../../packages/engine/src/index.ts';
import { article } from '../../packages/law/src/index.ts';
import {
  buildTable,
  INPUT_SHA256,
  ORIGINAL_CNAES,
  parseSubclasses,
  type Row,
} from '../build-cnae-table.ts';
import { AMBIGUOUS, PROVISIONS, VERIFIED_SERVICES } from '../cnae-rules.ts';

const rows = CNAE_ANEXO as readonly Row[];
const byCnae = new Map(rows.map((r) => [r.cnae, r]));

/** SHA-256 of the sorted IBGE subclass codes (CNAE 2.3, servicodados.ibge.gov.br, 20/11/2026), one per line. */
const IBGE_CODES_SHA256 = '70eed7d582c501444ede33f14fc04212873c7fb5e369da6eccd88253d762a336';
const IBGE_SUBCLASSES = 1332;

/** The rows of cnae-anexo.json before D50 (14/11/2026), byte for byte (dentistry left this list with D51). */
const ORIGINAL_ROWS = [
  {
    cnae: '6201-5/01',
    description: 'Desenvolvimento de programas de computador sob encomenda',
    baseAnexo: 'III',
    subjectToFatorR: true,
    resellsMonofasico: false,
    status: 'verified',
    source:
      'LC 123/2006, art. 18, § 5º-D, IV (elaboração de programas de computadores → Anexo III) e § 5º-M, II (Fator R < 28% → Anexo V); texto em @refund/law lc123-2006/art18/p5-d e p5-m, verificado em 2026-11-14',
  },
  {
    cnae: '6201-5/02',
    description: 'Web design',
    baseAnexo: 'III',
    subjectToFatorR: true,
    resellsMonofasico: false,
    status: 'verified',
    source:
      'LC 123/2006, art. 18, § 5º-D, VI (planejamento, confecção, manutenção e atualização de páginas eletrônicas → Anexo III) e § 5º-M, II (Fator R < 28% → Anexo V); texto em @refund/law lc123-2006/art18/p5-d e p5-m, verificado em 2026-11-14',
  },
  {
    cnae: '4771-7/01',
    description: 'Comércio varejista de produtos farmacêuticos, sem manipulação de fórmulas',
    baseAnexo: 'I',
    subjectToFatorR: false,
    resellsMonofasico: true,
    status: 'verified',
    source:
      'Revenda de mercadorias → Anexo I (LC 123/2006, art. 18, § 4º, I; ENGINE-SPEC E.4); revenda monofásica de medicamentos (Lei 10.147/2000, arts. 1º e 2º; LC 123, art. 18, § 4º-A, I; ENGINE-SPEC E.5)',
  },
];

/** Commerce subclasses (divisions 45–47) that are NOT Anexo I, each for the reason in `source`. */
const COMMERCE_EXCEPTIONS: Readonly<Record<string, string>> = {
  // Services: § 5º-B, IX (repair and maintenance) → Anexo III.
  '4520-0/01': 'III',
  '4520-0/02': 'III',
  '4520-0/03': 'III',
  '4520-0/04': 'III',
  '4520-0/06': 'III',
  '4520-0/07': 'III',
  '4543-9/00': 'III',
  // Commercial representation: § 5º-I, VII → Anexo V (Fator R).
  '4512-9/01': 'V',
  '4530-7/06': 'V',
  '4542-1/01': 'V',
  '4611-7/00': 'V',
  '4612-5/00': 'V',
  '4613-3/00': 'V',
  '4614-1/00': 'V',
  '4615-0/00': 'V',
  '4616-8/00': 'V',
  '4617-6/00': 'V',
  '4618-4/01': 'V',
  '4618-4/02': 'V',
  '4618-4/03': 'V',
  '4618-4/99': 'V',
  '4619-2/00': 'V',
  // Ambiguous: consignment (Res. 140, art. 25, § 16), fractioning (§ 4º, I × II), compounding pharmacy (§ 4º, VII),
  // cartridge refill, washing and upholstery, Res. CGSN 140 Anexo VII.
  '4512-9/02': 'ambiguous',
  '4542-1/02': 'ambiguous',
  '4623-1/08': 'ambiguous',
  '4632-0/03': 'ambiguous',
  '4639-7/02': 'ambiguous',
  '4649-4/09': 'ambiguous',
  '4771-7/02': 'ambiguous',
  '4771-7/03': 'ambiguous',
  '4751-2/02': 'ambiguous',
  '4520-0/05': 'ambiguous',
  '4520-0/08': 'ambiguous',
  '4635-4/02': 'ambiguous',
  '4635-4/03': 'ambiguous',
  '4635-4/99': 'ambiguous',
  '4684-2/99': 'ambiguous',
  // Tax audit of 20/11: firearms wholesale in the IBGE notes (art. 17, X, "a"); compounded veterinary products
  // (§ 4º, VII); fractioning and repacking of own products (§ 4º, II).
  '4649-4/99': 'ambiguous',
  '4669-9/99': 'ambiguous',
  '4771-7/04': 'ambiguous',
  '4644-3/01': 'ambiguous',
  '4644-3/02': 'ambiguous',
  // Res. CGSN 140, Anexo VI (LC 123, art. 17, X, "a").
  '4636-2/02': 'impeditive',
};

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
const CNAE_CAPTURES =
  process.env.REFUND_CNAE_CAPTURES ?? findUp('docs/conferencias/cnae-2026-11-20');
const FONTES = process.env.REFUND_CAPTURES_DIR ?? findUp('docs/conferencias/fontes-oficiais');
const capturesHere =
  CNAE_CAPTURES !== null &&
  FONTES !== null &&
  existsSync(join(CNAE_CAPTURES, 'ibge-cnae-subclasses.json')) &&
  existsSync(join(FONTES, 'lc-123-2006-planalto.md'));

describe('D50: cnae-anexo.json covers every CNAE 2.3 subclass', () => {
  it('one row per subclass: 1.332 unique codes whose list hashes to the IBGE capture', () => {
    expect(rows).toHaveLength(IBGE_SUBCLASSES);
    expect(byCnae.size).toBe(IBGE_SUBCLASSES);
    for (const r of rows) expect(r.cnae).toMatch(/^\d{4}-\d\/\d{2}$/);
    const codes = rows.map((r) => r.cnae);
    expect(codes).toEqual([...codes].sort());
    expect(createHash('sha256').update(codes.join('\n')).digest('hex')).toBe(IBGE_CODES_SHA256);
  });

  it('the rows that existed before D50 are unchanged; dentistry is verified since D51', () => {
    expect(ORIGINAL_CNAES).toEqual(ORIGINAL_ROWS.map((r) => r.cnae));
    for (const original of ORIGINAL_ROWS) expect(byCnae.get(original.cnae)).toEqual(original);
    expect(byCnae.get('8630-5/04')).toMatchObject({
      baseAnexo: 'III',
      subjectToFatorR: true,
      status: 'verified',
      source: expect.stringMatching(
        /^LC 123\/2006, art\. 18, § 5º-B, XX; .*§ 5º-M, I; Res\. CGSN 140\/2018, art\. 25, § 1º, V, "n"/,
      ),
    });
    expect(rows.filter((r) => r.status === 'to_confirm')).toEqual([]);
  });

  it('statuses and anexos are consistent: verified rows have an anexo; the others have none', () => {
    for (const r of rows) {
      if (ORIGINAL_CNAES.includes(r.cnae as (typeof ORIGINAL_CNAES)[number])) continue;
      expect(['verified', 'ambiguous', 'impeditive']).toContain(r.status);
      if (r.status === 'verified') expect(r.baseAnexo).not.toBeNull();
      else expect(r.baseAnexo).toBeNull();
      if (r.subjectToFatorR) expect(['III', 'V']).toContain(r.baseAnexo);
      if (r.anexoAdjustment !== undefined) expect(r.baseAnexo).toBe('III');
    }
  });

  it('every verified row cites a provision of the rules, and its @refund/law refs resolve', () => {
    const labels = Object.values(PROVISIONS).map((p) => p.label);
    for (const r of rows) {
      if (ORIGINAL_CNAES.includes(r.cnae as (typeof ORIGINAL_CNAES)[number])) continue;
      expect(r.source.trim()).not.toBe('');
      expect(labels.some((l) => r.source.startsWith(l))).toBe(true);
      for (const id of r.refs ?? []) expect(article(id), `${r.cnae} → ${id}`).toBeDefined();
      // Where the corpus has the provision, the row carries its id (CLAUDE.md rule 3).
      for (const p of Object.values(PROVISIONS)) {
        if (!r.source.includes(`${p.label};`) && !r.source.includes(`${p.label} (`)) continue;
        for (const id of p.refs ?? [])
          expect(r.refs ?? [], `${r.cnae} cites ${p.label}`).toContain(id);
      }
    }
  });

  it('commerce (divisions 45–47) is Anexo I, except the services, representatives and doubts the law gives', () => {
    for (const r of rows) {
      if (!/^4[5-7]/.test(r.cnae)) continue;
      const exception = COMMERCE_EXCEPTIONS[r.cnae];
      if (exception === undefined) {
        expect({ cnae: r.cnae, status: r.status, anexo: r.baseAnexo }).toEqual({
          cnae: r.cnae,
          status: 'verified',
          anexo: 'I',
        });
        expect(r.subjectToFatorR).toBe(false);
      } else if (exception === 'ambiguous' || exception === 'impeditive') {
        expect(r.status, r.cnae).toBe(exception);
      } else {
        expect([r.cnae, r.status, r.baseAnexo]).toEqual([r.cnae, 'verified', exception]);
      }
    }
  });

  it('Res. CGSN 140 annexes: Anexo VI codes are impeditive, Anexo VII codes ambiguous (101 and 22 codes)', () => {
    expect(rows.filter((r) => r.status === 'impeditive')).toHaveLength(101);
    for (const c of ['1220-4/01', '6421-2/00', '7820-5/00', '8299-7/04', '9900-8/00']) {
      expect(byCnae.get(c)?.status).toBe('impeditive');
    }
    for (const c of ['1113-5/02', '4924-8/00', '6619-3/02', '8299-7/99']) {
      expect(byCnae.get(c)?.status).toBe('ambiguous');
      expect(byCnae.get(c)?.source).toMatch(/^Res\. CGSN 140\/2018, art\. 8º, § 2º, e Anexo VII/);
    }
  });

  it('monofásico: true exactly on the E.5 list; "question" only on commerce rows', () => {
    const yes = rows.filter((r) => r.resellsMonofasico === true).map((r) => r.cnae);
    expect(yes.sort()).toEqual(
      [
        '4530-7/03',
        '4530-7/05',
        '4711-3/01',
        '4711-3/02',
        '4712-1/00',
        '4731-8/00',
        '4771-7/01',
        '4771-7/02',
        '4771-7/03',
        '4772-5/00',
      ].sort(),
    );
    for (const r of rows.filter((x) => x.resellsMonofasico === 'question')) {
      expect(r.cnae).toMatch(/^4[5-7]/);
    }
    expect(byCnae.get('4723-7/00')?.resellsMonofasico).toBe('question');
    expect(byCnae.get('4661-3/00')?.resellsMonofasico).toBe('question');
    expect(byCnae.get('4662-1/00')?.resellsMonofasico).toBe('question');
    // Tabacaria: ICMS-ST is not R06's monofásico case (D.6); open in EXECUTION §9.
    expect(byCnae.get('4729-6/01')?.resellsMonofasico).toBe(false);
  });

  it('scope (C.11.5 item 4): verified, any anexo (II and IV since D52), plain table; everything else is out', () => {
    for (const r of rows) {
      const inScope =
        r.status === 'verified' && r.baseAnexo !== null && r.anexoAdjustment === undefined;
      expect(cnaeInScope(r.cnae), r.cnae).toBe(inScope);
    }
    // 316 until D52 (I 183 + III 89 + V 44) + II 284 + IV 34.
    expect(CNAE_IN_SCOPE.length).toBe(634);
    expect(cnaeInScope('8630-5/04')).toBe(true); // D51
    expect(cnaeInScope('7711-0/00')).toBe(false); // § 4º, V: Anexo III without the ISS share
    expect(cnaeInScope('6110-8/01')).toBe(false); // § 5º-E: Anexo III without ISS, with ICMS
  });

  it('rules name each code once and only CNAE 2.3 codes', () => {
    for (const c of Object.keys(VERIFIED_SERVICES)) {
      expect(byCnae.has(c), c).toBe(true);
      expect(c in AMBIGUOUS, c).toBe(false);
    }
    for (const c of Object.keys(AMBIGUOUS)) expect(byCnae.has(c), c).toBe(true);
  });

  it('pins the SHA-256 of every input (FONTE.md of the captures)', () => {
    for (const [file, sha] of Object.entries(INPUT_SHA256))
      expect(sha, file).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe.skipIf(!capturesHere)('D50: the generator reproduces the table from the captures', () => {
  it('rerun over the captures gives the committed file, row for row', () => {
    const dir = CNAE_CAPTURES as string;
    const read = (path: string, name: string) => {
      const bytes = readFileSync(join(path, name));
      expect(createHash('sha256').update(bytes).digest('hex'), name).toBe(INPUT_SHA256[name]);
      return bytes.toString('utf8');
    };
    const inputs = {
      subclasses: read(dir, 'ibge-cnae-subclasses.json'),
      anexoVi: read(dir, 'res-cgsn140-anexo-vi.txt'),
      anexoVii: read(dir, 'res-cgsn140-anexo-vii.txt'),
      res140: read(dir, 'res140-vigente.json'),
      lc123: read(FONTES as string, 'lc-123-2006-planalto.md'),
    };
    expect(parseSubclasses(inputs.subclasses)).toHaveLength(IBGE_SUBCLASSES);
    const original = ORIGINAL_ROWS as Row[];
    expect(buildTable(inputs, original)).toEqual(rows);
  });
});
