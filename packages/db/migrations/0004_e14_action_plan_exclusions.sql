ALTER TABLE "refund"."analyses" ADD COLUMN "excluded_transaction_ids" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "refund"."findings" ADD COLUMN "action_plan" jsonb;--> statement-breakpoint
ALTER TABLE "refund"."findings" ADD COLUMN "how_to_receive" jsonb;--> statement-breakpoint
ALTER TABLE "refund"."findings" ADD COLUMN "recovery_items" jsonb;