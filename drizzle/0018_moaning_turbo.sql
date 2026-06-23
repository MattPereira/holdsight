UPDATE "investment_transaction_syncs"
SET "checkpoint" = "cursor"::jsonb
WHERE "cursor" IS NOT NULL AND "checkpoint" IS NULL;--> statement-breakpoint
ALTER TABLE "investment_transaction_syncs" DROP COLUMN "cursor";
