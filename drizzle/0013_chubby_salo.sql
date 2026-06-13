CREATE TYPE "public"."manual_balance_item_kind" AS ENUM('asset', 'liability');--> statement-breakpoint
CREATE TABLE "manual_balance_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "manual_balance_item_kind" NOT NULL,
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "manual_balance_items" ADD CONSTRAINT "manual_balance_items_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "manual_balance_items_user_id_idx" ON "manual_balance_items" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "manual_balance_items_user_kind_idx" ON "manual_balance_items" USING btree ("user_id","kind");