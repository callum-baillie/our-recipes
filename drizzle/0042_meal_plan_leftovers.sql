CREATE TABLE `meal_plan_leftover_links` (
  `id` text PRIMARY KEY NOT NULL,
  `source_entry_id` text NOT NULL REFERENCES `meal_plan_entries`(`id`) ON DELETE CASCADE,
  `destination_entry_id` text NOT NULL REFERENCES `meal_plan_entries`(`id`) ON DELETE CASCADE,
  `servings` real NOT NULL,
  `created_by_profile_id` text NOT NULL REFERENCES `profiles`(`id`) ON DELETE RESTRICT,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meal_plan_leftover_destination_idx` ON `meal_plan_leftover_links` (`destination_entry_id`);
--> statement-breakpoint
CREATE INDEX `meal_plan_leftover_source_idx` ON `meal_plan_leftover_links` (`source_entry_id`);
