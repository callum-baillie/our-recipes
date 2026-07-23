CREATE TABLE `household_experience_settings` (
	`household_id` text PRIMARY KEY NOT NULL,
	`recipe_default_sort` text DEFAULT 'recently-updated' NOT NULL,
	`recipe_default_servings` integer DEFAULT 4 NOT NULL,
	`meal_plan_week_starts_on` integer DEFAULT 1 NOT NULL,
	`meal_plan_default_duration` integer DEFAULT 7 NOT NULL,
	`meal_plan_default_meal_types` text DEFAULT '["breakfast","lunch","dinner"]' NOT NULL,
	`pantry_default_view` text DEFAULT 'all' NOT NULL,
	`pantry_default_sort` text DEFAULT 'expiry' NOT NULL,
	`pantry_default_group` text DEFAULT 'location' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_by_profile_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by_profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
