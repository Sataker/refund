import 'server-only';
import {
  type CivilDate,
  cnaeAnexoRow,
  cnaeInScope,
  type ProfileAnswers,
  type PublicProfile,
} from '@refund/engine';
import type { PublicCompany } from '@refund/sources';

// ARCHITECTURE §4.2: the web builds the PublicProfile from the whitelisted PublicCompany (the engine
// does not import @refund/sources) and calculates nothing itself.

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
  revenue: true;
  employees: boolean;
  abroad: boolean;
}

/**
 * ENGINE-SPEC C.11.1: revenue is always asked; "tem funcionários?" only if the CNAE is subject to the
 * Fator R; "recebe do exterior?" to every Simples opt-in in scope (C.11.5 items 1–4 not triggered).
 */
export function profileQuestions(company: PublicCompany): ProfileQuestions {
  const p = toPublicProfile(company);
  const row = cnaeAnexoRow(p.primaryCnae);
  // C.11.5 item 4 through the engine's own test (cnaeInScope), never a second copy of it.
  const inScope = p.isActive && !p.optedIntoMei && p.optedIntoSimples && cnaeInScope(p.primaryCnae);
  return {
    revenue: true,
    employees: inScope && row?.subjectToFatorR === true,
    abroad: inScope,
  };
}

/** Every optional answer at its default (C.11.1): used for the list of applicable rules. */
export const DONT_KNOW_ANSWERS: ProfileAnswers = {
  monthlyRevenueBracket: 'dont_know',
  hasEmployees: 'dont_know',
  receivesFromAbroad: 'dont_know',
};

/** Answers for the engine: an unasked or unanswered optional question is `dont_know` (C.11.1). */
export function completeAnswers(partial: Partial<ProfileAnswers>): ProfileAnswers {
  return { ...DONT_KNOW_ANSWERS, ...partial };
}

const DATE_BRT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** `analysisDate` = today in Brasília time (ARCHITECTURE §4.7), as 'YYYY-MM-DD'. */
export function todayBrt(nowMs: number = Date.now()): CivilDate {
  return DATE_BRT.format(new Date(nowMs)) as CivilDate;
}
