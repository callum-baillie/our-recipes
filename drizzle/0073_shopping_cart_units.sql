-- Legacy cart units are unreviewed: do not guess from demand or free-text labels.
ALTER TABLE `shopping_list_items` ADD COLUMN `cart_unit` text;
