import { formatRateFull, formatRatePercent, formatYearMonth } from '@/lib/format';

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
  fatorRFull: 'Fator R',
  fatorR: 'Fator R exibido no PGDAS-D (2 casas, truncado)',
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

/** Rate inputs shown with every digit (D39, PLAN §18: the Fator R as computed, never rounded). */
const FULL_RATE_KEYS: ReadonlySet<string> = new Set(['fatorRFull']);

export function traceInputLabel(key: string): string | null {
  return TRACE_INPUT_LABEL[key] ?? null;
}

/** Formats a rate input: pt-BR percent, every digit for the keys in `FULL_RATE_KEYS`. */
export function traceRateValue(key: string, value: string): string {
  return FULL_RATE_KEYS.has(key) ? formatRateFull(value) : formatRatePercent(value);
}

/**
 * A value that is only YearMonths ("2025-12", "2026-10, 2026-11"): data, shown as "dez/2025" (UX review G2 M5).
 * Engine prose already writes "dez/2025" (D45) and is left alone.
 */
const YEAR_MONTHS = /^\d{4}-(0[1-9]|1[0-2])(, \d{4}-(0[1-9]|1[0-2]))*$/;

export function traceTextValue(key: string, value: string): string {
  // Bug bash 20/11: the PGDAS-D inference that matched no hypothesis reads "não informado", not the jargon "indefinido".
  if (value === 'indefinido') return 'não informado';
  if (RATE_TEXT_KEYS.has(key) && /^\d+(\.\d+)?$/.test(value)) return formatRatePercent(value);
  if (YEAR_MONTHS.test(value)) return value.split(', ').map(formatYearMonth).join(', ');
  return value;
}
