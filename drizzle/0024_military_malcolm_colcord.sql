CREATE TYPE "public"."brokerage_connection_status" AS ENUM('active', 'login_required', 'error', 'disabled');--> statement-breakpoint
CREATE TABLE "brokerage_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_connection_id" text NOT NULL,
	"access_token_encrypted" text NOT NULL,
	"refresh_token_encrypted" text,
	"token_expires_at" timestamp,
	"institution_id" text,
	"institution_name" text,
	"status" "brokerage_connection_status" DEFAULT 'active' NOT NULL,
	"last_synced_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brokerage_accounts" ADD COLUMN "brokerage_connection_id" uuid;--> statement-breakpoint
ALTER TABLE "brokerage_connections" ADD CONSTRAINT "brokerage_connections_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "brokerage_connections_user_provider_external_idx" ON "brokerage_connections" USING btree ("user_id","provider","external_connection_id");--> statement-breakpoint
CREATE INDEX "brokerage_connections_user_id_idx" ON "brokerage_connections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "brokerage_connections_provider_idx" ON "brokerage_connections" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "brokerage_connections_status_idx" ON "brokerage_connections" USING btree ("status");--> statement-breakpoint
INSERT INTO "brokerage_connections" (
	"user_id",
	"provider",
	"external_connection_id",
	"access_token_encrypted",
	"institution_id",
	"institution_name",
	"status",
	"last_synced_at",
	"metadata",
	"created_at",
	"updated_at"
)
SELECT
	"plaid_items"."user_id",
	'plaid',
	"plaid_items"."item_id",
	"plaid_items"."access_token_encrypted",
	"plaid_items"."institution_id",
	"plaid_items"."institution_name",
	"plaid_items"."status"::text::"brokerage_connection_status",
	"plaid_items"."last_synced_at",
	jsonb_build_object('plaidItemId', "plaid_items"."id"),
	"plaid_items"."created_at",
	"plaid_items"."updated_at"
FROM "plaid_items"
WHERE EXISTS (
	SELECT 1
	FROM "brokerage_accounts"
	WHERE "brokerage_accounts"."plaid_item_id" = "plaid_items"."id"
)
ON CONFLICT ("user_id", "provider", "external_connection_id") DO UPDATE SET
	"access_token_encrypted" = excluded."access_token_encrypted",
	"institution_id" = excluded."institution_id",
	"institution_name" = excluded."institution_name",
	"status" = excluded."status",
	"last_synced_at" = excluded."last_synced_at",
	"metadata" = excluded."metadata",
	"updated_at" = excluded."updated_at";--> statement-breakpoint
UPDATE "brokerage_accounts"
SET "brokerage_connection_id" = "brokerage_connections"."id"
FROM "plaid_items", "brokerage_connections"
WHERE
	"brokerage_accounts"."plaid_item_id" = "plaid_items"."id"
	AND "brokerage_connections"."user_id" = "plaid_items"."user_id"
	AND "brokerage_connections"."provider" = 'plaid'
	AND "brokerage_connections"."external_connection_id" = "plaid_items"."item_id";--> statement-breakpoint
ALTER TABLE "brokerage_accounts" ADD CONSTRAINT "brokerage_accounts_brokerage_connection_id_brokerage_connections_id_fk" FOREIGN KEY ("brokerage_connection_id") REFERENCES "public"."brokerage_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brokerage_accounts_connection_id_idx" ON "brokerage_accounts" USING btree ("brokerage_connection_id");
