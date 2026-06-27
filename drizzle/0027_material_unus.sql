CREATE TABLE "blob_deletion_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blob_pathname" text NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp DEFAULT now() NOT NULL,
	"lease_token" uuid,
	"lease_expires_at" timestamp,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "blob_deletion_jobs_attempt_count_check" CHECK ("blob_deletion_jobs"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "blob_deletion_jobs_blob_pathname_unique" ON "blob_deletion_jobs" USING btree ("blob_pathname");--> statement-breakpoint
CREATE INDEX "blob_deletion_jobs_pending_idx" ON "blob_deletion_jobs" USING btree ("next_attempt_at","lease_expires_at");--> statement-breakpoint
CREATE FUNCTION "enqueue_journal_image_blob_deletion"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	INSERT INTO "blob_deletion_jobs" ("blob_pathname")
	VALUES (OLD."blob_pathname")
	ON CONFLICT ("blob_pathname") DO NOTHING;

	RETURN OLD;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "investment_transaction_journal_entry_images_enqueue_blob_deletion"
BEFORE DELETE ON "investment_transaction_journal_entry_images"
FOR EACH ROW
EXECUTE FUNCTION "enqueue_journal_image_blob_deletion"();
