CREATE TABLE "hyper_core_perp_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"investment_account_id" uuid NOT NULL,
	"source_event_id" text NOT NULL,
	"source_transaction_ids" jsonb NOT NULL,
	"executed_at" timestamp NOT NULL,
	"market" text NOT NULL,
	"position_side" text NOT NULL,
	"event_type" text NOT NULL,
	"base_asset_symbol" text NOT NULL,
	"base_amount" numeric(36, 18) NOT NULL,
	"entry_notional_usd" numeric(36, 18),
	"exit_notional_usd" numeric(36, 18),
	"entry_price" numeric(36, 18),
	"exit_price" numeric(36, 18),
	"gross_pnl_usd" numeric(36, 18),
	"fee_usd" numeric(36, 18),
	"net_pnl_usd" numeric(36, 18),
	"raw" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hyper_core_perp_events" ADD CONSTRAINT "hyper_core_perp_events_investment_account_user_fk" FOREIGN KEY ("investment_account_id","user_id") REFERENCES "public"."investment_accounts"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hyper_core_perp_events" ADD CONSTRAINT "hyper_core_perp_events_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hyper_core_perp_events_source_unique" ON "hyper_core_perp_events" USING btree ("investment_account_id","source_event_id");--> statement-breakpoint
CREATE INDEX "hyper_core_perp_events_user_executed_at_idx" ON "hyper_core_perp_events" USING btree ("user_id","executed_at");--> statement-breakpoint
CREATE INDEX "hyper_core_perp_events_account_executed_at_idx" ON "hyper_core_perp_events" USING btree ("investment_account_id","executed_at");--> statement-breakpoint
CREATE INDEX "hyper_core_perp_events_market_idx" ON "hyper_core_perp_events" USING btree ("market");