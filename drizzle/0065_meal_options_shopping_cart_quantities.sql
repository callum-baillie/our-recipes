ALTER TABLE `meal_plan_entries` ADD `options` text NOT NULL DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE `shopping_list_items` ADD `cart_quantity` real NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `shopping_list_items` ADD `cart_label` text NOT NULL DEFAULT '';
