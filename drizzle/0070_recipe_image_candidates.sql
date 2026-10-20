CREATE TABLE `recipe_image_candidates` (
  `id` text PRIMARY KEY NOT NULL,
  `recipe_id` text NOT NULL REFERENCES `recipes` (`id`) ON DELETE cascade,
  `source_revision` integer NOT NULL,
  `owner_user_id` text NOT NULL,
  `profile_id` text NOT NULL,
  `intent_hash` text NOT NULL,
  `status` text NOT NULL,
  `storage_key` text,
  `alt_text` text DEFAULT '' NOT NULL,
  `width` integer,
  `height` integer,
  `model` text NOT NULL,
  `quality` text NOT NULL,
  `size` text NOT NULL,
  `prompt_version` text NOT NULL,
  `audit_id` text NOT NULL,
  `accepted_image_id` text,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `recipe_image_candidate_owner` ON `recipe_image_candidates` (`owner_user_id`,`recipe_id`);
