CREATE TYPE "public"."investment_transaction_kind" AS ENUM('trade', 'transfer', 'fee', 'dividend', 'interest', 'deposit', 'withdrawal', 'adjustment', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."investment_transaction_side" AS ENUM('buy', 'sell', 'swap', 'open', 'close', 'increase', 'decrease', 'receive', 'send', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."investment_transaction_status" AS ENUM('confirmed', 'pending', 'failed', 'canceled', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."investment_transaction_sync_status" AS ENUM('idle', 'syncing', 'success', 'rate_limited', 'error');--> statement-breakpoint
CREATE TABLE "brokerage_transaction_details" (
	"transaction_id" uuid PRIMARY KEY NOT NULL,
	"plaid_item_id" uuid,
	"external_account_id" text,
	"security_id" text,
	"plaid_type" text,
	"plaid_subtype" text,
	"cancel_transaction_id" text
);
--> statement-breakpoint
CREATE TABLE "evm_transaction_details" (
	"transaction_id" uuid PRIMARY KEY NOT NULL,
	"chain_id" text NOT NULL,
	"tx_hash" text NOT NULL,
	"block_number" numeric(78, 0),
	"log_index" integer,
	"action_index" integer,
	"protocol" text,
	"method" text,
	"from_address" text,
	"to_address" text
);
--> statement-breakpoint
CREATE TABLE "hyper_core_transaction_details" (
	"transaction_id" uuid PRIMARY KEY NOT NULL,
	"market" text NOT NULL,
	"order_id" text,
	"fill_id" text,
	"direction" text,
	"crossed" boolean,
	"fee_token" text
);
--> statement-breakpoint
CREATE TABLE "investment_transaction_syncs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"investment_account_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"status" "investment_transaction_sync_status" DEFAULT 'idle' NOT NULL,
	"cursor" text,
	"earliest_backfilled_at" timestamp,
	"latest_synced_executed_at" timestamp,
	"backfill_started_at" timestamp,
	"backfill_completed_at" timestamp,
	"last_synced_at" timestamp,
	"last_http_status" integer,
	"last_error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investment_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"investment_account_id" uuid NOT NULL,
	"source_provider" text NOT NULL,
	"source_transaction_id" text NOT NULL,
	"source_account_id" text,
	"executed_at" timestamp NOT NULL,
	"settled_at" timestamp,
	"kind" "investment_transaction_kind" DEFAULT 'unknown' NOT NULL,
	"side" "investment_transaction_side" DEFAULT 'unknown' NOT NULL,
	"base_asset_symbol" text,
	"base_asset_id" text,
	"base_amount" numeric(36, 18),
	"quote_asset_symbol" text,
	"quote_asset_id" text,
	"quote_amount" numeric(36, 18),
	"price_quote" numeric(36, 18),
	"value_usd" numeric(36, 18),
	"fee_amount" numeric(36, 18),
	"fee_asset_symbol" text,
	"chain_id" text,
	"tx_hash" text,
	"status" "investment_transaction_status" DEFAULT 'unknown' NOT NULL,
	"raw" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brokerage_transaction_details" ADD CONSTRAINT "brokerage_transaction_details_transaction_id_investment_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."investment_transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brokerage_transaction_details" ADD CONSTRAINT "brokerage_transaction_details_plaid_item_id_plaid_items_id_fk" FOREIGN KEY ("plaid_item_id") REFERENCES "public"."plaid_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evm_transaction_details" ADD CONSTRAINT "evm_transaction_details_transaction_id_investment_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."investment_transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hyper_core_transaction_details" ADD CONSTRAINT "hyper_core_transaction_details_transaction_id_investment_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."investment_transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_transaction_syncs" ADD CONSTRAINT "investment_transaction_syncs_investment_account_user_fk" FOREIGN KEY ("investment_account_id","user_id") REFERENCES "public"."investment_accounts"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_transaction_syncs" ADD CONSTRAINT "investment_transaction_syncs_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_transactions" ADD CONSTRAINT "investment_transactions_investment_account_user_fk" FOREIGN KEY ("investment_account_id","user_id") REFERENCES "public"."investment_accounts"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_transactions" ADD CONSTRAINT "investment_transactions_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brokerage_transaction_details_plaid_item_id_idx" ON "brokerage_transaction_details" USING btree ("plaid_item_id");--> statement-breakpoint
CREATE INDEX "brokerage_transaction_details_external_account_id_idx" ON "brokerage_transaction_details" USING btree ("external_account_id");--> statement-breakpoint
CREATE INDEX "brokerage_transaction_details_security_id_idx" ON "brokerage_transaction_details" USING btree ("security_id");--> statement-breakpoint
CREATE INDEX "evm_transaction_details_chain_tx_idx" ON "evm_transaction_details" USING btree ("chain_id","tx_hash");--> statement-breakpoint
CREATE INDEX "hyper_core_transaction_details_market_idx" ON "hyper_core_transaction_details" USING btree ("market");--> statement-breakpoint
CREATE INDEX "hyper_core_transaction_details_order_id_idx" ON "hyper_core_transaction_details" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "investment_transaction_syncs_account_provider_unique" ON "investment_transaction_syncs" USING btree ("investment_account_id","provider");--> statement-breakpoint
CREATE INDEX "investment_transaction_syncs_user_id_idx" ON "investment_transaction_syncs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "investment_transaction_syncs_status_idx" ON "investment_transaction_syncs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "investment_transactions_source_unique" ON "investment_transactions" USING btree ("investment_account_id","source_provider","source_transaction_id");--> statement-breakpoint
CREATE INDEX "investment_transactions_user_executed_at_idx" ON "investment_transactions" USING btree ("user_id","executed_at");--> statement-breakpoint
CREATE INDEX "investment_transactions_account_executed_at_idx" ON "investment_transactions" USING btree ("investment_account_id","executed_at");--> statement-breakpoint
CREATE INDEX "investment_transactions_provider_idx" ON "investment_transactions" USING btree ("source_provider");--> statement-breakpoint
CREATE INDEX "investment_transactions_tx_hash_idx" ON "investment_transactions" USING btree ("tx_hash");