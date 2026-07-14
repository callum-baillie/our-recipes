CREATE TABLE `recipe_favorites` (
  `profile_id` text NOT NULL REFERENCES `profiles`(`id`) ON DELETE CASCADE,
  `recipe_id` text NOT NULL REFERENCES `recipes`(`id`) ON DELETE CASCADE,
  `created_at` integer NOT NULL,
  PRIMARY KEY (`profile_id`, `recipe_id`)
);
--> statement-breakpoint
CREATE TABLE `cook_sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `recipe_id` text NOT NULL REFERENCES `recipes`(`id`) ON DELETE CASCADE,
  `profile_id` text NOT NULL REFERENCES `profiles`(`id`) ON DELETE CASCADE,
  `target_servings` integer NOT NULL,
  `started_at` integer NOT NULL,
  `completed_at` integer
);
--> statement-breakpoint
CREATE INDEX `cook_sessions_profile_idx` ON `cook_sessions` (`profile_id`, `completed_at`);
