CREATE TABLE `recipes` (
  `id` text PRIMARY KEY NOT NULL,
  `title` text NOT NULL,
  `summary` text NOT NULL,
  `servings` text NOT NULL,
  `prep_minutes` integer NOT NULL,
  `cook_minutes` integer NOT NULL,
  `source_name` text,
  `source_url` text,
  `created_by_profile_id` text NOT NULL REFERENCES `profiles`(`id`),
  `last_edited_by_profile_id` text NOT NULL REFERENCES `profiles`(`id`),
  `current_revision` integer NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recipe_tags` (
  `recipe_id` text NOT NULL REFERENCES `recipes`(`id`) ON DELETE CASCADE,
  `tag` text NOT NULL,
  PRIMARY KEY (`recipe_id`, `tag`)
);
--> statement-breakpoint
CREATE TABLE `recipe_ingredient_groups` (
  `id` text PRIMARY KEY NOT NULL,
  `recipe_id` text NOT NULL REFERENCES `recipes`(`id`) ON DELETE CASCADE,
  `position` integer NOT NULL,
  `name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recipe_ingredients` (
  `id` text PRIMARY KEY NOT NULL,
  `recipe_id` text NOT NULL REFERENCES `recipes`(`id`) ON DELETE CASCADE,
  `group_id` text NOT NULL REFERENCES `recipe_ingredient_groups`(`id`) ON DELETE CASCADE,
  `position` integer NOT NULL,
  `quantity` real,
  `unit` text NOT NULL,
  `item` text NOT NULL,
  `note` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recipe_instruction_sections` (
  `id` text PRIMARY KEY NOT NULL,
  `recipe_id` text NOT NULL REFERENCES `recipes`(`id`) ON DELETE CASCADE,
  `position` integer NOT NULL,
  `title` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recipe_steps` (
  `id` text PRIMARY KEY NOT NULL,
  `recipe_id` text NOT NULL REFERENCES `recipes`(`id`) ON DELETE CASCADE,
  `section_id` text NOT NULL REFERENCES `recipe_instruction_sections`(`id`) ON DELETE CASCADE,
  `position` integer NOT NULL,
  `body` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recipe_revisions` (
  `recipe_id` text NOT NULL REFERENCES `recipes`(`id`) ON DELETE CASCADE,
  `revision` integer NOT NULL,
  `snapshot` text NOT NULL,
  `edited_by_profile_id` text NOT NULL REFERENCES `profiles`(`id`),
  `created_at` integer NOT NULL,
  PRIMARY KEY (`recipe_id`, `revision`)
);
--> statement-breakpoint
CREATE INDEX `recipes_updated_at_idx` ON `recipes` (`updated_at`);
--> statement-breakpoint
CREATE INDEX `recipe_ingredients_recipe_idx` ON `recipe_ingredients` (`recipe_id`, `position`);
--> statement-breakpoint
CREATE INDEX `recipe_steps_recipe_idx` ON `recipe_steps` (`recipe_id`, `position`);
--> statement-breakpoint
CREATE VIRTUAL TABLE `recipe_search` USING fts5(
  recipe_id UNINDEXED,
  title,
  summary,
  ingredients,
  tags,
  tokenize = 'unicode61 remove_diacritics 2'
);
