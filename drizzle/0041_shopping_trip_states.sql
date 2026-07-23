ALTER TABLE `shopping_list_items` ADD `shopping_state` text DEFAULT 'to_buy' NOT NULL;
--> statement-breakpoint
UPDATE `shopping_list_items` SET `shopping_state` = 'sourced' WHERE `checked` = 1;
