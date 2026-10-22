ALTER TABLE kitchens ADD COLUMN is_primary integer NOT NULL DEFAULT 1;
--> statement-breakpoint
DROP INDEX kitchens_primary_household_idx;
--> statement-breakpoint
CREATE UNIQUE INDEX kitchens_primary_household_idx ON kitchens(household_id) WHERE is_primary = 1;
