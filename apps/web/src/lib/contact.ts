// The one place for the contact address shown on /privacidade and the landing waitlist (compliance review E14, M1).
// Enzo has not given it yet: `pnpm freeze:check` fails while this placeholder is here (scripts/freeze-check.ts).
export const CONTACT_PLACEHOLDER = 'CONTATO_PENDENTE';
export const CONTACT_EMAIL: string = CONTACT_PLACEHOLDER;

// D37 (PLAN §18): the seller's identification on /termos is name, city and contact e-mail (no CPF is published). The
// city is not given yet: `pnpm freeze:check` fails while this placeholder is here.
export const CITY_PLACEHOLDER = 'CIDADE_PENDENTE';
export const CONTACT_CITY: string = CITY_PLACEHOLDER;
