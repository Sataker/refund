// SCHEMA §2.10: Drizzle 0.45 relational queries (RQB v1).
import { relations } from 'drizzle-orm';
import { analyses, analysisEvents, classifications, facts, findings } from './analyses.ts';
import { companies, companyLinks, userAssumptions } from './companies.ts';
import { accounts, connections, transactions } from './financial.ts';
import { consents, organizationMembers, organizations, users } from './identity.ts';
import { lawChanges, monitoredRegulations } from './law.ts';
import { charges, monthlyUsage, subscriptions } from './payments.ts';
import { reports } from './reports.ts';

export const usersRel = relations(users, ({ many }) => ({
  links: many(companyLinks),
  connections: many(connections),
  analyses: many(analyses),
  consents: many(consents),
  subscriptions: many(subscriptions),
  charges: many(charges),
  usage: many(monthlyUsage),
  members: many(organizationMembers),
  assumptions: many(userAssumptions),
}));
export const organizationsRel = relations(organizations, ({ many }) => ({
  members: many(organizationMembers),
}));
export const membersRel = relations(organizationMembers, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationMembers.organizationId],
    references: [organizations.id],
  }),
  user: one(users, { fields: [organizationMembers.userId], references: [users.id] }),
}));
export const companiesRel = relations(companies, ({ many }) => ({
  links: many(companyLinks),
  analyses: many(analyses),
  connections: many(connections),
}));
export const linksRel = relations(companyLinks, ({ one }) => ({
  user: one(users, { fields: [companyLinks.userId], references: [users.id] }),
  company: one(companies, { fields: [companyLinks.companyId], references: [companies.id] }),
}));
export const connectionsRel = relations(connections, ({ one, many }) => ({
  user: one(users, { fields: [connections.userId], references: [users.id] }),
  company: one(companies, { fields: [connections.companyId], references: [companies.id] }),
  consent: one(consents, { fields: [connections.consentId], references: [consents.id] }),
  accounts: many(accounts),
}));
export const accountsRel = relations(accounts, ({ one, many }) => ({
  connection: one(connections, {
    fields: [accounts.connectionId],
    references: [connections.id],
  }),
  transactions: many(transactions),
}));
export const transactionsRel = relations(transactions, ({ one, many }) => ({
  account: one(accounts, { fields: [transactions.accountId], references: [accounts.id] }),
  classifications: many(classifications),
}));
export const analysesRel = relations(analyses, ({ one, many }) => ({
  user: one(users, { fields: [analyses.userId], references: [users.id] }),
  company: one(companies, { fields: [analyses.companyId], references: [companies.id] }),
  events: many(analysisEvents),
  classifications: many(classifications),
  facts: many(facts),
  findings: many(findings),
  reports: many(reports),
}));
export const analysisEventsRel = relations(analysisEvents, ({ one }) => ({
  analysis: one(analyses, { fields: [analysisEvents.analysisId], references: [analyses.id] }),
}));
export const classificationsRel = relations(classifications, ({ one }) => ({
  analysis: one(analyses, { fields: [classifications.analysisId], references: [analyses.id] }),
  transaction: one(transactions, {
    fields: [classifications.transactionId],
    references: [transactions.id],
  }),
}));
export const factsRel = relations(facts, ({ one }) => ({
  analysis: one(analyses, { fields: [facts.analysisId], references: [analyses.id] }),
}));
export const findingsRel = relations(findings, ({ one }) => ({
  analysis: one(analyses, { fields: [findings.analysisId], references: [analyses.id] }),
  lawChange: one(lawChanges, { fields: [findings.lawChangeId], references: [lawChanges.id] }),
}));
export const reportsRel = relations(reports, ({ one }) => ({
  analysis: one(analyses, { fields: [reports.analysisId], references: [analyses.id] }),
}));
export const chargesRel = relations(charges, ({ one }) => ({
  user: one(users, { fields: [charges.userId], references: [users.id] }),
}));
export const subscriptionsRel = relations(subscriptions, ({ one }) => ({
  user: one(users, { fields: [subscriptions.userId], references: [users.id] }),
  charge: one(charges, { fields: [subscriptions.chargeId], references: [charges.id] }),
}));
export const monthlyUsageRel = relations(monthlyUsage, ({ one }) => ({
  user: one(users, { fields: [monthlyUsage.userId], references: [users.id] }),
}));
export const consentsRel = relations(consents, ({ one }) => ({
  user: one(users, { fields: [consents.userId], references: [users.id] }),
}));
export const assumptionsRel = relations(userAssumptions, ({ one }) => ({
  user: one(users, { fields: [userAssumptions.userId], references: [users.id] }),
  company: one(companies, { fields: [userAssumptions.companyId], references: [companies.id] }),
}));
export const regulationsRel = relations(monitoredRegulations, ({ many }) => ({
  changes: many(lawChanges),
}));
export const changesRel = relations(lawChanges, ({ one, many }) => ({
  regulation: one(monitoredRegulations, {
    fields: [lawChanges.regulationId],
    references: [monitoredRegulations.regulationId],
  }),
  findings: many(findings),
}));
