import { CNAE_IN_SCOPE, cnaeInScope } from '@refund/engine';
import type { PublicCompany } from '@refund/sources';

// H3 (UX review 19/11): Refund calculates only companies in the Simples Nacional (and MEI). A company in another
// regime stops at "É você?" with the reason in plain words; it never goes on to consent and the bank steps (a bank
// connection would be wasted and the analysis would fail with a reason about the activity, not the regime).
// Pure: it reads the whitelisted public data only (ENGINE-SPEC C.11.5 item 3, the same test as estimateByProfile).
//
// The activity (CNAE) gets the same treatment one step later, at the estimate: a CNAE outside the verified rows of
// `cnae-anexo.json` (C.11.5 item 4, the same test as estimateByProfile) stops there instead of running the bank steps
// and an analysis that can only end in CNAE_OUT_OF_SCOPE. The table is a tax decision: never widened here.

/** "LUCRO PRESUMIDO" → "Lucro Presumido". */
function title(form: string): string {
  return form
    .trim()
    .toLowerCase()
    .replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());
}

const LOWER_WORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
const UPPER_WORDS = new Set(['sa', 's/a', 's.a.', 'me', 'epp', 'eireli']);

/**
 * The company as named in a sentence: its legal name (razão social), already masked by the whitelist for EI/MEI
 * (ARCHITECTURE §7, "Mandatory mask"); a masked one reads "sua empresa". Never the trade name: a head office's trade
 * name can be a department ("DIRECAO GERAL").
 */
export function companyNameOf(company: Pick<PublicCompany, 'displayLegalName' | 'masked'>): string {
  if (company.masked) return 'sua empresa';
  return company.displayLegalName
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => {
      if (UPPER_WORDS.has(w)) return w.toUpperCase();
      if (i > 0 && LOWER_WORDS.has(w)) return w;
      return w.replace(/^\p{L}/u, (c) => c.toUpperCase());
    })
    .join(' ');
}

/** The regime name when the company is out of scope (not Simples, not MEI); null when it is in scope. */
export function outOfScopeRegime(
  company: Pick<PublicCompany, 'simples' | 'mei' | 'taxRegimeHistory'>,
): string | null {
  if (company.mei.optedIn || company.simples.optedIn) return null;
  const last = company.taxRegimeHistory.at(-1);
  return last && last.form.trim() !== '' ? title(last.form) : 'regime fora do Simples Nacional';
}

/** The stop message, with the company's own name and regime. */
export function outOfScopeMessage(companyName: string, regime: string): string {
  return `Por enquanto o Refund calcula só empresas do Simples Nacional. A ${companyName} está no ${regime}.`;
}

/** The regime stop of a company, or null when its regime is in scope. */
export function regimeStop(
  company: Pick<
    PublicCompany,
    'simples' | 'mei' | 'taxRegimeHistory' | 'displayLegalName' | 'masked'
  >,
): { regime: string; message: string } | null {
  const regime = outOfScopeRegime(company);
  return regime === null
    ? null
    : { regime, message: outOfScopeMessage(companyNameOf(company), regime) };
}

const lowerFirst = (text: string): string => text.replace(/^\p{Lu}/u, (c) => c.toLowerCase());

function listPt(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  // Semicolons: a description of the table may carry its own comma.
  return `${items.slice(0, -1).join('; ')}; e ${items.at(-1)}`;
}

/** The activities Refund calculates, from the verified rows of the CNAE table (never a hardcoded list). */
export function supportedActivities(): string {
  return listPt(CNAE_IN_SCOPE.map((r) => `${lowerFirst(r.description)} (${r.cnae})`));
}

/** The activity stop message, with the company's own CNAE and description. */
export function activityOutOfScopeMessage(cnae: { code: string; description: string }): string {
  const activity = [cnae.code, cnae.description].filter((s) => s.trim() !== '').join(' ');
  return `Por enquanto o Refund calcula só estas atividades: ${supportedActivities()}. A sua atividade (${activity}) ainda não está na nossa tabela conferida.`;
}

/** The activity stop of a company whose regime is in scope, or null when its CNAE is in the verified table. */
export function activityStop(
  company: Pick<PublicCompany, 'primaryCnae'>,
): { cnae: string; message: string } | null {
  return cnaeInScope(company.primaryCnae.code)
    ? null
    : { cnae: company.primaryCnae.code, message: activityOutOfScopeMessage(company.primaryCnae) };
}
