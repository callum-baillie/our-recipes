ALTER TABLE `meal_plan_entries` ADD `status` text DEFAULT 'planned' NOT NULL;
--> statement-breakpoint
CREATE INDEX `meal_plan_entries_status_idx` ON `meal_plan_entries` (`status`);
