CREATE TABLE `ai_operation_audits` (
  `id` text PRIMARY KEY NOT NULL,
  `kind` text NOT NULL,
  `status` text NOT NULL,
  `source_digest` text NOT NULL,
  `source_label` text NOT NULL,
  `provider` text NOT NULL,
  `model` text NOT NULL,
  `profile_id` text NOT NULL REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
  `recipe_id` text REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE set null,
  `import_id` text REFERENCES `import_operations`(`id`) ON UPDATE no action ON DELETE set null,
  `generated_image_id` text REFERENCES `recipe_images`(`id`) ON UPDATE no action ON DELETE set null,
  `created_at` integer NOT NULL,
  `completed_at` integer
);
--> statement-breakpoint
CREATE INDEX `ai_operation_audits_profile_created_idx` ON `ai_operation_audits` (`profile_id`,`created_at`);
