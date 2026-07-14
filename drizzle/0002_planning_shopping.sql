CREATE TABLE `meal_plan_entries` (
  `id` text PRIMARY KEY NOT NULL,
  `planned_for` text NOT NULL,
  `meal` text NOT NULL,
  `recipe_id` text NOT NULL REFERENCES `recipes`(`id`) ON DELETE CASCADE,
  `servings` integer NOT NULL,
  `note` text NOT NULL,
  `created_by_profile_id` text NOT NULL REFERENCES `profiles`(`id`),
  `updated_by_profile_id` text NOT NULL REFERENCES `profiles`(`id`),
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `meal_plan_entries_date_idx` ON `meal_plan_entries` (`planned_for`, `meal`);
--> statement-breakpoint
CREATE TABLE `shopping_lists` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `week_start` text NOT NULL,
  `week_end` text NOT NULL,
  `created_by_profile_id` text NOT NULL REFERENCES `profiles`(`id`),
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shopping_list_items` (
  `id` text PRIMARY KEY NOT NULL,
  `list_id` text NOT NULL REFERENCES `shopping_lists`(`id`) ON DELETE CASCADE,
  `position` integer NOT NULL,
  `quantity` real,
  `unit` text NOT NULL,
  `item` text NOT NULL,
  `note` text NOT NULL,
  `checked` integer NOT NULL DEFAULT false,
  `source_recipe_ids` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `shopping_list_items_position_idx` ON `shopping_list_items` (`list_id`, `position`);
