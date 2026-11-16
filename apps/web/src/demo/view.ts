import 'server-only';
import type { DemoAccountView, DemoPersonaView } from '@/features/demo/types';
import type { DemoPersona } from './catalog.ts';
import { transactionCount } from './catalog.ts';
import { profileQuestions } from './estimates.ts';

const SYNTHETIC_SUFFIX = /\s*\(persona sintética\)\s*$/i;

/** "MARINA DEV LTDA" → "Marina Dev Ltda" (the persona names are a closed synthetic list, personas/names.ts). */
export function titleCase(name: string): string {
  return name
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length <= 2 && w !== 'sa' ? w : `${w.charAt(0).toUpperCase()}${w.slice(1)}`))
    .join(' ');
}

function accountView(p: DemoPersona, holder: 'PF' | 'PJ'): DemoAccountView {
  const items = p.data.items.filter((i) => i.holder === holder);
  return {
    bank: (items[0]?.item.connector.name ?? 'Banco sandbox').replace(SYNTHETIC_SUFFIX, ''),
    products: items.flatMap((i) => i.accounts.map((a) => a.account.productName)),
    transactions: transactionCount(p, holder),
  };
}

export function personaView(p: DemoPersona): DemoPersonaView {
  return {
    id: p.id,
    hero: p.hero,
    holderName: p.data.holderDisplayName,
    companyName: titleCase(p.data.company.displayLegalName),
    cnpj: p.data.company.cnpj,
    questions: profileQuestions(p.data.company),
    accounts: { PJ: accountView(p, 'PJ'), PF: accountView(p, 'PF') },
  };
}
