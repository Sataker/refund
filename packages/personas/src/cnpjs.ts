import { type Cnpj, validateCnpj } from '@refund/sources';

// Synthetic alphanumeric CNPJs of the personas and of their counterparties (ARCHITECTURE §7.5):
// root `RF…` (8 characters), branch `0001`, check digits computed with the official algorithm
// (`validateCnpj`). The PII guard rejects any CNPJ in `packages/personas/data/` that is not listed
// here (ARCHITECTURE §6.4, rule 6), and `scripts/verify-persona-cnpjs.ts` confirms each one does
// not exist at the Receita (404 on BrasilAPI). Never add a real CNPJ to this list.

export interface PersonaCnpj {
  cnpj: Cnpj;
  role: string;
}

function synthetic(value: string, role: string): PersonaCnpj {
  const r = validateCnpj(value);
  if (!r.ok) throw new Error(`persona CNPJ with an invalid check digit: ${value}`);
  return { cnpj: r.value, role };
}

export const PERSONA_CNPJS = {
  devExportador: synthetic('RFDEV001000158', 'dev-exportador: Marina Dev Ltda (hero)'),
  clinicaOdonto: synthetic('RFCLIN01000134', 'clinica-odonto: second persona'),
  farmaciaBairro: synthetic('RFFARM01000194', 'farmacia-bairro: P2 persona'),
  healthPlan: synthetic('RFPLAN01000131', 'counterparty: fictitious health plan (CNAE 6550-2/00)'),
  gym: synthetic('RFACAD01000132', 'counterparty: fictitious gym (CNAE 9313-1/00)'),
} as const;

export const ALL_PERSONA_CNPJS: readonly PersonaCnpj[] = Object.values(PERSONA_CNPJS);
