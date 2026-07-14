CREATE TABLE `__new_meal_plan_entries` (
  `id` text PRIMARY KEY NOT NULL,
  `planned_for` text NOT NULL,
  `meal` text NOT NULL,
  `recipe_id` text REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE CASCADE,
  `title` text NOT NULL DEFAULT '',
  `servings` integer NOT NULL,
  `note` text NOT NULL,
  `created_by_profile_id` text NOT NULL REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
  `updated_by_profile_id` text NOT NULL REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_meal_plan_entries` (`id`, `planned_for`, `meal`, `recipe_id`, `title`, `servings`, `note`, `created_by_profile_id`, `updated_by_profile_id`, `created_at`, `updated_at`)
SELECT `id`, `planned_for`, `meal`, `recipe_id`, '', `servings`, `note`, `created_by_profile_id`, `updated_by_profile_id`, `created_at`, `updated_at` FROM `meal_plan_entries`;
--> statement-breakpoint
DROP TABLE `meal_plan_entries`;
--> statement-breakpoint
ALTER TABLE `__new_meal_plan_entries` RENAME TO `meal_plan_entries`;
--> statement-breakpoint
CREATE INDEX `meal_plan_entries_date_idx` ON `meal_plan_entries` (`planned_for`, `meal`);
--> statement-breakpoint
CREATE TABLE `shopping_aisles` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL UNIQUE,
  `position` integer NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `shopping_list_items` ADD `aisle_id` text REFERENCES `shopping_aisles`(`id`) ON UPDATE no action ON DELETE set null;
--> statement-breakpoint
CREATE INDEX `shopping_aisles_position_idx` ON `shopping_aisles` (`position`);
--> statement-breakpoint
CREATE INDEX `shopping_list_items_aisle_idx` ON `shopping_list_items` (`aisle_id`);
