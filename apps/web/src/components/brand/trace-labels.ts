import { formatRatePercent, formatYearMonth } from '@/lib/format';

// Portuguese names for the engine's trace input keys (UX review H2): "Ver cálculo" and the report never show a raw
// variable name. `null` = an internal input that is not shown (e.g. the transaction ids, which open as a list).
// A key missing here fails apps/web/src/demo/snapshot.test.ts; at runtime it is hidden, never printed raw.
export const TRACE_INPUT_LABEL: Readonly<Record<string, string | null>> = {
  rbt12: 'Receita 12 meses',
  fs12: 'Folha 12 meses',
  fs12WithoutProLabore: 'Folha 12 meses sem pró-labore',
  fs12Before: 'Folha 12 meses antes',
  fs12Needed: 'Folha 12 meses necessária',
  margin: 'Folga',
  pTarget: 'Pró-labore com folga',
  argmin: 'Pró-labore de menor custo',
  currentProLabore: 'Pró-labore hoje',
  proLabore: 'Pró-labore',
  windowFrom: 'Janela (início)',
  windowTo: 'Janela (fim)',
  dasBefore: 'DAS hoje',
  candidates: 'Valores testados',
  minimumCost: 'Menor custo',
  fatorR: 'Fator R',
  anexo: 'Anexo',
  'inss.ceiling': 'Teto do INSS',
  'irpf.annual.table': 'Tabela anual do IR',
  das: 'DAS',
  inssPartner: 'INSS do sócio',
  irpfAdjustment: 'IR do ajuste anual',
  before: 'Antes',
  after: 'Depois',
  threshold: 'Mínimo para recomendar',
  firstPa: 'Primeiro período',
  dasSaved: 'DAS a menos',
  extraInss: 'INSS a mais',
  extraIr: 'IR a mais',
  paid: 'DAS pago',
  III_not_segregated: 'Anexo III sem separar',
  III_segregated: 'Anexo III separando',
  V_not_segregated: 'Anexo V sem separar',
  V_segregated: 'Anexo V separando',
  dasNotSegregated: 'DAS sem separar',
  exportRbt12: 'Receita de exportação 12 meses',
  pas: 'Períodos',
  segregated: 'DAS separando',
  federal: 'Parte federal',
  iss: 'ISS',
  measuredPas: 'Meses medidos',
  projectedPas: 'Meses projetados',
  measured: 'Medido',
  total: 'Total',
  withheld: 'IR retido',
  months: 'Meses',
  selicAnnual: 'Selic ao ano',
  count: 'Pagamentos',
  transactionIds: null,
};

/** Text inputs that hold a rate the engine already truncated for display (e.g. Fator R "0.27"). */
const RATE_TEXT_KEYS: ReadonlySet<string> = new Set(['fatorR']);

export function traceInputLabel(key: string): string | null {
  return TRACE_INPUT_LABEL[key] ?? null;
}

/** Formats a text input: the engine's display rate becomes pt-BR percent (no recomputation). */
/**
 * A value that is only months ("2025-12", "2026-10, 2026-11", or the engine's "11/2025, 12/2025"): data, shown as
 * "dez/2025" (UX review G2 M5). Months inside engine prose are left alone.
 */
const YEAR_MONTHS = /^\d{4}-(0[1-9]|1[0-2])(, \d{4}-(0[1-9]|1[0-2]))*$/;
const MONTHS_YEAR = /^(0[1-9]|1[0-2])\/\d{4}(, (0[1-9]|1[0-2])\/\d{4})*$/;

export function traceTextValue(key: string, value: string): string {
  if (RATE_TEXT_KEYS.has(key) && /^\d+(\.\d+)?$/.test(value)) return formatRatePercent(value);
  if (YEAR_MONTHS.test(value)) return value.split(', ').map(formatYearMonth).join(', ');
  if (MONTHS_YEAR.test(value))
    return value
      .split(', ')
      .map((m) => formatYearMonth(`${m.slice(3)}-${m.slice(0, 2)}`))
      .join(', ');
  return value;
}

/**
 * Engine wording cleanup for display (UX review M3): spec references are for developers, not users, and the
 * "parâmetro(s)" plural. The engine string itself stays (the AI recordings hash the trace).
 */
export function cleanEngineText(text: string): string {
  return text
    .replace(/\s*\(ENGINE-SPEC[^)]*\)/g, '')
    .replace(/\b1 parâmetro\(s\) projetado\(s\)/g, '1 parâmetro projetado')
    .replace(/\b(\d+) parâmetro\(s\) projetado\(s\)/g, '$1 parâmetros projetados');
}
