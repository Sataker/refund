import type { NcmRegime } from '../types.ts';
import table from './table-4.3.10.json' with { type: 'json' };

// Monofásico PIS/Cofins by NCM (research 03 §2.7): frozen copy of EFD-Contribuições table 4.3.10
// v1.25 (30/03/2026), source and SHA-256 of the downloaded file in `table-4.3.10.json#source`.
// Longest-prefix match; explicit exceptions of the law (e.g. 3003.90.56) are rows with
// `monofasico: false`, so the longer prefix wins.

export interface NcmRow {
  prefix: string;
  monofasico: boolean;
  code: string;
  group: string;
  description: string;
  law: string;
  note?: string;
}

export const NCM_TABLE_SOURCE = table.source;
export const NCM_ROWS: readonly NcmRow[] = table.rows;

const NONE: NcmRegime = { monofasico: false, law: null, prefix: null };

/** `ncm` with or without dots (`3004.90.99` or `30049099`), 2 to 8 digits. */
export function ncmRegime(ncm: string): NcmRegime {
  const digits = ncm.replace(/[.\s]/g, '');
  if (!/^\d{2,8}$/.test(digits)) return NONE;
  let best: NcmRow | undefined;
  for (const row of NCM_ROWS) {
    if (digits.startsWith(row.prefix) && row.prefix.length > (best?.prefix.length ?? 0)) best = row;
  }
  return best ? { monofasico: best.monofasico, law: best.law, prefix: best.prefix } : NONE;
}
