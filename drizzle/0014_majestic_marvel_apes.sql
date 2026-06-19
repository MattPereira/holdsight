CREATE TABLE "agent_api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"scopes" text[] NOT NULL,
	"last_used_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_api_keys" ADD CONSTRAINT "agent_api_keys_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_api_keys_key_hash_idx" ON "agent_api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "agent_api_keys_user_id_idx" ON "agent_api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agent_api_keys_user_revoked_idx" ON "agent_api_keys" USING btree ("user_id","revoked_at");