UPDATE "plans" AS "plan"
SET "name" = left(
	coalesce(
		nullif(btrim("plan"."name"), ''),
		nullif(
			(
				SELECT string_agg("asset"."symbol", ' + ' ORDER BY "asset"."symbol")
				FROM "plan_assets" AS "asset"
				WHERE "asset"."plan_id" = "plan"."id"
			),
			''
		),
		'Untitled Plan'
	),
	40
);--> statement-breakpoint
ALTER TABLE "plans" ALTER COLUMN "name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "thesis" text;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "invalidation" text;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "entry" text;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "exit" text;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "timeframe" text;--> statement-breakpoint
ALTER TABLE "plans" DROP COLUMN "thesis_summary";--> statement-breakpoint
ALTER TABLE "plans" DROP COLUMN "bull_case";--> statement-breakpoint
ALTER TABLE "plans" DROP COLUMN "bear_case";--> statement-breakpoint
ALTER TABLE "plans" DROP COLUMN "invalidation_criteria";--> statement-breakpoint
ALTER TABLE "plans" DROP COLUMN "allocation_strategy_notes";
