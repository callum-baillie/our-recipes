CREATE TABLE `import_operations` (
  `id` text PRIMARY KEY NOT NULL,
  `kind` text NOT NULL,
  `status` text NOT NULL,
  `source_name` text NOT NULL,
  `storage_key` text NOT NULL UNIQUE,
  `media_type` text NOT NULL,
  `source_sha256` text NOT NULL,
  `extraction_method` text NOT NULL,
  `extracted_text` text NOT NULL,
  `warnings` text NOT NULL,
  `created_by_profile_id` text NOT NULL REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
  `confirmed_by_profile_id` text REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
  `confirmed_recipe_id` text REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE set null,
  `created_at` integer NOT NULL,
  `confirmed_at` integer
);
--> statement-breakpoint
CREATE INDEX `import_operations_created_at_idx` ON `import_operations` (`created_at`);
--> statement-breakpoint
CREATE INDEX `import_operations_created_by_idx` ON `import_operations` (`created_by_profile_id`);
