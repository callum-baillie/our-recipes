ALTER TABLE `pantry_shopping_item_details` ADD `generation_mode` text DEFAULT 'missing' NOT NULL;
--> statement-breakpoint
ALTER TABLE `pantry_shopping_item_details` ADD `coverage_state` text DEFAULT 'active' NOT NULL;
--> statement-breakpoint
ALTER TABLE `pantry_shopping_item_details` ADD `manual_extra_quantity` real DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `pantry_shopping_item_details` ADD `manual_extra_unit` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `pantry_shopping_item_details` ADD `covered_quantity` real DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `pantry_shopping_item_details` ADD `covered_unit` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `pantry_shopping_item_details` ADD `purchased_quantity` real DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `pantry_shopping_item_details` ADD `purchased_unit` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `pantry_shopping_item_details` ADD `control_note` text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE INDEX `pantry_shopping_details_coverage_idx` ON `pantry_shopping_item_details` (`coverage_state`);
