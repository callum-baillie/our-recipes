CREATE TABLE `recipe_images` (
  `id` text PRIMARY KEY NOT NULL,
  `recipe_id` text NOT NULL REFERENCES `recipes`(`id`) ON DELETE CASCADE,
  `storage_key` text NOT NULL UNIQUE,
  `alt_text` text NOT NULL,
  `width` integer NOT NULL,
  `height` integer NOT NULL,
  `created_by_profile_id` text NOT NULL REFERENCES `profiles`(`id`),
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `recipe_images_recipe_created_idx` ON `recipe_images` (`recipe_id`, `created_at`);
