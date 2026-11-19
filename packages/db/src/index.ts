// Public API of @refund/db (ARCHITECTURE §3.2): schema, client, repositories, seed. No business rule.
export const PACKAGE_NAME = '@refund/db';

export {
  type CreateDbOptions,
  type CreateMemoryDbOptions,
  createDb,
  createMemoryDb,
  type Db,
  type DbHandle,
  type Schema,
} from './client.ts';
export {
  analysisEventsAfter,
  appendAnalysisEvent,
  CLAIM_TIMEOUT_MINUTES,
  claimAnalysis,
  markFindingsOutdated,
} from './repos/analyses.ts';
export {
  clearDeletedAuditActors,
  clearRevokedItem,
  connectionsOlderThan,
  connectionsWithItem,
  consentsOlderThan,
  deleteOrphanCompanies,
  deleteRateLimitsOfUser,
  deleteUnusedCompanies,
  deleteWaitlist,
  expireSubscriptions,
  inactiveAnonymousUsers,
  linkedCompanyIds,
  revokePendingConnections,
  withdrawConsent,
} from './repos/cleanup.ts';
export { type ConnectionRow, findConnectionByItemHash } from './repos/connections.ts';
export { deleteRateLimitsBefore, hitRateLimit } from './repos/rate-limits.ts';
export {
  decideReportRow,
  findOwnedReport,
  findReportByTokenHash,
  insertReport,
  latestReport,
  markReportOpened,
  markReportSent,
  type ReportDecisionItem,
  type ReportInsert,
  type ReportRow,
} from './repos/reports.ts';
export {
  type AnalysisRow,
  type ClassificationInput,
  createAnalysis,
  type FindingRow,
  findAnalysis,
  findingOf,
  findingRow,
  findOwnedAnalysis,
  type LedgerRow,
  latestAnalysis,
  listAnalysisLedger,
  listFindings,
  type RunOutcome,
  saveRun,
  setExcludedTransactions,
  setFindingStatus,
} from './repos/runs.ts';
export { type ActiveSubscription, activeSubscriptions } from './repos/subscriptions.ts';
export {
  appliedMigrations,
  cleanupTechnical,
  databaseSizeBytes,
  EXPECTED_MIGRATIONS,
  type HeartbeatOrigin,
  insertSystemEvent,
  type SystemEventInput,
  type TechnicalCleanup,
  touchHeartbeat,
} from './repos/system.ts';
export { type ConsumeInput, consumeUsage } from './repos/usage.ts';
export {
  deleteInactiveAnonymousUsers,
  deleteUser,
  ensureAnonymousUser,
  findUser,
  type UserRow,
} from './repos/users.ts';
export { addToWaitlist, type WaitlistEntryInput } from './repos/waitlist.ts';
export {
  finishWebhookEvent,
  recordWebhookEvent,
  type WebhookEventInput,
  type WebhookProvider,
  type WebhookStatus,
} from './repos/webhooks.ts';
export * as schema from './schema/index.ts';
export {
  type CompanyInsert,
  companyRow,
  DEV_USER_ID,
  type RegulationRef,
  seedDev,
  seedReference,
} from './seed.ts';
