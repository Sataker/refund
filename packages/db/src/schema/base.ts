// SCHEMA §2.1: dedicated `refund` schema, column helpers and enums.
import { sql } from 'drizzle-orm';
import { pgSchema, timestamp, uuid } from 'drizzle-orm/pg-core';

export const refund = pgSchema('refund');

// ---------- helpers ----------
export const id = () => uuid('id').primaryKey().defaultRandom();
export const createdAt = () =>
  timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();
export const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
export const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
export const emptyArray = sql`'{}'`;

// ---------- enums ----------
export const organizationType = refund.enum('organization_type', ['accounting_firm', 'company']);
export const organizationRole = refund.enum('organization_role', ['admin', 'accountant', 'member']);
export const linkRole = refund.enum('link_role', ['partner', 'accountant', 'viewer']);
export const taxRegime = refund.enum('tax_regime', [
  'MEI',
  'SIMPLES',
  'PRESUMIDO',
  'REAL',
  'OTHER',
]);
export const companySize = refund.enum('company_size', ['MEI', 'ME', 'EPP', 'OTHER', 'UNKNOWN']);
// E21 (20/11/2026): the four public mirrors added to the CNPJ chain. New values go last (ADD VALUE).
export const companySource = refund.enum('company_source', [
  'brasilapi',
  'cnpjws',
  'replay',
  'persona',
  'opencnpj',
  'cnpja',
  'minhareceita',
  'receitaws',
]);
export const connectionProvider = refund.enum('connection_provider', [
  'pluggy',
  'persona',
  'replay',
]);
export const holder = refund.enum('holder', ['PF', 'PJ']);
export const connectionStatus = refund.enum('connection_status', [
  'pending',
  'syncing',
  'active',
  'error',
  'revoked',
  'expired',
]);
export const accountType = refund.enum('account_type', [
  'checking',
  'savings',
  'card',
  'investment',
  'other',
]);
export const direction = refund.enum('direction', ['inflow', 'outflow']);
export const transactionMethod = refund.enum('transaction_method', [
  'PIX',
  'TED',
  'DOC',
  'BOLETO',
  'CARD',
  'FEE',
  'FX',
  'OTHER',
]);
export const documentType = refund.enum('document_type', ['CPF', 'CNPJ']);
export const analysisOrigin = refund.enum('analysis_origin', ['live', 'persona']);
export const analysisStatus = refund.enum('analysis_status', [
  'pending',
  'running',
  'awaiting_confirmation',
  'completed',
  'error',
]);
export const category = refund.enum('category', [
  'service_revenue',
  'sales_revenue',
  'export_revenue',
  'financial_income',
  'pro_labore',
  'profit_distribution',
  'salary',
  'inss_charge',
  'fgts_charge',
  'das_tax',
  'darf_tax',
  'other_taxes',
  'deductible_health',
  'deductible_education',
  'pgbl_pension',
  'operating_expense',
  'personal_expense_in_pj',
  'same_holder_transfer',
  'bank_fee',
  'unclassified',
]);
export const classificationOrigin = refund.enum('classification_origin', ['rule', 'llm', 'user']);
export const classificationStatus = refund.enum('classification_status', [
  'applied',
  'pending_confirmation',
  'unclassified',
  'confirmed',
  'rejected',
]);
export const factOrigin = refund.enum('fact_origin', [
  'open_finance',
  'cnpj',
  'user',
  'default_assumption',
  'derived',
]);
export const findingType = refund.enum('finding_type', ['savings', 'recovery', 'alert', 'risk']);
export const confidence = refund.enum('confidence', [
  'confirmed',
  'estimated',
  'depends_on_regulation',
]);
// = ExplanationOutput['origin'] (ARCHITECTURE §4.4). 'llm' is what the model wrote live; the LlmPort
// *mode* is 'gateway' | 'recording' | 'template', a different set (GLOSSARY §7, aligned in E4).
export const explanationOrigin = refund.enum('explanation_origin', [
  'llm',
  'recording',
  'template',
]);
export const findingStatus = refund.enum('finding_status', [
  'new',
  'marked',
  'accountant_approved',
  'adjustment_requested',
  'dismissed',
]);
export const reportDecision = refund.enum('report_decision', [
  'pending',
  'approved',
  'adjustments',
]);
export const lawChangeStatus = refund.enum('law_change_status', [
  'new',
  'reviewed',
  'dismissed',
  'applied',
]);
export const subscriptionStatus = refund.enum('subscription_status', [
  'pending',
  'active',
  'expired',
  'cancelled',
]);
export const subscriptionOrigin = refund.enum('subscription_origin', [
  'one_time_pix',
  'abacatepay_subscription',
  'courtesy',
]);
export const chargeStatus = refund.enum('charge_status', [
  'pending',
  'paid',
  'expired',
  'cancelled',
  'refunded',
]);
export const webhookProvider = refund.enum('webhook_provider', [
  'pluggy',
  'abacatepay',
  'firecrawl',
  'resend',
]);
export const webhookStatus = refund.enum('webhook_status', [
  'received',
  'processed',
  'ignored',
  'error',
]);
export const actorType = refund.enum('actor_type', [
  'user',
  'accountant',
  'system',
  'webhook',
  'cron',
]);
export const logLevel = refund.enum('log_level', ['warn', 'error']);
