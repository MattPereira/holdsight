CREATE TABLE "investment_transaction_journal_entry_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"journal_entry_id" uuid NOT NULL,
	"blob_pathname" text NOT NULL,
	"blob_url" text NOT NULL,
	"original_filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "investment_transaction_journal_entry_images_size_bytes_check" CHECK ("investment_transaction_journal_entry_images"."size_bytes" > 0),
	CONSTRAINT "investment_transaction_journal_entry_images_sort_order_check" CHECK ("investment_transaction_journal_entry_images"."sort_order" >= 0)
);
--> statement-breakpoint
ALTER TABLE "investment_transaction_journal_entries" ADD CONSTRAINT "investment_transaction_journal_entries_id_user_id_unique" UNIQUE("id","user_id");--> statement-breakpoint
ALTER TABLE "investment_transaction_journal_entry_images" ADD CONSTRAINT "investment_transaction_journal_entry_images_entry_user_fk" FOREIGN KEY ("journal_entry_id","user_id") REFERENCES "public"."investment_transaction_journal_entries"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_transaction_journal_entry_images" ADD CONSTRAINT "investment_transaction_journal_entry_images_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "investment_transaction_journal_entry_images_blob_pathname_unique" ON "investment_transaction_journal_entry_images" USING btree ("blob_pathname");--> statement-breakpoint
CREATE UNIQUE INDEX "investment_transaction_journal_entry_images_blob_url_unique" ON "investment_transaction_journal_entry_images" USING btree ("blob_url");--> statement-breakpoint
CREATE INDEX "investment_transaction_journal_entry_images_entry_sort_order_idx" ON "investment_transaction_journal_entry_images" USING btree ("journal_entry_id","sort_order");
