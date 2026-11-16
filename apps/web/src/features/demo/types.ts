// What the static /demo pages hand to the browser about a persona: display data only (no transactions, no
// engine). Built on the server from `src/demo/catalog.ts`.

export interface DemoAccountView {
  /** Connector name without the "(persona sintética)" suffix, e.g. "Banco Meridiano Empresas". */
  bank: string;
  products: string[];
  transactions: number;
}

export interface DemoPersonaView {
  id: string;
  hero: boolean;
  holderName: string;
  /** "Marina Dev Ltda". */
  companyName: string;
  cnpj: string;
  /** ENGINE-SPEC C.11.1: which optional profile questions this CNAE gets. */
  questions: { employees: boolean; abroad: boolean };
  accounts: { PJ: DemoAccountView; PF: DemoAccountView };
}
