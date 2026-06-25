ALTER TABLE "investment_transaction_syncs" ADD COLUMN "lease_token" text;--> statement-breakpoint
ALTER TABLE "investment_transaction_syncs" ADD COLUMN "lease_expires_at" timestamp;