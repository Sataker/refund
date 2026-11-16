// Pipeline contracts (ARCHITECTURE §4.4). Field names and unions are a contract: do not rename.
import type { Cents, CivilDate, EngineResult, Facts, YearMonth } from '@refund/engine';
import type {
  PublicCompany,
  SourceAccount,
  SourceIdentity,
  SourceTransaction,
} from '@refund/sources';
import type { Category } from './category.ts';
import type { AnalysisClock, ExplanationOutput, LlmPort } from './ports.ts';

export type { Category } from './category.ts';

export interface NormalizedTransaction {
  id: string; // stable: sha256(account + sourceId) truncated (26 chars)
  accountId: string;
  holder: 'PF' | 'PJ';
  date: CivilDate;
  month: YearMonth;
  amountCents: number; // always positive; the sign is in `direction`
  direction: 'inflow' | 'outflow';
  description: string; // ENGINE-SPEC E.1.5 normalization (what the regexes read)
  method: SourceTransaction['method'];
  counterparty: SourceTransaction['counterparty'];
  sourceCategory: string | null;
  mcc: string | null;
  /** [CONTRACT addition, E14b] Card installment ("3 de 10"); the financial view keeps installments out of "recorrentes". */
  installment: SourceTransaction['installment'];
}

export interface Classification {
  transactionId: string;
  category: Category;
  confidence: number; // 0..1 (rule = fixed per rule type, ENGINE-SPEC E.3; LLM = self-reported, NOT calibrated)
  origin: 'rule' | 'llm' | 'user';
  /** The ENGINE-SPEC E.2/E.3 label that decided it (`das_simples`, `pro_labore`…); what E.8 accuracy measures. */
  ruleId?: string;
  reason: string;
  status: 'applied' | 'pending_confirmation' | 'unclassified' | 'confirmed' | 'rejected';
}

/** Entry policy (REVISAO A5; ENGINE-SPEC E.1). */
export const CLASSIFICATION_POLICY = {
  ruleAppliesDirectly: true,
  llmAppliesDirectlyIfNotFeedingFinding: { minConfidence: 0.95 },
  llmFeedingFinding: 'always_confirm', // pró-labore, distribution, payroll, export, health, education
  discardBelow: 0.6,
} as const;

export interface ConfirmationQuestion {
  id: string;
  type: 'transaction' | 'monthly_pro_labore' | 'assumption';
  text: string; // "Seu pró-labore bruto é R$ 1.621,00 por mês?"
  transactionIds: string[];
  options: { value: string; label: string }[];
  estimatedImpact: Cents | null; // how much the answer can move the total (card ordering)
}

/**
 * [CONTRACT proposal, E9] The user's answer to a card, keyed by the stable `ConfirmationQuestion.id`
 * (the `answerQuestion({ analysisId, questionId, answer })` action stores it; the next run reuses it).
 * `confirmations` keep the per-transaction category answers; amounts (gross pró-labore, gross payroll) and
 * qualifications have no place there, and `userAssumptions` keys are the engine's `Assumptions` only.
 */
export interface QuestionAnswer {
  questionId: string;
  value: string | number | boolean | Record<string, number | string>;
}

export interface AnalysisInput {
  analysisId: string; // demo: 'demo:<persona>:<session>'
  company: PublicCompany;
  accounts: SourceAccount[];
  transactions: AsyncIterable<SourceTransaction[]> | SourceTransaction[];
  identities: SourceIdentity[];
  userAssumptions: Facts['assumptions'];
  confirmations: Pick<Classification, 'transactionId' | 'category'>[]; // the user's previous answers
  referenceMonth: YearMonth;
  /** [CONTRACT proposal, E9] Card answers (see `QuestionAnswer`). */
  answers?: QuestionAnswer[];
  /** /demo persona id, echoed in the `start` event. */
  persona?: string;
}

export type Pace = 'instant' | 'fast' | 'scripted'; // scripted ≈ 8 s [IDENTITY-AND-UI §4.9, script 1]

export interface AnalysisDeps {
  llm: LlmPort;
  article: (id: string) => { id: string; label: string; text: string } | undefined;
  /** [CONTRACT proposal, E9] Analysis date and timestamps (ARCHITECTURE §3.1 lists `AnalysisClock` in ports.ts). */
  clock: AnalysisClock;
  parameterSet?: string;
  pace?: Pace; // only changes the interval between events; the calculation is always real (B9)
  wait?: (ms: number) => Promise<void>; // injectable (tests use 0)
  /** [CONTRACT proposal, E9] Upper bound for one LlmPort call (default 20 s, AiBudget.timeoutMs). */
  llmTimeoutMs?: number;
}

export interface PipelineResult {
  /** [CONTRACT proposal, E9] null when the run stopped before the engine (the `error` event says why). */
  engineResult: EngineResult | null;
  /** [CONTRACT proposal, E9] null when the facts could not be built (e.g. CNAE_OUT_OF_SCOPE). */
  facts: Facts | null;
  classifications: Classification[];
  questions: ConfirmationQuestion[];
  explanations: Record<string /* ruleId */, ExplanationOutput>;
  metrics: {
    transactions: number;
    byOrigin: Record<Classification['origin'] | 'unclassified', number>;
    durationMs: number;
  };
}
