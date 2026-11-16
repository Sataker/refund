// Public API of @refund/pipeline (ARCHITECTURE §4.4–4.6).
export const PACKAGE_NAME = '@refund/pipeline';

export { allowedCategories, FEEDS_FINDING } from './classify/index.ts';
export {
  RX_DARF,
  RX_DAS,
  RX_DAS_MEI,
  RX_DCTFWEB,
  RX_FGTS,
  RX_FX,
  RX_FX_PLATFORMS,
  RX_GPS,
  RX_LOAN,
  RX_PENSION,
  RX_PERSONAL,
} from './classify/regex.ts';
export {
  type AnalysisEvent,
  type AnalysisStage,
  type FindingDto,
  type TotalDto,
  toSseFrame,
} from './events.ts';
export {
  buildFinancialView,
  type ChargeRow,
  type DuplicateSuspect,
  FINANCIAL_GROUPS,
  type FinancialGroupId,
  type FinancialView,
  type FinancialViewFinding,
  type FinancialViewInput,
  financialViewOfRun,
  type GroupLine,
  type HolderView,
  type MonthHighlight,
  type MonthValue,
  type OutflowChange,
  type TaxSeal,
  type TaxSealKind,
} from './financial-view.ts';
export { normalizeDescription, normalizeTransactions, transactionId } from './normalize.ts';
export type {
  AnalysisClock,
  ExplanationInput,
  ExplanationOutput,
  LlmClassificationInput,
  LlmClassificationOutput,
  LlmPort,
} from './ports.ts';
export { CATEGORY_LABEL } from './questions.ts';
export { ratioBps } from './ratio.ts';
export { runAnalysis } from './run.ts';
export {
  type AnalysisDeps,
  type AnalysisInput,
  type Category,
  CLASSIFICATION_POLICY,
  type Classification,
  type ConfirmationQuestion,
  type NormalizedTransaction,
  type Pace,
  type PipelineResult,
  type QuestionAnswer,
} from './types.ts';
