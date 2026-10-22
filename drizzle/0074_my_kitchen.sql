CREATE TABLE kitchens (
 id text PRIMARY KEY NOT NULL,
 household_id text NOT NULL REFERENCES households(id) ON DELETE RESTRICT,
 name text NOT NULL,
 coverage text NOT NULL DEFAULT 'not-started',
 revision integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE UNIQUE INDEX kitchens_primary_household_idx ON kitchens(household_id);
--> statement-breakpoint
CREATE TABLE kitchen_equipment (
 id text PRIMARY KEY NOT NULL,
 kitchen_id text NOT NULL REFERENCES kitchens(id) ON DELETE RESTRICT,
 revision integer NOT NULL,
 data text NOT NULL
);
--> statement-breakpoint
CREATE TABLE kitchen_operations (
 id text PRIMARY KEY NOT NULL,
 kitchen_id text NOT NULL REFERENCES kitchens(id) ON DELETE RESTRICT,
 user_id text NOT NULL,
 profile_id text NOT NULL,
 intent_hash text NOT NULL,
 receipt text NOT NULL,
 snapshot text NOT NULL,
 created_at integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE kitchen_resource_claims (
 resource_id text PRIMARY KEY NOT NULL,
 kitchen_id text NOT NULL REFERENCES kitchens(id) ON DELETE RESTRICT,
 episode_id text NOT NULL,
 phase_id text NOT NULL,
 user_id text NOT NULL,
 started_at integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE ai_profile_settings ADD COLUMN share_kitchen_equipment integer NOT NULL DEFAULT false;

--> statement-breakpoint
ALTER TABLE recipes ADD COLUMN equipment_requirements text NOT NULL DEFAULT '[]';
