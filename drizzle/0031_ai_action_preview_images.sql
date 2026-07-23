CREATE TABLE `ai_action_preview_images` (
  `action_id` text PRIMARY KEY NOT NULL REFERENCES `ai_action_proposals`(`id`) ON DELETE cascade,
  `image_id` text NOT NULL,
  `storage_key` text NOT NULL,
  `alt_text` text NOT NULL,
  `width` integer NOT NULL,
  `height` integer NOT NULL,
  `model` text NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_action_preview_images_image_id_unique` ON `ai_action_preview_images` (`image_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_action_preview_images_storage_key_unique` ON `ai_action_preview_images` (`storage_key`);
