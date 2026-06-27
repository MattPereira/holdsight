ALTER TABLE "investment_transaction_journal_entries" DROP CONSTRAINT "investment_transaction_journal_entries_confidence_check";--> statement-breakpoint
-- Rescale existing 1-10 conviction scores onto the new 1-5 range. round() is
-- half-away-from-zero, so 1->1, 2->1, 3->2, ... 9->5, 10->5 (never 0).
UPDATE "investment_transaction_journal_entries" SET "confidence" = round("confidence" / 2.0)::int WHERE "confidence" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "investment_transaction_journal_entries" ADD CONSTRAINT "investment_transaction_journal_entries_confidence_check" CHECK ("investment_transaction_journal_entries"."confidence" is null or ("investment_transaction_journal_entries"."confidence" >= 1 and "investment_transaction_journal_entries"."confidence" <= 5));