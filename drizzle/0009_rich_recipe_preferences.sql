ALTER TABLE `recipes` ADD `original_author` text;
--> statement-breakpoint
ALTER TABLE `recipes` ADD `cooking_method` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `recipes` ADD `nutrition_calories` real;
--> statement-breakpoint
ALTER TABLE `recipes` ADD `nutrition_protein_grams` real;
--> statement-breakpoint
ALTER TABLE `recipes` ADD `nutrition_carbohydrate_grams` real;
--> statement-breakpoint
ALTER TABLE `recipes` ADD `nutrition_fat_grams` real;
--> statement-breakpoint
ALTER TABLE `recipes` ADD `nutrition_fiber_grams` real;
--> statement-breakpoint
CREATE TABLE `recipe_equipment` (
  `id` text PRIMARY KEY NOT NULL,
  `recipe_id` text NOT NULL REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
  `position` integer NOT NULL,
  `name` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `recipe_equipment_recipe_position_idx` ON `recipe_equipment` (`recipe_id`, `position`);
--> statement-breakpoint
CREATE TABLE `recipe_profile_preferences` (
  `profile_id` text NOT NULL REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
  `recipe_id` text NOT NULL REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
  `rating` integer,
  `note` text NOT NULL DEFAULT '',
  `updated_at` integer NOT NULL,
  PRIMARY KEY(`profile_id`, `recipe_id`),
  CHECK (`rating` IS NULL OR (`rating` >= 1 AND `rating` <= 5))
);
--> statement-breakpoint
CREATE INDEX `recipe_profile_preferences_recipe_idx` ON `recipe_profile_preferences` (`recipe_id`);
