CREATE SCHEMA "refund";
--> statement-breakpoint
CREATE TYPE "refund"."account_type" AS ENUM('checking', 'savings', 'card', 'investment', 'other');--> statement-breakpoint
CREATE TYPE "refund"."actor_type" AS ENUM('user', 'accountant', 'system', 'webhook', 'cron');--> statement-breakpoint
CREATE TYPE "refund"."analysis_origin" AS ENUM('live', 'persona');--> statement-breakpoint
CREATE TYPE "refund"."analysis_status" AS ENUM('pending', 'running', 'awaiting_confirmation', 'completed', 'error');--> statement-breakpoint
CREATE TYPE "refund"."category" AS ENUM('service_revenue', 'sales_revenue', 'export_revenue', 'financial_income', 'pro_labore', 'profit_distribution', 'salary', 'inss_charge', 'fgts_charge', 'das_tax', 'darf_tax', 'other_taxes', 'deductible_health', 'deductible_education', 'pgbl_pension', 'operating_expense', 'personal_expense_in_pj', 'same_holder_transfer', 'bank_fee', 'unclassified');--> statement-breakpoint
CREATE TYPE "refund"."charge_status" AS ENUM('pending', 'paid', 'expired', 'cancelled', 'refunded');--> statement-breakpoint
CREATE TYPE "refund"."classification_origin" AS ENUM('rule', 'llm', 'user');--> statement-breakpoint
CREATE TYPE "refund"."classification_status" AS ENUM('applied', 'pending_confirmation', 'unclassified', 'confirmed', 'rejected');--> statement-breakpoint
CREATE TYPE "refund"."company_size" AS ENUM('MEI', 'ME', 'EPP', 'OTHER', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "refund"."company_source" AS ENUM('brasilapi', 'cnpjws', 'replay', 'persona');--> statement-breakpoint
CREATE TYPE "refund"."confidence" AS ENUM('confirmed', 'estimated', 'depends_on_regulation');--> statement-breakpoint
CREATE TYPE "refund"."connection_provider" AS ENUM('pluggy', 'persona', 'replay');--> statement-breakpoint
CREATE TYPE "refund"."connection_status" AS ENUM('pending', 'syncing', 'active', 'error', 'revoked', 'expired');--> statement-breakpoint
CREATE TYPE "refund"."direction" AS ENUM('inflow', 'outflow');--> statement-breakpoint
CREATE TYPE "refund"."document_type" AS ENUM('CPF', 'CNPJ');--> statement-breakpoint
CREATE TYPE "refund"."explanation_origin" AS ENUM('llm', 'recording', 'template');--> statement-breakpoint
CREATE TYPE "refund"."fact_origin" AS ENUM('open_finance', 'cnpj', 'user', 'default_assumption', 'derived');--> statement-breakpoint
CREATE TYPE "refund"."finding_status" AS ENUM('new', 'marked', 'accountant_approved', 'adjustment_requested', 'dismissed');--> statement-breakpoint
CREATE TYPE "refund"."finding_type" AS ENUM('savings', 'recovery', 'alert', 'risk');--> statement-breakpoint
CREATE TYPE "refund"."holder" AS ENUM('PF', 'PJ');--> statement-breakpoint
CREATE TYPE "refund"."law_change_status" AS ENUM('new', 'reviewed', 'dismissed', 'applied');--> statement-breakpoint
CREATE TYPE "refund"."link_role" AS ENUM('partner', 'accountant', 'viewer');--> statement-breakpoint
CREATE TYPE "refund"."log_level" AS ENUM('warn', 'error');--> statement-breakpoint
CREATE TYPE "refund"."organization_role" AS ENUM('admin', 'accountant', 'member');--> statement-breakpoint
CREATE TYPE "refund"."organization_type" AS ENUM('accounting_firm', 'company');--> statement-breakpoint
CREATE TYPE "refund"."report_decision" AS ENUM('pending', 'approved', 'adjustments');--> statement-breakpoint
CREATE TYPE "refund"."subscription_origin" AS ENUM('one_time_pix', 'abacatepay_subscription', 'courtesy');--> statement-breakpoint
CREATE TYPE "refund"."subscription_status" AS ENUM('pending', 'active', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "refund"."tax_regime" AS ENUM('MEI', 'SIMPLES', 'PRESUMIDO', 'REAL', 'OTHER');--> statement-breakpoint
CREATE TYPE "refund"."transaction_method" AS ENUM('PIX', 'TED', 'DOC', 'BOLETO', 'CARD', 'FEE', 'FX', 'OTHER');--> statement-breakpoint
CREATE TYPE "refund"."webhook_provider" AS ENUM('pluggy', 'abacatepay', 'firecrawl', 'resend');--> statement-breakpoint
CREATE TYPE "refund"."webhook_status" AS ENUM('received', 'processed', 'ignored', 'error');--> statement-breakpoint
CREATE TABLE "refund"."analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"origin" "refund"."analysis_origin" NOT NULL,
	"status" "refund"."analysis_status" DEFAULT 'pending' NOT NULL,
	"reference_month" char(7) NOT NULL,
	"engine_version" varchar(20),
	"parameters_version" varchar(20),
	"parameters_hash" char(64),
	"inputs_hash" char(64),
	"total" jsonb,
	"metrics" jsonb,
	"error" jsonb,
	"claimed_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refund"."analysis_events" (
	"analysis_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"type" varchar(30) NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analysis_events_analysis_id_seq_pk" PRIMARY KEY("analysis_id","seq")
);
--> statement-breakpoint
CREATE TABLE "refund"."classifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"transaction_id" varchar(26) NOT NULL,
	"category" "refund"."category" NOT NULL,
	"confidence_bp" smallint NOT NULL,
	"origin" "refund"."classification_origin" NOT NULL,
	"rule_id" varchar(40),
	"reason" varchar(300) NOT NULL,
	"status" "refund"."classification_status" NOT NULL,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "refund"."facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"key" varchar(80) NOT NULL,
	"month" char(7),
	"amount_cents" bigint,
	"value_json" jsonb,
	"origin" "refund"."fact_origin" NOT NULL,
	"provenance" varchar(26)[] DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refund"."findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"rule_id" varchar(40) NOT NULL,
	"rule_version" varchar(20) NOT NULL,
	"sort_order" smallint NOT NULL,
	"type" "refund"."finding_type" NOT NULL,
	"title" varchar(200) NOT NULL,
	"marginal_value_12m_cents" bigint NOT NULL,
	"annual_regime_value_cents" bigint,
	"regime_from" char(7),
	"range_min_cents" bigint,
	"range_max_cents" bigint,
	"by_destination" jsonb,
	"confidence" "refund"."confidence" NOT NULL,
	"counts_in_total" boolean NOT NULL,
	"deadline" date,
	"trace" jsonb NOT NULL,
	"refs" jsonb NOT NULL,
	"ref_ids" text[] DEFAULT '{}' NOT NULL,
	"assumptions_used" text[] DEFAULT '{}' NOT NULL,
	"do_not" text[] DEFAULT '{}' NOT NULL,
	"tradeoffs" text[] DEFAULT '{}' NOT NULL,
	"explanation" text,
	"explanation_origin" "refund"."explanation_origin",
	"status" "refund"."finding_status" DEFAULT 'new' NOT NULL,
	"outdated" boolean DEFAULT false NOT NULL,
	"law_change_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refund"."companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cnpj" char(14) NOT NULL,
	"display_legal_name" varchar(200) NOT NULL,
	"display_trade_name" varchar(200),
	"masked" boolean DEFAULT false NOT NULL,
	"legal_nature_code" varchar(4) NOT NULL,
	"size" "refund"."company_size" NOT NULL,
	"primary_cnae" varchar(7) NOT NULL,
	"secondary_cnaes" text[] DEFAULT '{}' NOT NULL,
	"regime" "refund"."tax_regime" NOT NULL,
	"opted_into_simples" boolean NOT NULL,
	"opted_into_mei" boolean NOT NULL,
	"opened_on" date NOT NULL,
	"uf" char(2) NOT NULL,
	"ibge_municipality" varchar(7),
	"public_data" jsonb NOT NULL,
	"source" "refund"."company_source" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refund"."company_links" (
	"user_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"role" "refund"."link_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_links_user_id_company_id_pk" PRIMARY KEY("user_id","company_id")
);
--> statement-breakpoint
CREATE TABLE "refund"."user_assumptions" (
	"user_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"key" varchar(80) NOT NULL,
	"value" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_assumptions_user_id_company_id_key_pk" PRIMARY KEY("user_id","company_id","key")
);
--> statement-breakpoint
CREATE TABLE "refund"."accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"source_id_hash" text NOT NULL,
	"holder" "refund"."holder" NOT NULL,
	"type" "refund"."account_type" NOT NULL,
	"product_name" varchar(120) NOT NULL,
	"institution" varchar(120) NOT NULL,
	"currency" char(3) DEFAULT 'BRL' NOT NULL,
	"balance_cents" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refund"."connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"company_id" uuid,
	"consent_id" uuid,
	"provider" "refund"."connection_provider" NOT NULL,
	"holder" "refund"."holder" NOT NULL,
	"item_id_encrypted" text,
	"item_id_hash" text,
	"connector_name" varchar(120),
	"connector_sandbox" smallint DEFAULT 1 NOT NULL,
	"status" "refund"."connection_status" DEFAULT 'pending' NOT NULL,
	"error_code" varchar(60),
	"last_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "refund"."transactions" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"source_id_hash" text NOT NULL,
	"date" date NOT NULL,
	"month" char(7) NOT NULL,
	"amount_cents" bigint NOT NULL,
	"direction" "refund"."direction" NOT NULL,
	"description" varchar(300) NOT NULL,
	"method" "refund"."transaction_method" NOT NULL,
	"counterparty_doc_type" "refund"."document_type",
	"counterparty_doc_hmac" text,
	"counterparty_cnpj" char(14),
	"counterparty_mask" varchar(24),
	"counterparty_name" varchar(160),
	"counterparty_cnae" varchar(7),
	"source_category" varchar(80),
	"mcc" varchar(4),
	"installment" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refund"."consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"terms_version" varchar(20) NOT NULL,
	"ip_hash" text,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "refund"."organization_members" (
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "refund"."organization_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_members_organization_id_user_id_pk" PRIMARY KEY("organization_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "refund"."organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workos_org_id" text NOT NULL,
	"name" varchar(160) NOT NULL,
	"type" "refund"."organization_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refund"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"anonymous" boolean DEFAULT true NOT NULL,
	"workos_user_id" text,
	"email_hash" text,
	"email_encrypted" text,
	"display_name" varchar(120),
	"last_access_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refund"."law_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"regulation_id" varchar(40) NOT NULL,
	"url" text NOT NULL,
	"event_id" varchar(80) NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"diff_text" text NOT NULL,
	"judgment" text,
	"affected_articles" text[] DEFAULT '{}' NOT NULL,
	"affected_rules" text[] DEFAULT '{}' NOT NULL,
	"summary" text,
	"summary_origin" "refund"."explanation_origin",
	"status" "refund"."law_change_status" DEFAULT 'new' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refund"."monitored_regulations" (
	"regulation_id" varchar(40) PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"firecrawl_monitor_id" varchar(80),
	"last_checked_at" timestamp with time zone,
	"last_changed_at" timestamp with time zone
);
--> statement-breakpoint
-- Hand fix (E4): drizzle-kit 0.31.11 prints an enum whose name starts with "char" (charge_status)
-- without its schema, as if it were the native char type. The snapshot is right; only this line changed.
CREATE TABLE "refund"."charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" varchar(20) NOT NULL,
	"period" varchar(10) NOT NULL,
	"provider" varchar(20) DEFAULT 'abacatepay' NOT NULL,
	"provider_charge_id" varchar(80),
	"amount_cents" bigint NOT NULL,
	"status" "refund"."charge_status" DEFAULT 'pending' NOT NULL,
	"dev_mode" boolean NOT NULL,
	"br_code" text,
	"expires_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refund"."monthly_usage" (
	"user_id" uuid NOT NULL,
	"month" char(7) NOT NULL,
	"resource" varchar(40) NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monthly_usage_user_id_month_resource_pk" PRIMARY KEY("user_id","month","resource")
);
--> statement-breakpoint
CREATE TABLE "refund"."subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" varchar(20) NOT NULL,
	"status" "refund"."subscription_status" NOT NULL,
	"origin" "refund"."subscription_origin" NOT NULL,
	"charge_id" uuid,
	"provider_subscription_id" varchar(80),
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refund"."reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"accountant_email_encrypted" text NOT NULL,
	"accountant_email_hash" text NOT NULL,
	"message" varchar(1000),
	"include" jsonb NOT NULL,
	"resend_email_id" varchar(80),
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"decision" "refund"."report_decision" DEFAULT 'pending' NOT NULL,
	"decisions_by_finding" jsonb,
	"decided_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refund"."audit_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_type" "refund"."actor_type" NOT NULL,
	"actor_user_id" uuid,
	"action" varchar(60) NOT NULL,
	"target_type" varchar(40),
	"target_id" varchar(80),
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refund"."external_cache" (
	"source" varchar(30) NOT NULL,
	"key" varchar(120) NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "external_cache_source_key_pk" PRIMARY KEY("source","key")
);
--> statement-breakpoint
CREATE TABLE "refund"."rate_limits" (
	"key" varchar(120) NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "refund"."system_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"level" "refund"."log_level" NOT NULL,
	"event" varchar(60) NOT NULL,
	"route" varchar(200),
	"request_id" varchar(120),
	"context" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refund"."system_heartbeat" (
	"id" smallint PRIMARY KEY NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"origin" varchar(30) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refund"."waitlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_encrypted" text NOT NULL,
	"email_hash" text NOT NULL,
	"has_cnpj" boolean NOT NULL,
	"origin" varchar(40) NOT NULL,
	"consented_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refund"."webhook_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"provider" "refund"."webhook_provider" NOT NULL,
	"event_id" varchar(120) NOT NULL,
	"type" varchar(60) NOT NULL,
	"status" "refund"."webhook_status" DEFAULT 'received' NOT NULL,
	"payload" jsonb,
	"error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "refund"."analyses" ADD CONSTRAINT "analyses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "refund"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund"."analyses" ADD CONSTRAINT "analyses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "refund"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund"."analysis_events" ADD CONSTRAINT "analysis_events_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "refund"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund"."classifications" ADD CONSTRAINT "classifications_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "refund"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund"."classifications" ADD CONSTRAINT "classifications_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "refund"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund"."facts" ADD CONSTRAINT "facts_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "refund"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund"."findings" ADD CONSTRAINT "findings_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "refund"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund"."company_links" ADD CONSTRAINT "company_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "refund"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund"."company_links" ADD CONSTRAINT "company_links_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "refund"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund"."user_assumptions" ADD CONSTRAINT "user_assumptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "refund"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund"."user_assumptions" ADD CONSTRAINT "user_assumptions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "refund"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund"."accounts" ADD CONSTRAINT "accounts_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "refund"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund"."connections" ADD CONSTRAINT "connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "refund"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund"."connections" ADD CONSTRAINT "connections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "refund"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund"."connections" ADD CONSTRAINT "connections_consent_id_consents_id_fk" FOREIGN KEY ("consent_id") REFERENCES "refund"."consents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund"."transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "refund"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund"."consents" ADD CONSTRAINT "consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "refund"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund"."organization_members" ADD CONSTRAINT "organization_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "refund"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund"."organization_members" ADD CONSTRAINT "organization_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "refund"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund"."law_changes" ADD CONSTRAINT "law_changes_regulation_id_monitored_regulations_regulation_id_fk" FOREIGN KEY ("regulation_id") REFERENCES "refund"."monitored_regulations"("regulation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund"."law_changes" ADD CONSTRAINT "law_changes_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "refund"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund"."charges" ADD CONSTRAINT "charges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "refund"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund"."monthly_usage" ADD CONSTRAINT "monthly_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "refund"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund"."subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "refund"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund"."subscriptions" ADD CONSTRAINT "subscriptions_charge_id_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "refund"."charges"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund"."reports" ADD CONSTRAINT "reports_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "refund"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analyses_user_idx" ON "refund"."analyses" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "analyses_company_idx" ON "refund"."analyses" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "classifications_analysis_transaction_uk" ON "refund"."classifications" USING btree ("analysis_id","transaction_id");--> statement-breakpoint
CREATE INDEX "classifications_pending_idx" ON "refund"."classifications" USING btree ("analysis_id","status");--> statement-breakpoint
CREATE INDEX "facts_analysis_key_idx" ON "refund"."facts" USING btree ("analysis_id","key","month");--> statement-breakpoint
CREATE UNIQUE INDEX "findings_analysis_rule_uk" ON "refund"."findings" USING btree ("analysis_id","rule_id");--> statement-breakpoint
CREATE INDEX "findings_ref_ids_gin" ON "refund"."findings" USING gin ("ref_ids");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_cnpj_uk" ON "refund"."companies" USING btree ("cnpj");--> statement-breakpoint
CREATE INDEX "company_links_company_idx" ON "refund"."company_links" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_connection_source_uk" ON "refund"."accounts" USING btree ("connection_id","source_id_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "connections_item_hash_uk" ON "refund"."connections" USING btree ("item_id_hash");--> statement-breakpoint
CREATE INDEX "connections_user_idx" ON "refund"."connections" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_account_source_uk" ON "refund"."transactions" USING btree ("account_id","source_id_hash");--> statement-breakpoint
CREATE INDEX "transactions_account_date_idx" ON "refund"."transactions" USING btree ("account_id","date");--> statement-breakpoint
CREATE INDEX "transactions_account_month_idx" ON "refund"."transactions" USING btree ("account_id","month");--> statement-breakpoint
CREATE INDEX "consents_user_idx" ON "refund"."consents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "organization_members_user_idx" ON "refund"."organization_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_workos_uk" ON "refund"."organizations" USING btree ("workos_org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_workos_uk" ON "refund"."users" USING btree ("workos_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_hash_uk" ON "refund"."users" USING btree ("email_hash");--> statement-breakpoint
CREATE INDEX "users_anonymous_access_idx" ON "refund"."users" USING btree ("anonymous","last_access_at");--> statement-breakpoint
CREATE UNIQUE INDEX "law_changes_event_uk" ON "refund"."law_changes" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "law_changes_regulation_idx" ON "refund"."law_changes" USING btree ("regulation_id","detected_at");--> statement-breakpoint
CREATE UNIQUE INDEX "charges_provider_uk" ON "refund"."charges" USING btree ("provider","provider_charge_id");--> statement-breakpoint
CREATE INDEX "charges_user_idx" ON "refund"."charges" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "charges_period_status_idx" ON "refund"."charges" USING btree ("period","status");--> statement-breakpoint
CREATE INDEX "subscriptions_active_idx" ON "refund"."subscriptions" USING btree ("user_id","status","ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_charge_uk" ON "refund"."subscriptions" USING btree ("charge_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_token_uk" ON "refund"."reports" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "reports_analysis_idx" ON "refund"."reports" USING btree ("analysis_id");--> statement-breakpoint
CREATE INDEX "reports_resend_idx" ON "refund"."reports" USING btree ("resend_email_id");--> statement-breakpoint
CREATE INDEX "audit_events_target_idx" ON "refund"."audit_events" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "audit_events_created_idx" ON "refund"."audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "rate_limits_window_idx" ON "refund"."rate_limits" USING btree ("window_start");--> statement-breakpoint
CREATE INDEX "system_events_created_idx" ON "refund"."system_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "system_events_event_idx" ON "refund"."system_events" USING btree ("event","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_email_hash_uk" ON "refund"."waitlist" USING btree ("email_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_uk" ON "refund"."webhook_events" USING btree ("provider","event_id");--> statement-breakpoint
CREATE INDEX "webhook_events_received_idx" ON "refund"."webhook_events" USING btree ("received_at");