ALTER TYPE "public"."depository_account_kind" ADD VALUE 'savings';--> statement-breakpoint
ALTER TABLE "depository_accounts" ADD COLUMN "plaid_item_id" uuid;--> statement-breakpoint
ALTER TABLE "depository_accounts" ADD COLUMN "external_account_id" text;--> statement-breakpoint
ALTER TABLE "depository_accounts" ADD CONSTRAINT "depository_accounts_plaid_item_id_plaid_items_id_fk" FOREIGN KEY ("plaid_item_id") REFERENCES "public"."plaid_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "depository_accounts_plaid_item_id_idx" ON "depository_accounts" USING btree ("plaid_item_id");