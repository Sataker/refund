// E8b: procedure excerpts cited by the C.12 action plan (ENGINE-SPEC C.12, rule 2). Every line is a verbatim passage
// of a capture listed in research 08 §12, and the capture still hashes to the recorded SHA-256.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { all, allProcedures, type Procedure, procedure } from '../src/index.ts';
import { CAPTURE_SHA256, CAPTURES, sha256Bytes, squash } from './captures.ts';

const ID = /^[a-z0-9.-]+(#[a-z0-9.-]+)?$/;
const procedures = allProcedures();

describe('procedure excerpts (@refund/law)', () => {
  it('holds the closed list of excerpts with unique ids that never collide with a provision', () => {
    expect(procedures).toHaveLength(40);
    const ids = procedures.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const provisions = new Set(all().map((p) => p.id));
    for (const p of procedures) {
      expect(p.id).toMatch(ID);
      expect(p.kind).toBe('procedure');
      expect(provisions.has(p.id)).toBe(false);
    }
  });

  it('stores the SHA-256 of each text, and each capture hash is the one research 08 §12 recorded', () => {
    for (const p of procedures) {
      expect(sha256Bytes(p.text), p.id).toBe(p.hash);
      expect(CAPTURE_SHA256[p.captureFile], p.id).toBe(p.sourceSha256);
      // 12/11 captures, except the PGDAS-D manual recaptured on 16/11 (version of 13/11/2026; source audit S4).
      expect(p.capturedAt).toBe(
        p.captureFile === 'pgdas-2026-11-13.pdf' ? '2026-11-16' : '2026-11-12',
      );
      expect(p.url).toMatch(
        /^https:\/\/(www8?\.receita\.fazenda\.gov\.br|www\.gov\.br|prefeitura\.sp\.gov\.br)\//,
      );
    }
  });

  it('keeps one url and hash per capture file', () => {
    const byFile = new Map<string, Procedure[]>();
    for (const p of procedures)
      byFile.set(p.captureFile, [...(byFile.get(p.captureFile) ?? []), p]);
    for (const [file, ps] of byFile) {
      expect(new Set(ps.map((p) => p.url)).size, file).toBe(1);
      expect(new Set(ps.map((p) => p.sourceSha256)).size, file).toBe(1);
      expect(new Set(ps.map((p) => p.textFile)).size, file).toBe(1);
    }
  });

  it('has clean lines: no empty line, no double space, no surrounding blanks', () => {
    for (const p of procedures) {
      for (const line of p.text.split('\n')) {
        expect(line, p.id).not.toBe('');
        expect(line.trim(), p.id).toBe(line);
        expect(line, p.id).not.toMatch(/ {2}/);
      }
    }
  });

  it.skipIf(CAPTURES === null)(
    'finds every line verbatim in its capture text, and the capture file still hashes to sourceSha256',
    () => {
      const dir = CAPTURES as string;
      const texts = new Map<string, string>();
      for (const p of procedures) {
        expect(sha256Bytes(readFileSync(join(dir, p.captureFile))), p.captureFile).toBe(
          p.sourceSha256,
        );
        const haystack =
          texts.get(p.textFile) ?? squash(readFileSync(join(dir, p.textFile), 'utf8'));
        texts.set(p.textFile, haystack);
        for (const line of p.text.split('\n')) {
          expect(haystack.includes(squash(line)), `${p.id}: ${line}`).toBe(true);
        }
      }
    },
  );

  it('looks excerpts up by id', () => {
    expect(procedure('manual-restituicao-sn-2025-10-20#3.1.1')?.text).toContain(
      'Apenas Chave = CNPJ poderão ser utilizadas para recebimento da restituição.',
    );
    expect(procedure('rfb-pr-altas-rendas-2025-12-19#q4')?.text).toContain(
      'poderá ser restituído ao contribuinte',
    );
    expect(procedure('manual-pgdas-d#6.10.1')?.text).toContain('em até 5 dias úteis');
    // D54: the goods-export excerpts the R05 goods plan cites.
    expect(procedure('manual-pgdas-d#1.5')?.text).toContain(
      'revenda (comércio) de mercadorias para o exterior do país',
    );
    expect(procedure('manual-pgdas-d#6.5-mercadorias')?.text).toContain(
      '4 - Venda de mercadorias industrializadas pelo contribuinte para o exterior',
    );
    expect(procedure('manual-pgdas-d#9.4.3.1')?.text).toContain('comercial exportadora');
    expect(procedure('nao-existe')).toBeUndefined();
  });
});
