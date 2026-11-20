import 'server-only';
import {
  type Cents,
  type CivilDate,
  cnaeAnexoRow,
  cnaeInScope,
  meiLimit,
  type ProfileAnswers,
  type PublicProfile,
  type RevenueBracket,
  type YearMonth,
} from '@refund/engine';
import type { PublicCompany } from '@refund/sources';
import { REVENUE_BOUNDS } from '@/features/track/steps';

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

// ---------- MEI (bug bash 20/11, H5) ----------

/**
 * The MEI limit test of a yearly revenue, through the engine's own R03 rule (`meiLimit`, ENGINE-SPEC D.3): `band` is
 * null below the alert floor (80% of the limit), and the tolerance limit is the § 7º, III 20%. Never a literal limit.
 * The `anexo` argument only prices an excess, which nothing here reads.
 */
function meiTest(company: PublicCompany, today: CivilDate, yearlyCents: number) {
  const opened = (company.mei.since ?? company.activityStartDate ?? today).slice(0, 7) as YearMonth;
  return meiLimit({
    year: Number(today.slice(0, 4)),
    rbaProj: yearlyCents as Cents,
    openedIn: opened,
    anexo: 'I',
    dasMeiPaid: 0 as Cents,
  });
}

/**
 * The faturamento options an MEI can actually have: the bands that start within the MEI limit with its 20% tolerance
 * (above it the company is no longer an MEI), plus "Não sei". Bounds from the option labels (C.11.2).
 */
export function meiRevenueOptions(company: PublicCompany, today: CivilDate): RevenueBracket[] {
  return (Object.keys(REVENUE_BOUNDS) as RevenueBracket[]).filter((b) => {
    const bounds = REVENUE_BOUNDS[b];
    if (bounds === null) return true;
    return bounds[0] * 12 <= meiTest(company, today, bounds[0] * 12).toleranceLimit;
  });
}

/** Whether the MEI limit alert applies: the band's top reaches R03's alert floor (an unknown band never shows it). */
export function meiNearLimit(
  company: PublicCompany,
  bracket: RevenueBracket | undefined,
  today: CivilDate,
): boolean {
  const bounds = bracket ? REVENUE_BOUNDS[bracket] : null;
  if (!bounds) return false;
  const top = bounds[1] === null ? bounds[0] * 12 : bounds[1] * 12;
  return meiTest(company, today, top).band !== null;
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
