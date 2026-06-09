CREATE TABLE "asset_group_members" (
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	CONSTRAINT "asset_group_members_group_id_symbol_pk" PRIMARY KEY("group_id","symbol")
);
--> statement-breakpoint
CREATE TABLE "asset_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "asset_groups_id_user_id_unique" UNIQUE("id","user_id")
);
--> statement-breakpoint
ALTER TABLE "asset_group_members" ADD CONSTRAINT "asset_group_members_group_id_asset_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."asset_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_group_members" ADD CONSTRAINT "asset_group_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_groups" ADD CONSTRAINT "asset_groups_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "asset_group_members_user_symbol_idx" ON "asset_group_members" USING btree ("user_id","symbol");--> statement-breakpoint
CREATE INDEX "asset_group_members_group_id_idx" ON "asset_group_members" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "asset_groups_user_id_idx" ON "asset_groups" USING btree ("user_id");