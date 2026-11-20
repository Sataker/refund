import { z } from 'zod';
import type { CivilDate, Cnpj, PublicCompany } from '../types.ts';
import { MASKED_LEGAL_NAME, mustMaskLegalName } from './whitelist.ts';

// Shape check of an already-sanitized `PublicCompany` read back from the cache or a fixture. `strict`
// rejects any extra key: nothing outside the whitelist may come back in.

const civilDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const codeDescription = z.strictObject({ code: z.string(), description: z.string() });
const option = z.strictObject({
  optedIn: z.boolean(),
  since: civilDate.nullable(),
  excludedAt: civilDate.nullable(),
});

export const publicCompanySchema = z.strictObject({
  cnpj: z.string().regex(/^[0-9A-Z]{12}[0-9]{2}$/),
  displayLegalName: z.string(),
  displayTradeName: z.string().nullable(),
  masked: z.boolean(),
  legalNature: codeDescription,
  size: z.enum(['MEI', 'ME', 'EPP', 'OTHER', 'UNKNOWN']),
  primaryCnae: codeDescription,
  secondaryCnaes: z.array(codeDescription),
  registrationStatus: z.string(),
  activityStartDate: civilDate,
  uf: z.string(),
  ibgeMunicipality: z.string().nullable(),
  simples: option,
  mei: option,
  taxRegimeHistory: z.array(z.strictObject({ year: z.number().int(), form: z.string() })),
  source: z.enum([
    'brasilapi',
    'opencnpj',
    'cnpja',
    'minhareceita',
    'cnpjws',
    'receitaws',
    'replay',
    'persona',
  ]),
  fetchedAt: z.string(),
});

/**
 * Parses a company read back (cache, fixture) and re-applies the EI/MEI mask: the stored `masked` flag
 * is not trusted, so a row written by older or buggy code cannot leak a person's name (fails closed).
 */
export function parsePublicCompany(value: unknown): PublicCompany | null {
  const r = publicCompanySchema.safeParse(value);
  if (!r.success) return null;
  const d = r.data;
  const mask = d.masked || mustMaskLegalName(d.legalNature.code, d.mei.optedIn);
  return {
    ...d,
    ...(mask ? { displayLegalName: MASKED_LEGAL_NAME, displayTradeName: null, masked: true } : {}),
    cnpj: d.cnpj as Cnpj,
    activityStartDate: d.activityStartDate as CivilDate,
    simples: {
      ...d.simples,
      since: d.simples.since as CivilDate | null,
      excludedAt: d.simples.excludedAt as CivilDate | null,
    },
    mei: {
      ...d.mei,
      since: d.mei.since as CivilDate | null,
      excludedAt: d.mei.excludedAt as CivilDate | null,
    },
  };
}
