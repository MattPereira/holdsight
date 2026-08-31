ALTER TABLE "plan_assets" DROP CONSTRAINT "plan_assets_plan_id_plans_id_fk";
--> statement-breakpoint
ALTER TABLE "plan_assets" ADD CONSTRAINT "plan_assets_plan_user_fk" FOREIGN KEY ("plan_id","user_id") REFERENCES "public"."plans"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_name_length_check" CHECK (char_length("plans"."name") between 1 and 40);