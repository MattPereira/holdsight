ALTER TYPE "public"."investment_account_kind" ADD VALUE 'lighter' BEFORE 'centralized_exchange';--> statement-breakpoint
CREATE TABLE "lighter_accounts" (
	"investment_account_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"evm_investment_account_id" uuid NOT NULL,
	"account_index" integer NOT NULL,
	"address" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lighter_credentials" (
	"investment_account_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"read_only_token_encrypted" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lighter_accounts" ADD CONSTRAINT "lighter_accounts_investment_account_user_fk" FOREIGN KEY ("investment_account_id","user_id") REFERENCES "public"."investment_accounts"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lighter_accounts" ADD CONSTRAINT "lighter_accounts_evm_account_user_fk" FOREIGN KEY ("evm_investment_account_id","user_id") REFERENCES "public"."investment_accounts"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lighter_credentials" ADD CONSTRAINT "lighter_credentials_investment_account_user_fk" FOREIGN KEY ("investment_account_id","user_id") REFERENCES "public"."investment_accounts"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lighter_accounts_user_account_index_idx" ON "lighter_accounts" USING btree ("user_id","account_index");--> statement-breakpoint
CREATE INDEX "lighter_accounts_evm_account_idx" ON "lighter_accounts" USING btree ("evm_investment_account_id");