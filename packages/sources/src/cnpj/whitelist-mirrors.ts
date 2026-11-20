import { z } from 'zod';
import { markSanitized } from '../fixtures/sanitization.ts';
import { fail, ok } from '../result.ts';
import type { CivilDate, Cnpj, ProviderError, PublicCompany, Result } from '../types.ts';
import {
  brasilApiSize,
  CNPJ_WHITELIST,
  civilDate,
  clean,
  code,
  discarded,
  formatCnae,
  legalName,
  legalNatureCode,
  numberOrText,
  option,
  sameCnpj,
  sanitizeReceitaDumpShape,
  text,
  unexpected,
} from './whitelist.ts';

// Whitelist `cnpj@1` (ARCHITECTURE §6.2) for the fallback mirrors of the Receita's open CNPJ data:
// OpenCNPJ, CNPJá (open), minhareceita.org and ReceitaWS. Same rule as whitelist.ts: each raw schema
// names only the fields we copy, and the output is built field by field. The partner lists (`QSA` on
// OpenCNPJ, `company.members` on CNPJá, `qsa` on minhareceita and ReceitaWS), address, phones, e-mails
// and capital are never read. Raw shapes checked against live answers for 00.000.000/0001-91 on 20/11/2026.

function result(
  company: PublicCompany,
  raw: Record<string, unknown>,
  kept: Set<string>,
): Result<PublicCompany, ProviderError> {
  return ok(
    markSanitized(company, {
      whitelist: CNPJ_WHITELIST,
      discardedFields: discarded(raw, kept).sort(),
      replacedDocuments: 0,
    }),
  );
}

/** 'S'/'N' flags of OpenCNPJ. */
function flag(value: string | null | undefined): boolean {
  return (value ?? '').trim().toUpperCase() === 'S';
}

/** "DD/MM/YYYY" (ReceitaWS) → civil date. */
function brDate(value: string | null | undefined): CivilDate | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((value ?? '').trim());
  return m ? civilDate(`${m[3]}-${m[2]}-${m[1]}`) : null;
}

function cnaeList(
  items: readonly { code: string | null; description: string | null | undefined }[],
) {
  return items.flatMap((c) => {
    const formatted = formatCnae(c.code);
    return formatted ? [{ code: formatted, description: clean(c.description) }] : [];
  });
}

function ibgeOrNull(value: number | string | null | undefined): string | null {
  const ibge = code(value);
  return /^\d{7}$/.test(ibge) ? ibge : null;
}

// ---------- OpenCNPJ (api.opencnpj.org) ----------

export const openCnpjSchema = z.object({
  cnpj: numberOrText,
  razao_social: text,
  nome_fantasia: text,
  situacao_cadastral: text,
  data_inicio_atividade: text,
  cnae_principal: numberOrText,
  cnaes: z
    .array(z.object({ codigo: numberOrText, descricao: text, is_principal: z.boolean().nullish() }))
    .nullish(),
  codigo_natureza_juridica: numberOrText,
  natureza_juridica: text,
  uf: text,
  porte_empresa: text,
  opcao_simples: text,
  data_opcao_simples: text,
  data_exclusao_simples: text,
  opcao_mei: text,
  data_opcao_mei: text,
  data_exclusao_mei: text,
});
const OPENCNPJ_KEPT = new Set(Object.keys(openCnpjSchema.shape));

export function sanitizeOpenCnpjCompany(
  raw: unknown,
  requested: Cnpj,
  fetchedAt: string,
): Result<PublicCompany, ProviderError> {
  const parsed = openCnpjSchema.safeParse(raw);
  if (!parsed.success || raw === null || typeof raw !== 'object') {
    return unexpected('opencnpj', 'formato');
  }
  const r = parsed.data;
  if (!sameCnpj(r.cnpj, requested)) return unexpected('opencnpj', 'CNPJ diferente do consultado');
  const activityStartDate = civilDate(r.data_inicio_atividade);
  const primary = formatCnae(r.cnae_principal);
  if (activityStartDate === null || primary === null) {
    return unexpected('opencnpj', 'campos obrigatórios ausentes');
  }
  const cnaes = (r.cnaes ?? []).map((c) => ({
    code: formatCnae(c.codigo),
    description: c.descricao,
    principal: c.is_principal === true,
  }));
  const meiOptedIn = flag(r.opcao_mei);
  const natureCode = legalNatureCode(r.codigo_natureza_juridica);
  const company: PublicCompany = {
    cnpj: requested,
    ...legalName(natureCode, meiOptedIn, r.razao_social, r.nome_fantasia),
    legalNature: { code: natureCode, description: clean(r.natureza_juridica) },
    size: brasilApiSize(meiOptedIn, '', clean(r.porte_empresa)),
    primaryCnae: {
      code: primary,
      description: clean(cnaes.find((c) => c.code === primary)?.description),
    },
    secondaryCnaes: cnaeList(cnaes.filter((c) => !c.principal && c.code !== primary)),
    registrationStatus: clean(r.situacao_cadastral).toUpperCase(),
    activityStartDate,
    uf: clean(r.uf).toUpperCase(),
    // `codigo_municipio` is the Receita's own (TOM/SIAFI) code, not IBGE: never copied as IBGE.
    ibgeMunicipality: null,
    simples: option(flag(r.opcao_simples), r.data_opcao_simples, r.data_exclusao_simples),
    mei: option(meiOptedIn, r.data_opcao_mei, r.data_exclusao_mei),
    taxRegimeHistory: [],
    source: 'opencnpj',
    fetchedAt,
  };
  return result(company, raw as Record<string, unknown>, OPENCNPJ_KEPT);
}

// ---------- CNPJá open (open.cnpja.com) ----------

const idText = z.object({ id: numberOrText, text }).nullish();
const cnpjaOption = z.object({ optant: z.boolean().nullish(), since: text }).nullish();

export const cnpjaSchema = z.object({
  taxId: numberOrText,
  alias: text,
  founded: text,
  company: z.object({
    name: text,
    nature: idText,
    size: z.object({ id: numberOrText, acronym: text, text }).nullish(),
    simples: cnpjaOption,
    simei: cnpjaOption,
  }),
  status: idText,
  address: z.object({ municipality: numberOrText, state: text }).nullish(),
  mainActivity: idText,
  sideActivities: z.array(z.object({ id: numberOrText, text })).nullish(),
});
const CNPJA_KEPT = new Set(Object.keys(cnpjaSchema.shape));

/**
 * CNPJá's open endpoint gives the opt-in flag and its start date (`since`), but no exclusion date:
 * `excludedAt` stays null. Its `history` arrays are not read (their shape is not documented for the
 * open tier and was empty in every answer we saw).
 */
export function sanitizeCnpjaCompany(
  raw: unknown,
  requested: Cnpj,
  fetchedAt: string,
): Result<PublicCompany, ProviderError> {
  const parsed = cnpjaSchema.safeParse(raw);
  if (!parsed.success || raw === null || typeof raw !== 'object') {
    return unexpected('cnpja', 'formato');
  }
  const r = parsed.data;
  if (!sameCnpj(r.taxId, requested)) return unexpected('cnpja', 'CNPJ diferente do consultado');
  const activityStartDate = civilDate(r.founded);
  const primary = formatCnae(r.mainActivity?.id);
  if (activityStartDate === null || primary === null) {
    return unexpected('cnpja', 'campos obrigatórios ausentes');
  }
  const c = r.company;
  const meiOptedIn = c.simei?.optant === true;
  const natureCode = legalNatureCode(c.nature?.id);
  const company: PublicCompany = {
    cnpj: requested,
    ...legalName(natureCode, meiOptedIn, c.name, r.alias),
    legalNature: { code: natureCode, description: clean(c.nature?.text) },
    size: brasilApiSize(meiOptedIn, code(c.size?.id), clean(c.size?.text)),
    primaryCnae: { code: primary, description: clean(r.mainActivity?.text) },
    secondaryCnaes: cnaeList(
      (r.sideActivities ?? []).map((a) => ({ code: code(a.id), description: a.text })),
    ),
    registrationStatus: clean(r.status?.text).toUpperCase(),
    activityStartDate,
    uf: clean(r.address?.state).toUpperCase(),
    ibgeMunicipality: ibgeOrNull(r.address?.municipality),
    simples: option(c.simples?.optant === true, c.simples?.since, null),
    mei: option(meiOptedIn, c.simei?.since, null),
    taxRegimeHistory: [],
    source: 'cnpja',
    fetchedAt,
  };
  return result(company, raw as Record<string, unknown>, CNPJA_KEPT);
}

// ---------- minhareceita.org ----------

/** Same JSON as BrasilAPI (see `sanitizeReceitaDumpShape`). */
export function sanitizeMinhaReceitaCompany(
  raw: unknown,
  requested: Cnpj,
  fetchedAt: string,
): Result<PublicCompany, ProviderError> {
  return sanitizeReceitaDumpShape('minhareceita', raw, requested, fetchedAt);
}

// ---------- ReceitaWS (receitaws.com.br) ----------

const receitaWsOption = z
  .object({ optante: z.boolean().nullish(), data_opcao: text, data_exclusao: text })
  .nullish();
const receitaWsCnae = z.array(z.object({ code: text, text }));

export const receitaWsSchema = z.object({
  status: text,
  message: text,
  cnpj: numberOrText,
  nome: text,
  fantasia: text,
  abertura: text,
  situacao: text,
  porte: text,
  natureza_juridica: text,
  atividade_principal: receitaWsCnae.nullish(),
  atividades_secundarias: receitaWsCnae.nullish(),
  uf: text,
  simples: receitaWsOption,
  simei: receitaWsOption,
});
const RECEITAWS_KEPT = new Set(Object.keys(receitaWsSchema.shape));

/** "203-8 - Sociedade de Economia Mista" → code "2038" and its description. */
function receitaWsNature(value: string | null | undefined): { code: string; description: string } {
  const v = clean(value);
  const m = /^([\d-]+)\s*-\s*(.*)$/.exec(v);
  return m
    ? { code: legalNatureCode(m[1]), description: m[2]?.trim() ?? '' }
    : { code: '', description: v };
}

/**
 * ReceitaWS answers HTTP 200 with `status: "ERROR"` when the CNPJ does not exist ("CNPJ rejeitado pela
 * Receita Federal", seen on 20/11/2026) and, per its docs, when the free quota is exceeded.
 */
export function sanitizeReceitaWsCompany(
  raw: unknown,
  requested: Cnpj,
  fetchedAt: string,
): Result<PublicCompany, ProviderError> {
  const parsed = receitaWsSchema.safeParse(raw);
  if (!parsed.success || raw === null || typeof raw !== 'object') {
    return unexpected('receitaws', 'formato');
  }
  const r = parsed.data;
  if ((r.status ?? '').toUpperCase() === 'ERROR') {
    const message = (r.message ?? '').toLowerCase();
    if (/rejeitad|não encontrad|nao encontrad|inválido|invalido/.test(message)) {
      return fail('NOT_FOUND', 'receitaws', 'Não encontrado na fonte.');
    }
    if (/too many|limite|excedid/.test(message)) {
      return fail('RATE_LIMITED', 'receitaws', 'Limite de consultas da fonte atingido.');
    }
    return unexpected('receitaws', 'erro da fonte');
  }
  if (!sameCnpj(r.cnpj, requested)) return unexpected('receitaws', 'CNPJ diferente do consultado');
  const activityStartDate = brDate(r.abertura);
  const main = r.atividade_principal?.[0];
  const primary = formatCnae(main?.code);
  if (activityStartDate === null || primary === null) {
    return unexpected('receitaws', 'campos obrigatórios ausentes');
  }
  const meiOptedIn = r.simei?.optante === true;
  const nature = receitaWsNature(r.natureza_juridica);
  const company: PublicCompany = {
    cnpj: requested,
    ...legalName(nature.code, meiOptedIn, r.nome, r.fantasia),
    legalNature: nature,
    size: brasilApiSize(meiOptedIn, '', clean(r.porte)),
    primaryCnae: { code: primary, description: clean(main?.text) },
    secondaryCnaes: cnaeList(
      (r.atividades_secundarias ?? []).map((a) => ({ code: a.code ?? '', description: a.text })),
    ),
    registrationStatus: clean(r.situacao).toUpperCase(),
    activityStartDate,
    uf: clean(r.uf).toUpperCase(),
    ibgeMunicipality: null,
    simples: option(
      r.simples?.optante === true,
      brDate(r.simples?.data_opcao),
      brDate(r.simples?.data_exclusao),
    ),
    mei: option(meiOptedIn, brDate(r.simei?.data_opcao), brDate(r.simei?.data_exclusao)),
    taxRegimeHistory: [],
    source: 'receitaws',
    fetchedAt,
  };
  return result(company, raw as Record<string, unknown>, RECEITAWS_KEPT);
}
