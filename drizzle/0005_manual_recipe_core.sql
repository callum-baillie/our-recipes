ALTER TABLE `recipes` ADD `status` text NOT NULL DEFAULT 'active';
--> statement-breakpoint
ALTER TABLE `recipes` ADD `rest_minutes` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `recipes` ADD `difficulty` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `recipes` ADD `cuisine` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `recipes` ADD `category` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `recipes` ADD `tips` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `recipes` ADD `shared_notes` text NOT NULL DEFAULT '';
--> statement-breakpoint
CREATE INDEX `recipes_status_updated_at_idx` ON `recipes` (`status`, `updated_at`);
--> statement-breakpoint
CREATE INDEX `recipes_created_by_idx` ON `recipes` (`created_by_profile_id`);
