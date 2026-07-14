CREATE TABLE `collections` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL UNIQUE,
  `description` text NOT NULL,
  `cover_image_id` text REFERENCES `recipe_images`(`id`) ON UPDATE no action ON DELETE set null,
  `position` integer NOT NULL,
  `created_by_profile_id` text NOT NULL REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
  `last_edited_by_profile_id` text NOT NULL REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `collection_recipes` (
  `collection_id` text NOT NULL REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade,
  `recipe_id` text NOT NULL REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
  `position` integer NOT NULL,
  `added_by_profile_id` text NOT NULL REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
  `added_at` integer NOT NULL,
  PRIMARY KEY(`collection_id`, `recipe_id`)
);
--> statement-breakpoint
CREATE INDEX `collections_position_idx` ON `collections` (`position`);
--> statement-breakpoint
CREATE INDEX `collection_recipes_recipe_id_idx` ON `collection_recipes` (`recipe_id`);
--> statement-breakpoint
CREATE INDEX `collection_recipes_collection_position_idx` ON `collection_recipes` (`collection_id`, `position`);
