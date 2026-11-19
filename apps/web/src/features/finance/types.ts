// What the Finanças screen receives (IDENTITY-AND-UI Screen 5b). Type-only imports: the client components get the
// serialized `FinancialView` and these DTOs, never `@refund/pipeline` itself (ARCHITECTURE §3.3, rule 5).
import type { Finding } from '@refund/engine';
import type { FinancialView } from '@refund/pipeline';

export type {
  AccountLine,
  ChargeRow,
  DuplicateSuspect,
  ExcludedTransaction,
  FinancialGroupId,
  FinancialView,
  GroupLine,
  HolderView,
  MonthHighlight,
  TaxSeal,
  TaxSealKind,
} from '@refund/pipeline';

/** The fields of a finding a seal shows (its own amount or title, never another number; ENGINE-SPEC E.9.2). */
export interface SealFinding {
  ruleId: string;
  type: Finding['type'];
  title: string;
  marginalValue12m: number;
  range: [number, number] | null;
  /** "Ver achado →": `/demo/[persona]/achados/[regraId]` or `/app/analises/[id]/achados/[achadoId]`. */
  href: string;
}

/** One transaction inside a group's accordion: masked label, never a document or a person's name. */
export interface TxRow {
  id: string;
  date: string;
  label: string;
  amountCents: number;
  /** null: no classification (the row is in "Sem categoria"). */
  origin: 'rule' | 'llm' | 'user' | null;
}

export interface FinanceScreenData {
  /** "Marina Dev Ltda + Marina". */
  title: string;
  view: FinancialView;
  /**
   * [D31 b] The view per set of excluded transactions, keyed by `variantKey` ('' = `view`). /demo prebuilds every
   * combination the owner can choose; /app (E14) will build the one its stored exclusions ask for.
   */
  variants: Record<string, FinancialView>;
  /** sessionStorage key of the /demo exclusions (per persona). */
  storageKey: string;
  findings: Record<string, SealFinding>;
  transactions: Record<string, TxRow>;
  links: {
    /** Screen 7 (cards still open: "{n} a confirmar →", duplicate "Confirmar →"). */
    confirm: string;
    dashboard: string;
  };
}
