CREATE TYPE "public"."plaid_item_transaction_sync_status" AS ENUM('idle', 'syncing', 'success', 'rate_limited', 'error');--> statement-breakpoint
ALTER TABLE "plaid_items" ADD COLUMN "transaction_sync_status" "plaid_item_transaction_sync_status" DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE "plaid_items" ADD COLUMN "transaction_sync_run_id" text;--> statement-breakpoint
ALTER TABLE "plaid_items" ADD COLUMN "transaction_sync_started_at" timestamp;--> statement-breakpoint
ALTER TABLE "plaid_items" ADD COLUMN "transaction_sync_completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "plaid_items" ADD COLUMN "transaction_sync_http_status" integer;--> statement-breakpoint
ALTER TABLE "plaid_items" ADD COLUMN "transaction_sync_error_message" text;