CREATE TYPE "public"."trade_journal_emotion" AS ENUM('calm', 'confident', 'uncertain', 'fearful', 'greedy', 'fomo', 'frustrated', 'patient', 'impulsive', 'disciplined', 'stressed', 'excited', 'regretful', 'neutral');--> statement-breakpoint
CREATE TYPE "public"."trade_journal_reason" AS ENUM('risk_reduction', 'dip_buy', 'breakout_buy', 'take_profit', 'stop_loss', 'panic_sell', 'fomo', 'rebalance', 'thesis_change', 'cash_raise');--> statement-breakpoint
CREATE TABLE "investment_transaction_journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"note" text,
	"trade_reason" "trade_journal_reason",
	"emotions" "trade_journal_emotion"[] DEFAULT ARRAY[]::trade_journal_emotion[] NOT NULL,
	"confidence" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "investment_transaction_journal_entries_confidence_check" CHECK ("investment_transaction_journal_entries"."confidence" is null or ("investment_transaction_journal_entries"."confidence" >= 1 and "investment_transaction_journal_entries"."confidence" <= 10))
);
--> statement-breakpoint
ALTER TABLE "investment_transactions" ADD CONSTRAINT "investment_transactions_id_user_id_unique" UNIQUE("id","user_id");--> statement-breakpoint
ALTER TABLE "investment_transaction_journal_entries" ADD CONSTRAINT "investment_transaction_journal_entries_transaction_user_fk" FOREIGN KEY ("transaction_id","user_id") REFERENCES "public"."investment_transactions"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_transaction_journal_entries" ADD CONSTRAINT "investment_transaction_journal_entries_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "investment_transaction_journal_entries_transaction_unique" ON "investment_transaction_journal_entries" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "investment_transaction_journal_entries_user_created_at_idx" ON "investment_transaction_journal_entries" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "investment_transaction_journal_entries_transaction_created_at_idx" ON "investment_transaction_journal_entries" USING btree ("transaction_id","created_at");
