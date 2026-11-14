import { z } from 'zod';
import { markSanitized } from '../fixtures/sanitization.ts';
import { getJson, requireLive } from '../http.ts';
import { fail, ok } from '../result.ts';
import type {
  CivilDate,
  ProviderContext,
  ProviderError,
  Result,
  SeriesProvider,
} from '../types.ts';

// BCB SGS (research 03 §2.6). Whitelist `sgs@1`: only `{data, valor}` per point. Daily series require
// `dataInicial`, and the API refuses windows longer than 10 years, so the period is queried in blocks.

export const SGS_WHITELIST = 'sgs@1';
export type SgsCode = Parameters<SeriesProvider['series']>[0];
export type SeriesPoint = { date: CivilDate; value: string };
type Period = { from: CivilDate; to: CivilDate };

const pointSchema = z.object({ data: z.string(), valor: z.string() });

function parseCivil(date: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const d = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== date ? null : d;
}

function toCivil(d: Date): CivilDate {
  return d.toISOString().slice(0, 10) as CivilDate;
}

function toBr(date: CivilDate): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
}

/** Splits a period into blocks of at most 10 years (the SGS limit). */
export function sgsWindows(period: Period): Period[] | null {
  const from = parseCivil(period.from);
  const to = parseCivil(period.to);
  if (!from || !to || from > to) return null;
  const windows: Period[] = [];
  let start = from;
  while (start <= to) {
    const limit = new Date(start);
    limit.setUTCFullYear(limit.getUTCFullYear() + 10);
    limit.setUTCDate(limit.getUTCDate() - 1);
    const end = limit < to ? limit : to;
    windows.push({ from: toCivil(start), to: toCivil(end) });
    start = new Date(end);
    start.setUTCDate(start.getUTCDate() + 1);
  }
  return windows;
}

/** Builds the output point by point from `{data: 'dd/mm/aaaa', valor: '13.75'}`. */
export function sanitizeSgsPoints(raw: unknown): Result<SeriesPoint[], ProviderError> {
  const parsed = z.array(pointSchema).safeParse(raw);
  if (!parsed.success) {
    return fail('UNEXPECTED_RESPONSE', 'sgs', 'Resposta inesperada do Banco Central.');
  }
  const points: SeriesPoint[] = [];
  for (const p of parsed.data) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(p.data);
    const value = p.valor.trim();
    const date = m ? `${m[3]}-${m[2]}-${m[1]}` : '';
    if (!parseCivil(date) || !/^-?\d+(\.\d+)?$/.test(value)) {
      return fail('UNEXPECTED_RESPONSE', 'sgs', 'Resposta inesperada do Banco Central.');
    }
    points.push({ date: date as CivilDate, value });
  }
  return ok(points);
}

export interface SgsSeriesOptions {
  timeoutMs?: number;
  baseUrl?: string;
}

/** Live SGS: timeout 3 s (ARCHITECTURE §4.3). */
export class SgsSeries implements SeriesProvider {
  private readonly options: SgsSeriesOptions;
  constructor(options: SgsSeriesOptions = {}) {
    this.options = options;
  }

  async series(
    code: SgsCode,
    period: Period,
    ctx: ProviderContext,
  ): Promise<Result<SeriesPoint[], ProviderError>> {
    const live = requireLive(ctx, 'sgs');
    if (!live.ok) return live;
    const windows = sgsWindows(period);
    if (!windows) {
      return fail('INVALID', 'sgs', 'Período inválido para a série do Banco Central.', {
        recoverable: false,
      });
    }
    const base = this.options.baseUrl ?? 'https://api.bcb.gov.br/dados/serie';
    const points: SeriesPoint[] = [];
    for (const w of windows) {
      const url = `${base}/bcdata.sgs.${code}/dados?formato=json&dataInicial=${toBr(w.from)}&dataFinal=${toBr(w.to)}`;
      const r = await getJson(url, ctx, {
        source: 'sgs',
        timeoutMs: this.options.timeoutMs ?? 3000,
      });
      // SGS answers 404 for a window without data; other windows may still have points.
      if (!r.ok && r.error.code === 'NOT_FOUND') continue;
      if (!r.ok) return r;
      const sanitized = sanitizeSgsPoints(r.value);
      if (!sanitized.ok) return sanitized;
      points.push(...sanitized.value);
    }
    if (points.length === 0) {
      return fail('NOT_FOUND', 'sgs', 'Sem dados da série no período.', { recoverable: false });
    }
    return ok(
      markSanitized(points, {
        whitelist: SGS_WHITELIST,
        discardedFields: [],
        replacedDocuments: 0,
      }),
    );
  }
}
