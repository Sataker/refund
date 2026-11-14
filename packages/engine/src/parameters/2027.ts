// Parameters published for 2027 onwards (ENGINE-SPEC A.3 and A.4). Whatever has no 2027 record is answered by
// `param()` with the 2026 record and, when it is an annually published value, `projected: true` (C.1, item 4).
import { brl } from '../money.ts';
import type { AnyParameterEntry, ParameterSource } from './types.ts';

const VERIFIED = '2026-11-12' as const;

const SOURCE_URL = {
  resCgsn190: 'https://normasinternet2.receita.fazenda.gov.br/#/consulta/externa/152832',
  lc238: 'https://planalto.gov.br/ccivil_03/leis/lcp/lcp238.htm',
} as const;

const src = (regulation: string, provision: string, url: string): ParameterSource => ({
  regulation,
  provision,
  url,
});

export const PARAMETERS_2027: readonly AnyParameterEntry[] = [
  // ---------- A.3: window "12 months preceding the month before the PA" from PA 01/2027 (D4, G2) ----------
  {
    key: 'simples.fatorR.window',
    value: { startOffset: -13, endOffset: -2 },
    source: src(
      'Res. CGSN 190/2026',
      'arts. 26, I, e § 5º, IV e V, da Res. CGSN 140/2018 (art. 9º: vigência em 01/01/2027)',
      SOURCE_URL.resCgsn190,
    ),
    effectiveFrom: '2027-01',
    verifiedAt: VERIFIED,
    status: '⚠️',
    note: 'H.1 item 1: lida em cópia (normaslegais). Fallback: usar como está; conferir no DOU de 10/08/2026.',
  },
  {
    key: 'simples.rbt12.window',
    value: { startOffset: -13, endOffset: -2 },
    source: src(
      'Res. CGSN 190/2026',
      'art. 21, II, "a", da Res. CGSN 140/2018 (art. 9º: vigência em 01/01/2027)',
      SOURCE_URL.resCgsn190,
    ),
    effectiveFrom: '2027-01',
    verifiedAt: VERIFIED,
    status: '⚠️',
    note: 'H.1 item 1: lida em cópia (normaslegais). Fallback: usar como está; conferir no DOU de 10/08/2026.',
  },

  // ---------- A.4: MEI limits conditional on the LOA (LC 238/2026, art. 3º) ----------
  {
    key: 'mei.limit',
    value: { annual: brl('110.000,00'), monthlyAtStart: brl('9.166,67') },
    source: src('LC 238/2026', 'arts. 2º e 3º', SOURCE_URL.lc238),
    effectiveFrom: '2027-01',
    verifiedAt: VERIFIED,
    status: 'verified',
    dependsOnRegulation: true,
    note: 'Condicionado à renúncia de receita prevista na LOA de 2027 (G7).',
  },
  {
    key: 'mei.limit',
    value: { annual: brl('140.000,00'), monthlyAtStart: brl('11.666,67') },
    source: src('LC 238/2026', 'arts. 1º, 3º e 10, I', SOURCE_URL.lc238),
    effectiveFrom: '2028-01',
    verifiedAt: VERIFIED,
    status: 'verified',
    dependsOnRegulation: true,
    note: 'Vigência em 01/01/2028, também condicionada à LOA (2027–2029).',
  },
];
