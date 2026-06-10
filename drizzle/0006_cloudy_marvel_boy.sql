CREATE TABLE "hyper_core_balance_details" (
	"balance_id" uuid PRIMARY KEY NOT NULL,
	"balance_type" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investment_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investment_account_id" uuid NOT NULL,
	"source_balance_id" text,
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
ALTER TABLE "evm_position_details" DROP CONSTRAINT "evm_position_details_position_id_investment_positions_id_fk";
--> statement-breakpoint
ALTER TABLE "evm_position_details" RENAME TO "evm_balance_details";
--> statement-breakpoint
ALTER TABLE "evm_balance_details" RENAME COLUMN "position_id" TO "balance_id";
--> statement-breakpoint
ALTER TABLE "investment_positions" ALTER COLUMN "asset_class" SET DEFAULT 'derivative';
--> statement-breakpoint
ALTER TABLE "hyper_core_balance_details" ADD CONSTRAINT "hyper_core_balance_details_balance_id_investment_balances_id_fk" FOREIGN KEY ("balance_id") REFERENCES "public"."investment_balances"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "investment_balances" ADD CONSTRAINT "investment_balances_investment_account_id_investment_accounts_id_fk" FOREIGN KEY ("investment_account_id") REFERENCES "public"."investment_accounts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "investment_balances_investment_account_id_idx" ON "investment_balances" USING btree ("investment_account_id");
--> statement-breakpoint
CREATE INDEX "investment_balances_symbol_idx" ON "investment_balances" USING btree ("symbol");
--> statement-breakpoint
INSERT INTO "investment_balances" (
	"id",
	"investment_account_id",
	"source_balance_id",
	"symbol",
	"name",
	"asset_class",
	"amount",
	"price_usd",
	"value_usd",
	"as_of",
	"created_at"
)
SELECT
	"id",
	"investment_account_id",
	"source_position_id",
	"symbol",
	"name",
	"asset_class",
	"amount",
	"price_usd",
	"value_usd",
	"as_of",
	"created_at"
FROM "investment_positions"
WHERE "asset_class" <> 'derivative';
--> statement-breakpoint
INSERT INTO "hyper_core_balance_details" ("balance_id", "balance_type")
SELECT
	"id",
	CASE
		WHEN "source_balance_id" LIKE 'hypercore:staking:%' THEN 'staking'
		ELSE 'spot'
	END
FROM "investment_balances"
WHERE "source_balance_id" LIKE 'hypercore:%';
--> statement-breakpoint
DELETE FROM "investment_positions" WHERE "asset_class" <> 'derivative';
--> statement-breakpoint
ALTER TABLE "evm_balance_details" ADD CONSTRAINT "evm_balance_details_balance_id_investment_balances_id_fk" FOREIGN KEY ("balance_id") REFERENCES "public"."investment_balances"("id") ON DELETE cascade ON UPDATE no action;
