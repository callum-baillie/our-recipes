ALTER TABLE `pantry_products` ADD `restock_mode` text DEFAULT 'none' NOT NULL;
--> statement-breakpoint
ALTER TABLE `pantry_products` ADD `restock_trigger` text DEFAULT 'below_target' NOT NULL;
--> statement-breakpoint
ALTER TABLE `household_list_settings` ADD `automatic_restock_list_id` text;
--> statement-breakpoint
CREATE TABLE `shopping_policy_instances` (
	`id` text PRIMARY KEY NOT NULL,
	`list_id` text NOT NULL,
	`product_id` text NOT NULL,
	`shopping_list_item_id` text,
	`mode` text NOT NULL,
	`trigger` text NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`assumed_empty` integer DEFAULT false NOT NULL,
	`policy_quantity` real,
	`unit` text DEFAULT '' NOT NULL,
	`review_reason` text,
	`created_by_profile_id` text NOT NULL,
	`updated_by_profile_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`list_id`) REFERENCES `shopping_lists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `pantry_products`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`shopping_list_item_id`) REFERENCES `shopping_list_items`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by_profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shopping_policy_instances_list_product_idx` ON `shopping_policy_instances` (`list_id`,`product_id`);
--> statement-breakpoint
CREATE INDEX `shopping_policy_instances_product_state_idx` ON `shopping_policy_instances` (`product_id`,`state`);
--> statement-breakpoint
CREATE INDEX `shopping_policy_instances_item_idx` ON `shopping_policy_instances` (`shopping_list_item_id`);
--> statement-breakpoint
UPDATE `pantry_products`
SET `restock_mode` = 'always_have',
    `restock_trigger` = 'reorder_point'
WHERE `archived_at` IS NULL
  AND `is_staple` = 1
  AND `suggest_grocery_restock` = 1
  AND `target_stock` > 0
  AND `reorder_threshold` IS NOT NULL
  AND trim(`stock_unit`) <> '';
