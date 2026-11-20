import type { PublicCompany } from '@refund/sources';

// H3 (UX review 19/11): Refund calculates only companies in the Simples Nacional (and MEI). A company in another
// regime stops at "É você?" with the reason in plain words; it never goes on to consent and the bank steps (a bank
// connection would be wasted and the analysis would fail with a reason about the activity, not the regime).
// Pure: it reads the whitelisted public data only (ENGINE-SPEC C.11.5 item 3, the same test as estimateByProfile).

/** "LUCRO PRESUMIDO" → "Lucro Presumido". */
function title(form: string): string {
  return form
    .trim()
    .toLowerCase()
    .replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());
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
