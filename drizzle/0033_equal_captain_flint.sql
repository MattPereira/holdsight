ALTER TABLE "asset_groups" ADD COLUMN "thesis_summary" text;--> statement-breakpoint
ALTER TABLE "asset_groups" ADD COLUMN "bull_case" text;--> statement-breakpoint
ALTER TABLE "asset_groups" ADD COLUMN "bear_case" text;--> statement-breakpoint
ALTER TABLE "asset_groups" ADD COLUMN "invalidation_criteria" text;--> statement-breakpoint
ALTER TABLE "asset_groups" ADD COLUMN "allocation_strategy_notes" text;--> statement-breakpoint
DO $$
DECLARE
	group_row record;
	line text;
	current_section text;
	thesis_summary_value text;
	bull_case_value text;
	bear_case_value text;
	invalidation_criteria_value text;
	allocation_strategy_notes_value text;
BEGIN
	FOR group_row IN
		SELECT "id", "thesis"
		FROM "asset_groups"
		WHERE "thesis" IS NOT NULL
	LOOP
		current_section := 'summary';
		thesis_summary_value := NULL;
		bull_case_value := NULL;
		bear_case_value := NULL;
		invalidation_criteria_value := NULL;
		allocation_strategy_notes_value := NULL;

		FOREACH line IN ARRAY regexp_split_to_array(
			replace(replace(group_row."thesis", E'\r\n', E'\n'), E'\r', E'\n'),
			E'\n'
		)
		LOOP
			IF line ~* '^[[:space:]]*#{1,6}[[:space:]]*thesis[[:space:]]*#*[[:space:]]*$' THEN
				current_section := 'summary';
			ELSIF line ~* '^[[:space:]]*#{1,6}[[:space:]]*bull case[[:space:]]*#*[[:space:]]*$' THEN
				current_section := 'bull_case';
			ELSIF line ~* '^[[:space:]]*#{1,6}[[:space:]]*bear case[[:space:]]*#*[[:space:]]*$' THEN
				current_section := 'bear_case';
			ELSIF line ~* '^[[:space:]]*#{1,6}[[:space:]]*invalidation criteria[[:space:]]*#*[[:space:]]*$' THEN
				current_section := 'invalidation_criteria';
			ELSIF line ~* '^[[:space:]]*#{1,6}[[:space:]]*allocation strategy[[:space:]]*#*[[:space:]]*$' THEN
				current_section := 'allocation_strategy_notes';
			ELSE
				CASE current_section
					WHEN 'summary' THEN
						thesis_summary_value := concat_ws(E'\n', thesis_summary_value, line);
					WHEN 'bull_case' THEN
						bull_case_value := concat_ws(E'\n', bull_case_value, line);
					WHEN 'bear_case' THEN
						bear_case_value := concat_ws(E'\n', bear_case_value, line);
					WHEN 'invalidation_criteria' THEN
						invalidation_criteria_value := concat_ws(E'\n', invalidation_criteria_value, line);
					WHEN 'allocation_strategy_notes' THEN
						allocation_strategy_notes_value := concat_ws(E'\n', allocation_strategy_notes_value, line);
				END CASE;
			END IF;
		END LOOP;

		UPDATE "asset_groups"
		SET
			"thesis_summary" = nullif(btrim(thesis_summary_value), ''),
			"bull_case" = nullif(btrim(bull_case_value), ''),
			"bear_case" = nullif(btrim(bear_case_value), ''),
			"invalidation_criteria" = nullif(btrim(invalidation_criteria_value), ''),
			"allocation_strategy_notes" = nullif(btrim(allocation_strategy_notes_value), '')
		WHERE "id" = group_row."id";
	END LOOP;
END $$;--> statement-breakpoint
ALTER TABLE "asset_groups" DROP COLUMN "thesis";
