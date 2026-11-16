// The official-source captures (docs/conferencias/fontes-oficiais/) stay outside Git (decision D8): these helpers find
// them on Enzo's disk, from the main checkout or from a worktree under it. In CI they are absent and only the
// hash table below is checked; locally the texts are matched against the files themselves.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** SHA-256 of each capture file, as recorded in docs/pesquisa/08-como-receber.md §12 (capture of 12/11/2026). */
export const CAPTURE_SHA256: Readonly<Record<string, string>> = {
  'manual-restituicao-simples.pdf':
    '74ae352b145fa48f034d51be7ade731a6cd0fcba3b226b9bed93a3952bd12db2',
  'pgdas.pdf': 'e73b2bfc7eded9e419ddd5c516cf37cc49a78540fcd79faf4d84b77988f3f316',
  // Recaptured on 16/11 (version of 13/11/2026, for PA 2018–2026): pgdas-2026-11-13.FONTE.md.
  'pgdas-2026-11-13.pdf': '1786a9badcd6676567b8a2ce27c6f11466b3abaf1ea1330a27eef31ec013119f',
  'res-cgsn-140-2018-compilada.md':
    '714a13d5a11eea013f3b9cfc76da06ae43691a09c2837a9df3003ba6e8c4ab3c',
  'lc-123-2006-planalto.md': '4b9be50796785eb69a80e0067955d694d76183ef7ea4121f6bffe64cb6e0329b',
  'ctn-planalto.md': '410707c773eb0decd180e06e6ab6e5126f62d7c5b991f0c422ecea6663a5e15e',
  'perguntao-simples-nacional-2026-10-09.pdf':
    '08667b6c34527f12bce5db5391b377e3ed84f8dff6ba37b142427bb05a50d73f',
  'portal-simples-restituicao-compensacao.md':
    'dbf7b3b85d54ce9a9ef247b7bf3482ab10d6fc4d56a310420a639f3249620e28',
  'sp-restituicao-iss.md': 'be344d480052063fd0ed1d6844bbd691b3361bf44673732d90aa5907e5d6b9aa',
  'sp-in-sf-surem-10-2019.md': 'b9b9d1bd12b9bb0b5a001c4153dcf54d68fa8589084c27ca999e48b9c5ce6120',
  'sp-manual-sav-2.15-extrato.md':
    '459efa228409845e837e35dd4b90aa4707a709135850d03ba69b34bde7e79526',
  'rfb-autorizacoes-de-acesso-guia.md':
    'f36cc814048e002d0a7b335b8dab55bf0f265381e06e2a7fde54f6afb2db6bc9',
  'esocial-mos-s-1.3-extrato.md':
    '72fa1e590925759dadb8107432c35148f93a1d4a517a9f3676e64f39c9b5aa29',
  'rfb-noticia-prazo-dctfweb.md':
    '748740f24c59134104bac80d4a04bb4139b60faf93ec99319c14ae723b068eec',
  'rfb-pr-irpf-2026-extrato.md': '721038645d4de73786f1bcc72a096646305d02cba85e8d1f9517638a5aceed62',
  'rfb-noticia-irpf-2026.md': '8360d0ead67e0f1d73d0dcbb8e192d43b9a0122e2ab6b4997b9e01c207f64132',
  'pr.pdf': '51712e390f090521d07a0013c0dec041981e160b1b638ae92888fa278c3a7b44',
};

function findCaptures(): string | null {
  const fromEnv = process.env.REFUND_CAPTURES_DIR;
  if (fromEnv !== undefined && fromEnv !== '') return existsSync(fromEnv) ? fromEnv : null;
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const candidate = join(dir, 'docs', 'conferencias', 'fontes-oficiais');
    if (existsSync(candidate)) return candidate;
    const up = resolve(dir, '..');
    if (up === dir) return null;
    dir = up;
  }
}

/** Absolute path of the captures folder, or null when it is not on this machine (CI). */
export const CAPTURES: string | null = findCaptures();

export const sha256Bytes = (b: Buffer | string): string =>
  createHash('sha256').update(b).digest('hex');

/**
 * Text compared for "verbatim": whitespace removed (PDF extraction breaks lines and words), markdown bold and backslash
 * escapes of the markdown captures removed. PDF texts are the PDF text layer (Apple PDFKit). Nothing else is normalized: letters, accents and punctuation must match.
 */
export const squash = (s: string): string =>
  s
    .replace(/\\(?=[^\s\w])/g, '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, '');

/** Provisions grouped by their capture file (those transcribed from fontes-oficiais). */
export function byCapture<T extends { captureFile?: string }>(ps: readonly T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const p of ps) {
    if (p.captureFile === undefined) continue;
    groups.set(p.captureFile, [...(groups.get(p.captureFile) ?? []), p]);
  }
  return [...groups.values()];
}
