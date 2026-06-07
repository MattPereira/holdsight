CREATE TYPE "public"."asset_class" AS ENUM('crypto', 'token', 'cash', 'stock', 'etf', 'derivative', 'other');--> statement-breakpoint
CREATE TYPE "public"."financial_account_kind" AS ENUM('evm_wallet', 'hyper_core', 'centralized_exchange', 'brokerage', 'bank');--> statement-breakpoint
CREATE TYPE "public"."financial_account_status" AS ENUM('active', 'disabled', 'error');--> statement-breakpoint
CREATE TYPE "public"."financial_account_sync_run_status" AS ENUM('success', 'indexing', 'rate_limited', 'error');--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"financial_account_id" uuid PRIMARY KEY NOT NULL,
	"bank" text NOT NULL,
	"external_account_id" text
);
--> statement-breakpoint
CREATE TABLE "brokerage_accounts" (
	"financial_account_id" uuid PRIMARY KEY NOT NULL,
	"brokerage" text NOT NULL,
	"external_account_id" text
);
--> statement-breakpoint
CREATE TABLE "centralized_exchange_accounts" (
	"financial_account_id" uuid PRIMARY KEY NOT NULL,
	"exchange" text NOT NULL,
	"external_account_id" text
);
--> statement-breakpoint
CREATE TABLE "evm_position_details" (
	"position_id" uuid PRIMARY KEY NOT NULL,
	"chain_id" text NOT NULL,
	"contract_address" text
);
--> statement-breakpoint
CREATE TABLE "evm_wallet_accounts" (
	"financial_account_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"address" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_account_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sync_run_id" uuid NOT NULL,
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
CREATE TABLE "financial_account_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"financial_account_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"status" "financial_account_sync_run_status" NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"http_status" integer,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "financial_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "financial_account_kind" NOT NULL,
	"provider" text NOT NULL,
	"label" text,
	"status" "financial_account_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "financial_accounts_id_user_id_unique" UNIQUE("id","user_id")
);
--> statement-breakpoint
CREATE TABLE "hyper_core_accounts" (
	"financial_account_id" uuid PRIMARY KEY NOT NULL,
	"external_account_id" text,
	"address" text
);
--> statement-breakpoint
ALTER TABLE "account" DROP CONSTRAINT "account_user_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "session" DROP CONSTRAINT "session_user_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "id" SET DATA TYPE uuid USING "id"::uuid;--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "user_id" SET DATA TYPE uuid USING "user_id"::uuid;--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "id" SET DATA TYPE uuid USING "id"::uuid;--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "user_id" SET DATA TYPE uuid USING "user_id"::uuid;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "id" SET DATA TYPE uuid USING "id"::uuid;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "id" SET DATA TYPE uuid USING "id"::uuid;--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_financial_account_id_financial_accounts_id_fk" FOREIGN KEY ("financial_account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brokerage_accounts" ADD CONSTRAINT "brokerage_accounts_financial_account_id_financial_accounts_id_fk" FOREIGN KEY ("financial_account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centralized_exchange_accounts" ADD CONSTRAINT "centralized_exchange_accounts_financial_account_id_financial_accounts_id_fk" FOREIGN KEY ("financial_account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evm_position_details" ADD CONSTRAINT "evm_position_details_position_id_financial_account_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."financial_account_positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evm_wallet_accounts" ADD CONSTRAINT "evm_wallet_accounts_financial_account_user_fk" FOREIGN KEY ("financial_account_id","user_id") REFERENCES "public"."financial_accounts"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_account_positions" ADD CONSTRAINT "financial_account_positions_sync_run_id_financial_account_sync_runs_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."financial_account_sync_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_account_sync_runs" ADD CONSTRAINT "financial_account_sync_runs_financial_account_id_financial_accounts_id_fk" FOREIGN KEY ("financial_account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hyper_core_accounts" ADD CONSTRAINT "hyper_core_accounts_financial_account_id_financial_accounts_id_fk" FOREIGN KEY ("financial_account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bank_accounts_bank_idx" ON "bank_accounts" USING btree ("bank");--> statement-breakpoint
CREATE INDEX "brokerage_accounts_brokerage_idx" ON "brokerage_accounts" USING btree ("brokerage");--> statement-breakpoint
CREATE INDEX "centralized_exchange_accounts_exchange_idx" ON "centralized_exchange_accounts" USING btree ("exchange");--> statement-breakpoint
CREATE UNIQUE INDEX "evm_wallet_accounts_user_address_idx" ON "evm_wallet_accounts" USING btree ("user_id","address");--> statement-breakpoint
CREATE INDEX "evm_wallet_accounts_address_idx" ON "evm_wallet_accounts" USING btree ("address");--> statement-breakpoint
CREATE INDEX "financial_account_positions_sync_run_id_idx" ON "financial_account_positions" USING btree ("sync_run_id");--> statement-breakpoint
CREATE INDEX "financial_account_positions_symbol_idx" ON "financial_account_positions" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "financial_account_sync_runs_financial_account_id_idx" ON "financial_account_sync_runs" USING btree ("financial_account_id");--> statement-breakpoint
CREATE INDEX "financial_account_sync_runs_latest_success_idx" ON "financial_account_sync_runs" USING btree ("financial_account_id","status","finished_at");--> statement-breakpoint
CREATE INDEX "financial_accounts_user_id_idx" ON "financial_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "financial_accounts_user_kind_idx" ON "financial_accounts" USING btree ("user_id","kind");
