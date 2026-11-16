import 'server-only';
import {
  cnaeAnexoRow,
  estimateByProfile,
  type ProfileAnswers,
  type ProfileEstimate,
  type PublicProfile,
} from '@refund/engine';
import type { PublicCompany } from '@refund/sources';
import { ABROAD_VALUES, answersKey, EMPLOYEE_VALUES, REVENUE_VALUES } from './answers.ts';
import type { DemoPersona } from './catalog.ts';

// Screen 1 estimate on /demo (ARCHITECTURE §4.2 "Usage rules"; ENGINE-SPEC C.11.8 "Performance"): the
// persona's page computes AT BUILD TIME every answer combination for its CNPJ (8 × 3 × 4 = 96) and the
// browser only picks the row. Nothing of the engine runs in the browser and nothing goes over the network.

/** ARCHITECTURE §4.2: the web builds the PublicProfile from the whitelisted company (same as E11's live path). */
export function toPublicProfile(company: PublicCompany): PublicProfile {
  return {
    cnpj: company.cnpj,
    primaryCnae: company.primaryCnae.code,
    isActive: company.registrationStatus.trim().toUpperCase() === 'ATIVA',
    optedIntoSimples: company.simples.optedIn,
    optedIntoMei: company.mei.optedIn,
    size: company.size,
    activityStartDate: company.activityStartDate,
    uf: company.uf,
  };
}

export interface ProfileQuestions {
  employees: boolean;
  abroad: boolean;
}

/** ENGINE-SPEC C.11.1: "funcionários?" only if the CNAE is subject to the Fator R; "exterior?" to every in-scope opt-in. */
export function profileQuestions(company: PublicCompany): ProfileQuestions {
  const p = toPublicProfile(company);
  const row = cnaeAnexoRow(p.primaryCnae);
  const inScope =
    p.isActive &&
    !p.optedIntoMei &&
    p.optedIntoSimples &&
    row !== undefined &&
    row.status === 'verified' &&
    row.baseAnexo !== 'II' &&
    row.baseAnexo !== 'IV';
  return { employees: inScope && row.subjectToFatorR, abroad: inScope };
}

export interface EstimateTable {
  /** Distinct estimates (many combinations share one, e.g. every "não sei" on revenue). */
  variants: { id: string; estimate: ProfileEstimate }[];
  /** answersKey(answers) → variant id, for all 96 combinations. */
  index: Record<string, string>;
}

export type EstimateTableResult =
  | { ok: true; value: EstimateTable }
  | { ok: false; error: { code: string; message: string } };

const tables = new Map<string, EstimateTableResult>();

export function estimateTable(p: DemoPersona): EstimateTableResult {
  const cached = tables.get(p.id);
  if (cached) return cached;
  const profile = toPublicProfile(p.data.company);
  const byJson = new Map<string, string>();
  const variants: EstimateTable['variants'] = [];
  const index: Record<string, string> = {};
  let failure: EstimateTableResult | null = null;
  for (const monthlyRevenueBracket of REVENUE_VALUES)
    for (const hasEmployees of EMPLOYEE_VALUES)
      for (const receivesFromAbroad of ABROAD_VALUES) {
        if (failure) continue;
        const answers: ProfileAnswers = { monthlyRevenueBracket, hasEmployees, receivesFromAbroad };
        const r = estimateByProfile(profile, answers, { analysisDate: p.data.analysisDate });
        if (!r.ok) {
          failure = { ok: false, error: { code: r.error.code, message: r.error.message } };
          continue;
        }
        const json = JSON.stringify(r.value);
        let id = byJson.get(json);
        if (id === undefined) {
          id = `v${variants.length}`;
          byJson.set(json, id);
          variants.push({ id, estimate: r.value });
        }
        index[answersKey(answers)] = id;
      }
  const result: EstimateTableResult = failure ?? { ok: true, value: { variants, index } };
  tables.set(p.id, result);
  return result;
}
