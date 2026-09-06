CREATE TYPE "public"."access_role" AS ENUM('admin', 'member');--> statement-breakpoint
CREATE TABLE "access_grants" (
	"email" text PRIMARY KEY NOT NULL,
	"role" "access_role" DEFAULT 'member' NOT NULL,
	CONSTRAINT "access_grants_email_normalized_check" CHECK ("access_grants"."email" = lower(btrim("access_grants"."email")) and char_length("access_grants"."email") > 0)
);
