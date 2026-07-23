ALTER TABLE `shopping_lists` ADD `source_mode` text DEFAULT 'manual' NOT NULL;
--> statement-breakpoint
ALTER TABLE `shopping_lists` ADD `source_key` text;
--> statement-breakpoint
ALTER TABLE `shopping_lists` ADD `archived_at` integer;
--> statement-breakpoint
CREATE UNIQUE INDEX `shopping_lists_source_key_unique` ON `shopping_lists` (`source_key`);
