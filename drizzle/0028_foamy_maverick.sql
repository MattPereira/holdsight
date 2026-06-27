ALTER TABLE "investment_transaction_journal_entries" ALTER COLUMN "emotions" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "investment_transaction_journal_entries" ALTER COLUMN "trade_reason" SET DATA TYPE text USING "trade_reason"::text;--> statement-breakpoint
ALTER TABLE "investment_transaction_journal_entries" ALTER COLUMN "emotions" SET DATA TYPE text[] USING "emotions"::text[];--> statement-breakpoint
ALTER TABLE "investment_transaction_journal_entries" ALTER COLUMN "emotions" SET DEFAULT ARRAY[]::text[];--> statement-breakpoint
DROP TYPE "public"."trade_journal_emotion";--> statement-breakpoint
DROP TYPE "public"."trade_journal_reason";
