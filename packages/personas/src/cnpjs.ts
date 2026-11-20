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

/**
 * Synthetic CNPJs that belong to no persona but appear in code and tests (compliance review G2 M2): the Lucro
 * Presumido company and the unsupported-activity company of the live track
 * (`apps/web/src/server/company/replay-companies.ts`), the "not found" CNPJ of
 * the E11 tests and the second payer of the engine's same-holder test. `verify-persona-cnpjs.ts` checks them too.
 */
export const OTHER_SYNTHETIC_CNPJS: readonly PersonaCnpj[] = [
  synthetic('RFPRES01000137', 'no persona: Lucro Presumido company of the live track (replay)'),
  synthetic(
    'RFCOSM01000136',
    'no persona: Simples company with an ambiguous CNAE, beer wholesale (replay)',
  ),
  synthetic('RFNONE01000122', 'no persona: "not found" CNPJ of the live-track tests'),
  synthetic('RFBAIX01000136', 'no persona: closed (baixada) company of the live track (replay)'),
  synthetic('RFINAP01000143', 'no persona: inapta company of the live track (replay)'),
  synthetic('RFSUSP01000170', 'no persona: suspensa company of the live track (replay)'),
  synthetic('RFMEIS01000128', 'no persona: MEI of the live track (replay)'),
  synthetic(
    'RFLOJA01000103',
    'no persona: Simples cosmetics shop of the live track, runs the sample statements (replay)',
  ),
  synthetic('RFDEV002000100', 'no persona: second payer in the engine same-holder test'),
];

/** Every synthetic CNPJ the repository uses: the one list `scripts/verify-persona-cnpjs.ts` checks. */
export const ALL_SYNTHETIC_CNPJS: readonly PersonaCnpj[] = [
  ...ALL_PERSONA_CNPJS,
  ...OTHER_SYNTHETIC_CNPJS,
];
