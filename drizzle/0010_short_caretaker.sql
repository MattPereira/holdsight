CREATE TABLE "exchange_api_credentials" (
	"investment_account_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"exchange" text NOT NULL,
	"credentials_encrypted" text NOT NULL,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exchange_api_credentials" ADD CONSTRAINT "exchange_api_credentials_investment_account_user_fk" FOREIGN KEY ("investment_account_id","user_id") REFERENCES "public"."investment_accounts"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exchange_api_credentials_user_exchange_idx" ON "exchange_api_credentials" USING btree ("user_id","exchange");