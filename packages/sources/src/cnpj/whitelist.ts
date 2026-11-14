import { z } from 'zod';
import { markSanitized } from '../fixtures/sanitization.ts';
import { stripDocuments } from '../pii/redact.ts';
import { fail, ok } from '../result.ts';
import type { CivilDate, Cnpj, ProviderError, PublicCompany, Result } from '../types.ts';

// Whitelist `cnpj@1` (ARCHITECTURE §6.2): the output is BUILT field by field from the raw response, so a
// field nobody copied never gets through. The QSA (`qsa` on BrasilAPI, `socios` on CNPJ.ws), address,
// phones, e-mail and capital are never read.

export const CNPJ_WHITELIST = 'cnpj@1';

/** Legal natures whose legal name is a person's name: 2135 EI, 2305 EIRELI, 4014 Empresa Individual Imobiliária. */
export const MASKED_LEGAL_NATURES: readonly string[] = ['2135', '2305', '4014'];
export const MASKED_LEGAL_NAME = 'Empresário individual · nome oculto';

const text = z.string().nullish();
const numberOrText = z.union([z.number(), z.string()]).nullish();

const brasilApiSchema = z.object({
  cnpj: numberOrText,
  razao_social: text,
  nome_fantasia: text,
  codigo_natureza_juridica: numberOrText,
  natureza_juridica: text,
  porte: text,
  codigo_porte: numberOrText,
  cnae_fiscal: numberOrText,
  cnae_fiscal_descricao: text,
  cnaes_secundarios: z.array(z.object({ codigo: numberOrText, descricao: text })).nullish(),
  descricao_situacao_cadastral: text,
  data_inicio_atividade: text,
  uf: text,
  codigo_municipio_ibge: numberOrText,
  opcao_pelo_simples: z.boolean().nullish(),
  data_opcao_pelo_simples: text,
  data_exclusao_do_simples: text,
  opcao_pelo_mei: z.boolean().nullish(),
  data_opcao_pelo_mei: text,
  data_exclusao_do_mei: text,
  regime_tributario: z.array(z.object({ ano: numberOrText, forma_de_tributacao: text })).nullish(),
});

const BRASILAPI_KEPT = new Set(Object.keys(brasilApiSchema.shape));

const idDescription = z.object({ id: numberOrText, descricao: text }).nullish();
const cnae = z.object({ id: numberOrText, subclasse: text, descricao: text });

const cnpjWsSchema = z.object({
  razao_social: text,
  porte: idDescription,
  natureza_juridica: idDescription,
  simples: z
    .object({
      simples: text,
      data_opcao_simples: text,
      data_exclusao_simples: text,
      mei: text,
      data_opcao_mei: text,
      data_exclusao_mei: text,
    })
    .nullish(),
  estabelecimento: z.object({
    cnpj: numberOrText,
    nome_fantasia: text,
    situacao_cadastral: text,
    data_inicio_atividade: text,
    atividade_principal: cnae.nullish(),
    atividades_secundarias: z.array(cnae).nullish(),
    estado: z.object({ sigla: text }).nullish(),
    cidade: z.object({ ibge_id: numberOrText }).nullish(),
  }),
});

const CNPJWS_KEPT = new Set([
  'razao_social',
  'porte',
  'natureza_juridica',
  'simples',
  'estabelecimento',
]);
const CNPJWS_ESTABLISHMENT_KEPT = new Set(Object.keys(cnpjWsSchema.shape.estabelecimento.shape));

// ---------- helpers ----------

function clean(value: string | null | undefined): string {
  return stripDocuments((value ?? '').trim());
}

function civilDate(value: string | null | undefined): CivilDate | null {
  const v = (value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [y, m, d] = v.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? (v as CivilDate) : null;
}

/** CNAE subclass `NNNN-N/NN` from `6201501`, `"6201-5/01"` or `"6201501"`; null for 0/empty. */
export function formatCnae(value: number | string | null | undefined): string | null {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits === '' || /^0+$/.test(digits) || digits.length > 7) return null;
  const d = digits.padStart(7, '0');
  return `${d.slice(0, 4)}-${d.slice(4, 5)}/${d.slice(5)}`;
}

function code(value: number | string | null | undefined): string {
  return String(value ?? '').trim();
}

/**
 * Opt-in block. Research 03 §2.1: the boolean rules; opt-in and exclusion dates that are equal with a
 * `false` boolean mean "never actually opted" (BrasilAPI fills them for non-optants), so both dates are
 * dropped in that case (ARCHITECTURE §6.2 says `since = null`; the exclusion date is equally meaningless).
 */
function option(
  optedIn: boolean,
  sinceRaw: string | null | undefined,
  excludedRaw: string | null | undefined,
): PublicCompany['simples'] {
  const since = civilDate(sinceRaw);
  const excludedAt = civilDate(excludedRaw);
  if (!optedIn && since !== null && since === excludedAt) {
    return { optedIn, since: null, excludedAt: null };
  }
  return { optedIn, since, excludedAt };
}

function unexpected(source: string, what: string): { ok: false; error: ProviderError } {
  return fail('UNEXPECTED_RESPONSE', source, `Resposta inesperada da fonte (${what}).`, {
    recoverable: true,
  });
}

function sameCnpj(raw: number | string | null | undefined, requested: Cnpj): boolean {
  const v = String(raw ?? '')
    .replace(/[.\-/\s]/g, '')
    .toUpperCase();
  return v === '' || v.padStart(14, '0') === requested;
}

function legalName(
  natureCode: string,
  meiOptedIn: boolean,
  razaoSocial: string | null | undefined,
  nomeFantasia: string | null | undefined,
): Pick<PublicCompany, 'displayLegalName' | 'displayTradeName' | 'masked'> {
  if (MASKED_LEGAL_NATURES.includes(natureCode) || meiOptedIn) {
    return { displayLegalName: MASKED_LEGAL_NAME, displayTradeName: null, masked: true };
  }
  const trade = clean(nomeFantasia);
  return { displayLegalName: clean(razaoSocial), displayTradeName: trade || null, masked: false };
}

function discarded(raw: Record<string, unknown>, kept: Set<string>, prefix = ''): string[] {
  return Object.keys(raw)
    .filter((k) => !kept.has(k))
    .map((k) => `${prefix}${k}`);
}

// ---------- BrasilAPI ----------

function brasilApiSize(mei: boolean, porteCode: string, porte: string): PublicCompany['size'] {
  if (mei) return 'MEI';
  const byCode: Record<string, PublicCompany['size']> = { '1': 'ME', '3': 'EPP', '5': 'OTHER' };
  const fromCode = byCode[porteCode.replace(/^0+/, '')];
  if (fromCode) return fromCode;
  const p = porte.toUpperCase();
  if (p.includes('MICRO')) return 'ME';
  if (p.includes('PEQUENO PORTE')) return 'EPP';
  if (p === 'DEMAIS') return 'OTHER';
  return 'UNKNOWN';
}

export function sanitizeBrasilApiCompany(
  raw: unknown,
  requested: Cnpj,
  fetchedAt: string,
): Result<PublicCompany, ProviderError> {
  const parsed = brasilApiSchema.safeParse(raw);
  if (!parsed.success || raw === null || typeof raw !== 'object') {
    return unexpected('brasilapi', 'formato');
  }
  const r = parsed.data;
  if (!sameCnpj(r.cnpj, requested)) return unexpected('brasilapi', 'CNPJ diferente do consultado');
  const activityStartDate = civilDate(r.data_inicio_atividade);
  const primary = formatCnae(r.cnae_fiscal);
  if (activityStartDate === null || primary === null) {
    return unexpected('brasilapi', 'campos obrigatórios ausentes');
  }
  const meiOptedIn = r.opcao_pelo_mei === true;
  const natureCode = code(r.codigo_natureza_juridica);
  const ibge = code(r.codigo_municipio_ibge);

  const company: PublicCompany = {
    cnpj: requested,
    ...legalName(natureCode, meiOptedIn, r.razao_social, r.nome_fantasia),
    legalNature: { code: natureCode, description: clean(r.natureza_juridica) },
    size: brasilApiSize(meiOptedIn, code(r.codigo_porte), clean(r.porte)),
    primaryCnae: { code: primary, description: clean(r.cnae_fiscal_descricao) },
    secondaryCnaes: (r.cnaes_secundarios ?? []).flatMap((c) => {
      const formatted = formatCnae(c.codigo);
      return formatted ? [{ code: formatted, description: clean(c.descricao) }] : [];
    }),
    registrationStatus: clean(r.descricao_situacao_cadastral).toUpperCase(),
    activityStartDate,
    uf: clean(r.uf).toUpperCase(),
    ibgeMunicipality: /^\d{7}$/.test(ibge) ? ibge : null,
    simples: option(
      r.opcao_pelo_simples === true,
      r.data_opcao_pelo_simples,
      r.data_exclusao_do_simples,
    ),
    mei: option(meiOptedIn, r.data_opcao_pelo_mei, r.data_exclusao_do_mei),
    taxRegimeHistory: (r.regime_tributario ?? []).flatMap((t) => {
      const year = Number(t.ano);
      const form = clean(t.forma_de_tributacao);
      return Number.isInteger(year) && form ? [{ year, form }] : [];
    }),
    source: 'brasilapi',
    fetchedAt,
  };
  return ok(
    markSanitized(company, {
      whitelist: CNPJ_WHITELIST,
      discardedFields: discarded(raw as Record<string, unknown>, BRASILAPI_KEPT).sort(),
      replacedDocuments: 0,
    }),
  );
}

// ---------- CNPJ.ws ----------

function yes(value: string | null | undefined): boolean {
  return (value ?? '').trim().toLowerCase() === 'sim';
}

export function sanitizeCnpjWsCompany(
  raw: unknown,
  requested: Cnpj,
  fetchedAt: string,
): Result<PublicCompany, ProviderError> {
  const parsed = cnpjWsSchema.safeParse(raw);
  if (!parsed.success || raw === null || typeof raw !== 'object') {
    return unexpected('cnpjws', 'formato');
  }
  const r = parsed.data;
  const e = r.estabelecimento;
  if (!sameCnpj(e.cnpj, requested)) return unexpected('cnpjws', 'CNPJ diferente do consultado');
  const activityStartDate = civilDate(e.data_inicio_atividade);
  const primary = formatCnae(e.atividade_principal?.subclasse ?? e.atividade_principal?.id);
  if (activityStartDate === null || primary === null) {
    return unexpected('cnpjws', 'campos obrigatórios ausentes');
  }
  const meiOptedIn = yes(r.simples?.mei);
  const natureCode = code(r.natureza_juridica?.id);
  const porteCode = code(r.porte?.id).replace(/^0+/, '');
  const size: PublicCompany['size'] = meiOptedIn
    ? 'MEI'
    : (({ '1': 'ME', '3': 'EPP', '5': 'OTHER' } as Record<string, PublicCompany['size']>)[
        porteCode
      ] ?? 'UNKNOWN');
  const ibge = code(e.cidade?.ibge_id);
  const rawEstablishment = (raw as { estabelecimento: Record<string, unknown> }).estabelecimento;

  const company: PublicCompany = {
    cnpj: requested,
    ...legalName(natureCode, meiOptedIn, r.razao_social, e.nome_fantasia),
    legalNature: { code: natureCode, description: clean(r.natureza_juridica?.descricao) },
    size,
    primaryCnae: { code: primary, description: clean(e.atividade_principal?.descricao) },
    secondaryCnaes: (e.atividades_secundarias ?? []).flatMap((c) => {
      const formatted = formatCnae(c.subclasse ?? c.id);
      return formatted ? [{ code: formatted, description: clean(c.descricao) }] : [];
    }),
    registrationStatus: clean(e.situacao_cadastral).toUpperCase(),
    activityStartDate,
    uf: clean(e.estado?.sigla).toUpperCase(),
    ibgeMunicipality: /^\d{7}$/.test(ibge) ? ibge : null,
    simples: option(
      yes(r.simples?.simples),
      r.simples?.data_opcao_simples,
      r.simples?.data_exclusao_simples,
    ),
    mei: option(meiOptedIn, r.simples?.data_opcao_mei, r.simples?.data_exclusao_mei),
    // CNPJ.ws's public API has no year-by-year tax regime.
    taxRegimeHistory: [],
    source: 'cnpjws',
    fetchedAt,
  };
  return ok(
    markSanitized(company, {
      whitelist: CNPJ_WHITELIST,
      discardedFields: [
        ...discarded(raw as Record<string, unknown>, CNPJWS_KEPT),
        ...discarded(rawEstablishment, CNPJWS_ESTABLISHMENT_KEPT, 'estabelecimento.'),
      ].sort(),
      replacedDocuments: 0,
    }),
  );
}
