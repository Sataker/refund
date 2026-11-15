// ENGINE-SPEC E.3 and E.7 patterns, applied to the normalized description (E.1.5): flag `u`, no `i`.
export const RX_DAS = /\b(DAS|PGDAS|SIMPLES ?NAC(IONAL)?|DOC(UMENTO)? ARRECAD(ACAO)? SIMPLES)\b/u;
export const RX_DAS_MEI = /\b(DAS ?MEI|PGMEI|SIMEI)\b/u;
export const RX_DARF = /\bDARF\b/u; // + revenue code: 1841, 0561, 0588, 0190
export const RX_DCTFWEB = /\bDCTF ?WEB\b|\bDARF ?NUMERADO\b/u;
export const RX_FGTS = /\b(FGTS|GRF|FGTS DIGITAL|GFD)\b/u;
export const RX_GPS = /\b(GPS|INSS)\b/u; // and NOT RX_DCTFWEB; never on a card payment (E.3)
export const RX_FX =
  /\b(CAMBIO|CONTRATO DE CAMBIO|ORDEM DE PAG(AMENTO|TO)? (DO |DE )?EXTERIOR|OP EXTERIOR|REMESSA (RECEBIDA|DO EXTERIOR)|SWIFT|WIRE)\b/u;
export const RX_FX_PLATFORMS = /\b(PAYONEER|WISE|DEEL|HUSKY|REMESSA ONLINE)\b/u; // editable list
export const RX_LOAN = /\b(EMPRESTIMO|CREDITO PESSOAL|CAPITAL DE GIRO|PRONAMPE|ANTECIPACAO)\b/u;
export const RX_PENSION = /\b(PGBL|PREVIDENCIA PRIVADA|PREV PRIVADA)\b/u;

/** DARF revenue codes (E.3): the code appears as a whole token in the description. */
export const darfCode = (description: string, code: '1841' | '0561' | '0588' | '0190'): boolean =>
  RX_DARF.test(description) && new RegExp(`\\b${code}\\b`, 'u').test(description);

/**
 * E.7 high-signal merchants. `SUPERMERC\w*` instead of the spec's `SUPERMERC\b` so the full word
 * "SUPERMERCADO" also matches (EXECUTION §9, 14/11, E3/E9 row; the truncated card form still matches).
 */
export const RX_PERSONAL =
  /\b(NETFLIX|SPOTIFY|DISNEY|HBO|MAX|PRIME VIDEO|GLOBOPLAY|DEEZER|YOUTUBE PREMIUM|APPLE\.COM\/BILL|SMART ?FIT|BLUEFIT|SUPERMERC\w*|ATACADAO|ASSAI|CARREFOUR|PAO DE ACUCAR|HORTIFRUTI)\b/u;

/** E.7 MCCs: supermarket, streaming/digital goods, clubs and gyms, schools. 5912 (pharmacy) is handled apart. */
export const PERSONAL_MCC = new Set([
  '5411',
  '4899',
  '5815',
  '5816',
  '5817',
  '5818',
  '7997',
  '8211',
  '8220',
]);
export const PHARMACY_MCC = '5912';

/** T02-11: interest on equity is not a dividend (it has its own rule), so it never enters R02. */
export const RX_JCP = /\b(JCP|JUROS S(OBRE)? ?(O )?CAP(ITAL)? PROPRIO)\b/u;

/** "PA 07/2026" / "COMP 10/2025" in a tax payment description: the accrual month it settles. */
export const RX_ACCRUAL =
  /\b(?:PA|COMP|COMPETENCIA|PER(?:IODO)?(?: DE)? APURACAO)\s*(\d{2})\/(\d{4})\b/u;
