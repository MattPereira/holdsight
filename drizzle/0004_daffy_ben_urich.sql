CREATE TYPE "public"."depository_account_kind" AS ENUM('checking');--> statement-breakpoint
CREATE TYPE "public"."depository_account_status" AS ENUM('active', 'disabled', 'error');--> statement-breakpoint
CREATE TYPE "public"."investment_account_sync_status" AS ENUM('idle', 'success', 'indexing', 'rate_limited', 'error');--> statement-breakpoint
ALTER TYPE "public"."financial_account_kind" RENAME TO "investment_account_kind";--> statement-breakpoint
ALTER TYPE "public"."financial_account_status" RENAME TO "investment_account_status";--> statement-breakpoint
CREATE TABLE "depository_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "depository_account_kind" DEFAULT 'checking' NOT NULL,
	"provider" text NOT NULL,
	"label" text,
	"institution_name" text,
	"account_mask" text,
	"currency" text DEFAULT 'USD' NOT NULL,
	"current_balance" numeric(18, 2) NOT NULL,
	"status" "depository_account_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investment_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investment_account_id" uuid NOT NULL,
	"source_position_id" text,
	"symbol" text NOT NULL,
	"name" text,
	"asset_class" "asset_class" NOT NULL,
	"amount" numeric(36, 18) NOT NULL,
	"price_usd" numeric(36, 18) NOT NULL,
	"value_usd" numeric(36, 18) NOT NULL,
	"as_of" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bank_accounts" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "financial_account_positions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "financial_account_sync_runs" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "hyper_core_account_snapshots" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "evm_position_details" DROP CONSTRAINT "evm_position_details_position_id_financial_account_positions_id_fk";
--> statement-breakpoint
ALTER TABLE "hyper_core_position_details" DROP CONSTRAINT "hyper_core_position_details_position_id_financial_account_positions_id_fk";
--> statement-breakpoint
DELETE FROM "evm_position_details";--> statement-breakpoint
DELETE FROM "hyper_core_position_details";--> statement-breakpoint
DROP TABLE "bank_accounts" CASCADE;--> statement-breakpoint
DROP TABLE "financial_account_positions" CASCADE;--> statement-breakpoint
DROP TABLE "financial_account_sync_runs" CASCADE;--> statement-breakpoint
DROP TABLE "hyper_core_account_snapshots" CASCADE;--> statement-breakpoint
ALTER TABLE "financial_accounts" RENAME TO "investment_accounts";--> statement-breakpoint
ALTER TABLE "brokerage_accounts" RENAME COLUMN "financial_account_id" TO "investment_account_id";--> statement-breakpoint
ALTER TABLE "centralized_exchange_accounts" RENAME COLUMN "financial_account_id" TO "investment_account_id";--> statement-breakpoint
ALTER TABLE "evm_wallet_accounts" RENAME COLUMN "financial_account_id" TO "investment_account_id";--> statement-breakpoint
ALTER TABLE "hyper_core_accounts" RENAME COLUMN "financial_account_id" TO "investment_account_id";--> statement-breakpoint
ALTER TABLE "evm_wallet_accounts" DROP CONSTRAINT "evm_wallet_accounts_financial_account_user_fk";
--> statement-breakpoint
ALTER TABLE "hyper_core_accounts" DROP CONSTRAINT "hyper_core_accounts_financial_account_user_fk";
--> statement-breakpoint
ALTER TABLE "investment_accounts" DROP CONSTRAINT "financial_accounts_id_user_id_unique";--> statement-breakpoint
ALTER TABLE "brokerage_accounts" DROP CONSTRAINT "brokerage_accounts_financial_account_id_financial_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "centralized_exchange_accounts" DROP CONSTRAINT "centralized_exchange_accounts_financial_account_id_financial_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "investment_accounts" DROP CONSTRAINT "financial_accounts_user_id_user_id_fk";
--> statement-breakpoint
DELETE FROM "investment_accounts" WHERE "kind" = 'bank';--> statement-breakpoint
ALTER TABLE "investment_accounts" ALTER COLUMN "kind" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."investment_account_kind";--> statement-breakpoint
CREATE TYPE "public"."investment_account_kind" AS ENUM('evm_wallet', 'hyper_core', 'centralized_exchange', 'brokerage');--> statement-breakpoint
ALTER TABLE "investment_accounts" ALTER COLUMN "kind" SET DATA TYPE "public"."investment_account_kind" USING "kind"::"public"."investment_account_kind";--> statement-breakpoint
DROP INDEX "financial_accounts_user_id_idx";--> statement-breakpoint
DROP INDEX "financial_accounts_user_kind_idx";--> statement-breakpoint
ALTER TABLE "investment_accounts" ADD COLUMN "sync_provider" text;--> statement-breakpoint
ALTER TABLE "investment_accounts" ADD COLUMN "sync_status" "investment_account_sync_status" DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE "investment_accounts" ADD COLUMN "sync_http_status" integer;--> statement-breakpoint
ALTER TABLE "investment_accounts" ADD COLUMN "sync_error_message" text;--> statement-breakpoint
ALTER TABLE "investment_accounts" ADD COLUMN "last_synced_at" timestamp;--> statement-breakpoint
ALTER TABLE "depository_accounts" ADD CONSTRAINT "depository_accounts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_positions" ADD CONSTRAINT "investment_positions_investment_account_id_investment_accounts_id_fk" FOREIGN KEY ("investment_account_id") REFERENCES "public"."investment_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "depository_accounts_user_id_idx" ON "depository_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "depository_accounts_user_kind_idx" ON "depository_accounts" USING btree ("user_id","kind");--> statement-breakpoint
CREATE INDEX "investment_positions_investment_account_id_idx" ON "investment_positions" USING btree ("investment_account_id");--> statement-breakpoint
CREATE INDEX "investment_positions_symbol_idx" ON "investment_positions" USING btree ("symbol");--> statement-breakpoint
ALTER TABLE "brokerage_accounts" ADD CONSTRAINT "brokerage_accounts_investment_account_id_investment_accounts_id_fk" FOREIGN KEY ("investment_account_id") REFERENCES "public"."investment_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centralized_exchange_accounts" ADD CONSTRAINT "centralized_exchange_accounts_investment_account_id_investment_accounts_id_fk" FOREIGN KEY ("investment_account_id") REFERENCES "public"."investment_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evm_position_details" ADD CONSTRAINT "evm_position_details_position_id_investment_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."investment_positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_accounts" ADD CONSTRAINT "investment_accounts_id_user_id_unique" UNIQUE("id","user_id");--> statement-breakpoint
ALTER TABLE "evm_wallet_accounts" ADD CONSTRAINT "evm_wallet_accounts_investment_account_user_fk" FOREIGN KEY ("investment_account_id","user_id") REFERENCES "public"."investment_accounts"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_accounts" ADD CONSTRAINT "investment_accounts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hyper_core_accounts" ADD CONSTRAINT "hyper_core_accounts_investment_account_user_fk" FOREIGN KEY ("investment_account_id","user_id") REFERENCES "public"."investment_accounts"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hyper_core_position_details" ADD CONSTRAINT "hyper_core_position_details_position_id_investment_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."investment_positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "investment_accounts_user_id_idx" ON "investment_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "investment_accounts_user_kind_idx" ON "investment_accounts" USING btree ("user_id","kind");--> statement-breakpoint
DROP TYPE "public"."financial_account_sync_run_status";
