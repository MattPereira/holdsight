CREATE TABLE "hyper_core_account_snapshots" (
	"sync_run_id" uuid PRIMARY KEY NOT NULL,
	"account_value" numeric(36, 18) NOT NULL,
	"total_margin_used" numeric(36, 18) NOT NULL,
	"total_ntl_pos" numeric(36, 18) NOT NULL,
	"total_raw_usd" numeric(36, 18) NOT NULL,
	"withdrawable" numeric(36, 18) NOT NULL,
	"source_time" timestamp,
	"raw" jsonb
);
--> statement-breakpoint
CREATE TABLE "hyper_core_position_details" (
	"position_id" uuid PRIMARY KEY NOT NULL,
	"market" text NOT NULL,
	"side" text NOT NULL,
	"signed_size" numeric(36, 18) NOT NULL,
	"entry_px" numeric(36, 18) NOT NULL,
	"liquidation_px" numeric(36, 18),
	"margin_used" numeric(36, 18) NOT NULL,
	"unrealized_pnl" numeric(36, 18) NOT NULL,
	"return_on_equity" numeric(36, 18),
	"leverage_type" text,
	"leverage_value" numeric(36, 18),
	"raw_leverage" jsonb
);
--> statement-breakpoint
ALTER TABLE "hyper_core_accounts" DROP CONSTRAINT "hyper_core_accounts_financial_account_id_financial_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "hyper_core_accounts" ADD COLUMN "user_id" uuid;--> statement-breakpoint
UPDATE "hyper_core_accounts"
SET "user_id" = "financial_accounts"."user_id"
FROM "financial_accounts"
WHERE "hyper_core_accounts"."financial_account_id" = "financial_accounts"."id";--> statement-breakpoint
ALTER TABLE "hyper_core_accounts" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "hyper_core_accounts" ALTER COLUMN "address" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "hyper_core_account_snapshots" ADD CONSTRAINT "hyper_core_account_snapshots_sync_run_id_financial_account_sync_runs_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."financial_account_sync_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hyper_core_position_details" ADD CONSTRAINT "hyper_core_position_details_position_id_financial_account_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."financial_account_positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hyper_core_accounts" ADD CONSTRAINT "hyper_core_accounts_financial_account_user_fk" FOREIGN KEY ("financial_account_id","user_id") REFERENCES "public"."financial_accounts"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hyper_core_accounts_user_address_idx" ON "hyper_core_accounts" USING btree ("user_id","address");--> statement-breakpoint
CREATE INDEX "hyper_core_accounts_address_idx" ON "hyper_core_accounts" USING btree ("address");
