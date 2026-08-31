ALTER TABLE "asset_group_members" RENAME TO "plan_assets";--> statement-breakpoint
ALTER TABLE "asset_groups" RENAME TO "plans";--> statement-breakpoint
ALTER TABLE "plan_assets" RENAME COLUMN "group_id" TO "plan_id";--> statement-breakpoint
ALTER TABLE "plans" DROP CONSTRAINT "asset_groups_id_user_id_unique";--> statement-breakpoint
ALTER TABLE "plans" DROP CONSTRAINT "asset_groups_target_allocation_percent_check";--> statement-breakpoint
ALTER TABLE "plan_assets" DROP CONSTRAINT "asset_group_members_group_id_asset_groups_id_fk";
--> statement-breakpoint
ALTER TABLE "plan_assets" DROP CONSTRAINT "asset_group_members_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "plans" DROP CONSTRAINT "asset_groups_user_id_user_id_fk";
--> statement-breakpoint
DROP INDEX "asset_group_members_user_symbol_idx";--> statement-breakpoint
DROP INDEX "asset_group_members_group_id_idx";--> statement-breakpoint
DROP INDEX "asset_groups_user_id_idx";--> statement-breakpoint
ALTER TABLE "plan_assets" DROP CONSTRAINT "asset_group_members_group_id_symbol_pk";--> statement-breakpoint
ALTER TABLE "plan_assets" ADD CONSTRAINT "plan_assets_plan_id_symbol_pk" PRIMARY KEY("plan_id","symbol");--> statement-breakpoint
ALTER TABLE "plan_assets" ADD CONSTRAINT "plan_assets_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_assets" ADD CONSTRAINT "plan_assets_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "plan_assets_user_symbol_idx" ON "plan_assets" USING btree ("user_id","symbol");--> statement-breakpoint
CREATE INDEX "plan_assets_plan_id_idx" ON "plan_assets" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "plans_user_id_idx" ON "plans" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_id_user_id_unique" UNIQUE("id","user_id");--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_target_allocation_percent_check" CHECK ("plans"."target_allocation_percent" is null or ("plans"."target_allocation_percent" >= 0 and "plans"."target_allocation_percent" <= 100));