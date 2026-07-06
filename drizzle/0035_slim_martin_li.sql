CREATE TYPE "public"."journal_period_type" AS ENUM('daily', 'weekly', 'monthly');--> statement-breakpoint
CREATE TABLE "investment_journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"period_type" "journal_period_type" NOT NULL,
	"period_start" date NOT NULL,
	"plan" text,
	"reflection" text,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "investment_journal_entries_id_user_id_unique" UNIQUE("id","user_id"),
	CONSTRAINT "investment_journal_entries_plan_length_check" CHECK ("investment_journal_entries"."plan" is null or char_length("investment_journal_entries"."plan") <= 10000),
	CONSTRAINT "investment_journal_entries_reflection_length_check" CHECK ("investment_journal_entries"."reflection" is null or char_length("investment_journal_entries"."reflection") <= 10000)
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"home_timezone" text NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "investment_journal_entries" ADD CONSTRAINT "investment_journal_entries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "investment_journal_entries_period_unique" ON "investment_journal_entries" USING btree ("user_id","period_type","period_start");--> statement-breakpoint
CREATE INDEX "investment_journal_entries_period_lookup_idx" ON "investment_journal_entries" USING btree ("user_id","period_type","period_start");--> statement-breakpoint
CREATE INDEX "investment_journal_entries_recent_idx" ON "investment_journal_entries" USING btree ("user_id","period_type","updated_at");