CREATE TYPE "public"."credit_account_status" AS ENUM('active', 'disabled', 'error');--> statement-breakpoint
CREATE TABLE "credit_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"plaid_item_id" uuid,
	"external_account_id" text,
	"label" text,
	"institution_name" text,
	"account_mask" text,
	"currency" text DEFAULT 'USD' NOT NULL,
	"current_balance" numeric(18, 2) NOT NULL,
	"available_credit" numeric(18, 2),
	"credit_limit" numeric(18, 2),
	"minimum_payment_amount" numeric(18, 2),
	"next_payment_due_date" date,
	"last_payment_amount" numeric(18, 2),
	"last_payment_date" date,
	"last_statement_issue_date" date,
	"last_statement_balance" numeric(18, 2),
	"is_overdue" boolean,
	"aprs" jsonb NOT NULL,
	"status" "credit_account_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "credit_accounts" ADD CONSTRAINT "credit_accounts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_accounts" ADD CONSTRAINT "credit_accounts_plaid_item_id_plaid_items_id_fk" FOREIGN KEY ("plaid_item_id") REFERENCES "public"."plaid_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "credit_accounts_user_external_account_id_idx" ON "credit_accounts" USING btree ("user_id","external_account_id");--> statement-breakpoint
CREATE INDEX "credit_accounts_user_id_idx" ON "credit_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "credit_accounts_plaid_item_id_idx" ON "credit_accounts" USING btree ("plaid_item_id");